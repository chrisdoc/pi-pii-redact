import { describe, it, expect, vi, beforeEach } from "vitest";
import { rand } from "./fake-keys.js";

const scanString = vi.fn();
const rulesetPath = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const path = require("node:path") as typeof import("node:path");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pii-ruleset-")), "ruleset.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ rules: [{ id: "kingfisher.x", source: "kingfisher" }, { id: "okta-access-token", source: "gitleaks", regex: "(?i)[\\w.-]{0,50}?(?:okta)" }] })
  );
  return file;
});
vi.mock("@visulima/secret-scanner", () => ({
  scanString: (...args: unknown[]) => scanString(...args),
  bundledConfigPath: rulesetPath,
}));

import { scanSecrets, getSecretScannerStatus, resetSecretScanner, warmUpSecretScanner } from "../../src/services/secrets/index.js";

describe("scanSecrets (mocked scanner)", () => {
  beforeEach(() => {
    scanString.mockReset();
    resetSecretScanner();
  });

  it("always calls scanString with validation disabled and no allowed hosts", async () => {
    scanString.mockResolvedValue([]);
    await scanSecrets("token = " + rand(32));
    // One warm-up scan during load, then the real scan; every call must disable validation.
    expect(scanString).toHaveBeenCalledTimes(2);
    for (const [, file, options] of scanString.mock.calls) {
      expect(file).toBe("input.txt");
      expect(options.config.validate).toBe(false);
      expect(options.config.validateAllowedHosts).toEqual([]);
      expect(options.verbose).toBe(false);
      // Only the trimmed ruleset is used: the bundled gitleaks rules are not compiled.
      expect(options.config.extendBundled).toBe(false);
      expect(options.config.inline.rules.map((r: { id: string }) => r.id)).toEqual(["kingfisher.x"]);
    }
    expect(getSecretScannerStatus()).toBe("ready");
  });

  it("warmUpSecretScanner loads and warms the scanner in the background, once", async () => {
    scanString.mockResolvedValue([]);
    warmUpSecretScanner();
    warmUpSecretScanner();
    await vi.waitFor(() => expect(getSecretScannerStatus()).toBe("ready"));
    expect(scanString).toHaveBeenCalledTimes(1);
    await scanSecrets("token = " + rand(32));
    expect(scanString).toHaveBeenCalledTimes(2);
  });

  it("does not call the scanner (or load it) when the gate fails", async () => {
    expect(await scanSecrets("Hello, my name is Jane.")).toEqual([]);
    expect(scanString).not.toHaveBeenCalled();
    expect(getSecretScannerStatus()).toBe("unloaded");
  });

  it("maps findings to UTF-16 offsets and applies span selection", async () => {
    const secret = rand(30);
    const text = `héllo 😀 token=${secret} tail`;
    const generic = `token=${secret}`;
    scanString.mockResolvedValue([
      { ruleId: "generic", confidence: "low", secret: generic, startLine: 1, startColumn: 1, endLine: 1, endColumn: 9 },
      { ruleId: "specific", confidence: "high", secret, startLine: 1, startColumn: 99, endLine: 1, endColumn: 99 },
      { ruleId: "short", confidence: "high", secret: "abc", startLine: 1, startColumn: 1, endLine: 1, endColumn: 4 },
      { ruleId: "missing", confidence: "high", secret: rand(20), startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
    ]);
    const spans = await scanSecrets(text);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ ruleId: "specific", confidence: "high" });
    expect(text.slice(spans[0].start, spans[0].end)).toBe(secret);
  });

  it("returns [] when the scan itself throws", async () => {
    scanString.mockRejectedValue(new Error("boom"));
    expect(await scanSecrets("token = " + rand(32))).toEqual([]);
  });
});
