import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Pinned revision of https://huggingface.co/divergentlabs/masker-mini (Apache-2.0). */
export const MASKER_REVISION = "beb7235d454aa4488b6ee1cd47f417caa12a6d15";
const BASE_URL = "https://huggingface.co/divergentlabs/masker-mini/resolve";

export const MASKER_SHA256: Record<string, string> = {
  "config.json": "d1ec3865c686b5838ff9ffcc631bfc6794b5488d30c21c1a798cd1d4f9f26688",
  "tokenizer.json": "112a429fa5ee40b1ad8ec8a9c078312c725662f053647e32624eafc53f2c031e",
  "tokenizer_config.json": "71ae4d604bb97bd3c2fe964f81965dcd1479909e42cbd44f88e4508f8d0267fd",
  "onnx/model_int4.onnx": "338b7c2daf15168441a93c175b1fe6b364fef9a6ef7dee65e00c9159a76fdfae",
};

export interface MaskerFiles {
  directory: string;
  modelPath: string;
  configPath: string;
  tokenizerPath: string;
  tokenizerConfigPath: string;
}

export interface ResolveOptions {
  /** Use files from this directory (same layout as the HF repo); never downloads. */
  directory?: string;
  /** Override the cache root (default: $XDG_CACHE_HOME or ~/.cache). */
  cacheRoot?: string;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Override pinned hashes (tests). */
  hashes?: Record<string, string>;
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

/** Throws when the file's SHA-256 differs from `expected`. */
export async function verifyFile(file: string, expected: string): Promise<void> {
  const actual = await sha256File(file);
  if (actual !== expected) {
    throw new Error(`masker-mini: SHA-256 mismatch for ${file} (expected ${expected}, got ${actual})`);
  }
}

function cacheDirectory(cacheRoot?: string): string {
  const root = cacheRoot ?? process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  return path.join(root, "pi-pii-redact", "masker-mini", MASKER_REVISION);
}

async function download(rel: string, dest: string, expected: string, fetchImpl: typeof fetch): Promise<void> {
  const url = `${BASE_URL}/${MASKER_REVISION}/${rel}`;
  const res = await fetchImpl(url);
  if (!res.ok || !res.body) {
    throw new Error(`masker-mini: download failed for ${url} (HTTP ${res.status})`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  try {
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
    await verifyFile(tmp, expected);
    fs.renameSync(tmp, dest);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

/**
 * Resolves (and downloads if needed) the int4 model files and
 * verifies their SHA-256. User-supplied directories are verified but never modified.
 */
export async function resolveMaskerFiles(opts: ResolveOptions = {}): Promise<MaskerFiles> {
  const hashes = opts.hashes ?? MASKER_SHA256;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const needed = ["config.json", "tokenizer.json", "tokenizer_config.json", `onnx/model_int4.onnx`];
  const directory = opts.directory ?? cacheDirectory(opts.cacheRoot);

  for (const rel of needed) {
    const file = path.join(directory, rel);
    const expected = hashes[rel];
    if (!expected) throw new Error(`masker-mini: no pinned hash for ${rel}`);
    if (opts.directory) {
      if (!fs.existsSync(file)) throw new Error(`masker-mini: missing ${file}`);
      await verifyFile(file, expected);
      continue;
    }
    if (fs.existsSync(file)) {
      try {
        await verifyFile(file, expected);
        continue;
      } catch {
        fs.rmSync(file, { force: true }); // corrupt cache entry: fetch it again
      }
    }
    await download(rel, file, expected, fetchImpl);
  }

  return {
    directory,
    modelPath: path.join(directory, `onnx/model_int4.onnx`),
    configPath: path.join(directory, "config.json"),
    tokenizerPath: path.join(directory, "tokenizer.json"),
    tokenizerConfigPath: path.join(directory, "tokenizer_config.json"),
  };
}
