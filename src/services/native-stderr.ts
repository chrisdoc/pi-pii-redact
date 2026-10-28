import { createRequire } from "node:module";

/**
 * LiteRT, bundled inside the native model, writes INFO/WARNING lines straight to
 * file descriptor 2 the first time the model runs ("Attempting to load GPU
 * accelerator", "XNNPACK CPU accelerator registered", ...). That bypasses
 * process.stderr, so in Pi's TUI the lines land on top of the rendered screen.
 * LiteRT exports no log-level API, so the only fix is to point fd 2 at /dev/null
 * while the model initializes and restore it afterwards.
 *
 * Set PI_PII_REDACT_NATIVE_LOGS=1 to keep the native output for debugging.
 */

interface Libc {
  dup(fd: number): number;
  dup2(fd: number, fd2: number): number;
  close(fd: number): number;
  open(path: string, flags: number): number;
}

const O_WRONLY = 1;
const LIBC: Partial<Record<NodeJS.Platform, string>> = {
  linux: "libc.so.6",
  darwin: "libSystem.B.dylib",
};

let libc: Libc | null | undefined;
let depth = 0;
let savedFd = -1;

function loadLibc(): Libc | null {
  if (libc !== undefined) return libc;
  libc = null;
  const name = LIBC[process.platform];
  if (!name) return libc;
  try {
    const koffi = createRequire(import.meta.url)("koffi") as typeof import("koffi");
    const lib = koffi.load(name);
    libc = {
      dup: lib.func("int dup(int)"),
      dup2: lib.func("int dup2(int, int)"),
      close: lib.func("int close(int)"),
      open: lib.func("int open(const char *, int)"),
    };
  } catch {
    // koffi or libc unavailable: leave stderr alone.
  }
  return libc;
}

function silence(c: Libc): void {
  if (depth++ > 0) return;
  const saved = c.dup(2);
  if (saved < 0) return;
  const nul = c.open("/dev/null", O_WRONLY);
  if (nul < 0) {
    c.close(saved);
    return;
  }
  c.dup2(nul, 2);
  c.close(nul);
  savedFd = saved;
}

function restore(c: Libc): void {
  if (--depth > 0 || savedFd < 0) return;
  c.dup2(savedFd, 2);
  c.close(savedFd);
  savedFd = -1;
}

/**
 * Runs `fn` with process-level stderr (fd 2) redirected to /dev/null. Overlapping
 * calls share one redirect, which is restored when the last one settles. Falls
 * back to just running `fn` where the redirect is not possible.
 */
export async function withSilencedNativeStderr<T>(fn: () => Promise<T>): Promise<T> {
  const c = process.env.PI_PII_REDACT_NATIVE_LOGS ? null : loadLibc();
  if (!c) return fn();
  silence(c);
  try {
    return await fn();
  } finally {
    restore(c);
  }
}
