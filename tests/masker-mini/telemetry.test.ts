import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveMaskerFiles } from "../../src/services/masker-mini/model-files.js";

const LOADER = new URL("../../eval/ts-resolve.mjs", import.meta.url).href;
const ENGINE = new URL("../../src/services/masker-mini/index.ts", import.meta.url).href;

const CHILD = `
const { MaskerMini } = await import(${JSON.stringify(ENGINE)});
const model = await MaskerMini.load();
const { items } = await model.redaction("Mein Name ist Jürgen Müller", { labels: ["GIVEN_NAME", "SURNAME"], minimumConfidence: 0.5 });
if (items.length === 0) throw new Error("no detections");
model.dispose();
`;

function findMicrosoftDirs(root: string): string[] {
  return fs
    .readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => path.basename(entry).toLowerCase() === "microsoft");
}

describe("onnxruntime telemetry and clean exit", () => {
  it("disables ORT telemetry and exits cleanly across repeated runs", async () => {
    const modelDirectory = (await resolveMaskerFiles({ directory: process.env.PI_PII_REDACT_MODEL_DIR || undefined }))
      .directory;

    for (let run = 0; run < 5; run++) {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "pii-telemetry-"));
      try {
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          HOME: home,
          XDG_CACHE_HOME: path.join(home, ".cache"),
          PI_PII_REDACT_MODEL_DIR: modelDirectory,
        };
        delete env.ORT_DISABLE_TELEMETRY; // the engine must set it itself
        const result = spawnSync(
          process.execPath,
          ["--import", LOADER, "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", CHILD],
          { env, encoding: "utf8", timeout: 60_000 }
        );
        expect(result.stderr).not.toMatch(/Error/);
        expect(result.signal).toBeNull();
        expect(result.status).toBe(0);
        expect(findMicrosoftDirs(home)).toEqual([]);
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    }
  }, 120_000);
});
