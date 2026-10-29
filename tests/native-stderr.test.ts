import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MODULE_URL = new URL("../src/services/native-stderr.ts", import.meta.url).href;
const ROOT = fileURLToPath(new URL("..", import.meta.url));

// LiteRT writes to fd 2 from native code, which in-process spies on process.stderr
// cannot see. Run the real model in a child process and inspect its raw stderr.
function runChild(env: NodeJS.ProcessEnv = {}) {
  const script = `
    import { Redact } from "@desert-ant-labs/redact/native";
    import { withSilencedNativeStderr } from ${JSON.stringify(MODULE_URL)};
    const inst = await withSilencedNativeStderr(async () => {
      const r = await Redact.load();
      await r.redaction("warm up");
      return r;
    });
    await inst.redaction("Email john@example.com");
    process.stderr.write("stderr-restored\\n");
    inst.dispose();
    process.stderr.write("disposed\\n");
  `;
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
    { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", timeout: 60_000 }
  );
}

// On x64 Linux the native model sometimes segfaults while the process exits,
// after dispose() has returned. That teardown crash is outside this module, so
// the tests require the child to reach the "disposed" marker instead of a clean
// exit code.
function expectReachedDispose(result: ReturnType<typeof runChild>): void {
  expect(
    result.stderr,
    `child exited with status=${result.status} signal=${result.signal}\nstderr:\n${result.stderr}`
  ).toContain("disposed");
}

describe.runIf(process.platform === "linux" || process.platform === "darwin")(
  "withSilencedNativeStderr",
  () => {
    it("hides LiteRT setup logs and restores stderr afterwards", () => {
      const result = runChild({ PI_PII_REDACT_NATIVE_LOGS: "" });
      expectReachedDispose(result);
      expect(result.stderr).not.toMatch(/(INFO|WARNING): /);
      expect(result.stderr).toContain("stderr-restored");
    });

    it("keeps native logs when PI_PII_REDACT_NATIVE_LOGS is set", () => {
      const result = runChild({ PI_PII_REDACT_NATIVE_LOGS: "1" });
      expectReachedDispose(result);
      expect(result.stderr).toMatch(/(INFO|WARNING): /);
    });
  }
);
