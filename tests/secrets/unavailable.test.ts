import { describe, it, expect, vi, beforeEach } from "vitest";
import { rand } from "./fake-keys.js";

// A throwing factory is wrapped by vitest; a throwing export simulates the failed load.
vi.mock("@visulima/secret-scanner", () => ({
  get scanString(): never {
    throw new Error("native binding missing");
  },
}));

import {
  scanSecrets,
  getSecretScannerStatus,
  getSecretScannerError,
  resetSecretScanner,
} from "../../src/services/secrets/index.js";
import { RedactorService } from "../../src/services/redactor.js";
import { createMockExtensionAPI } from "../mock-pi.js";
import { registerPiiCommands } from "../../src/commands/pii.js";

describe("secret scanner unavailable", () => {
  beforeEach(() => resetSecretScanner());

  it("returns [] without throwing and reports unavailable", async () => {
    expect(await scanSecrets("token = " + rand(32))).toEqual([]);
    expect(getSecretScannerStatus()).toBe("unavailable");
    expect(getSecretScannerError()).toContain("native binding missing");
  });

  it("still redacts PII through the redactor", async () => {
    const redactor = new RedactorService([], undefined, {
      loadOptions: { directory: process.env.PI_PII_REDACT_MODEL_DIR || undefined },
    });
    const result = await redactor.redact("Mail jane.doe@example.com password = " + rand(24));
    expect(result.text).not.toContain("jane.doe@example.com");
    expect(result.text).toMatch(/\[EMAIL_\d+#/);
    expect(getSecretScannerStatus()).toBe("unavailable");
  });

  it("/pii status reports the unavailable scanner", async () => {
    const redactor = new RedactorService([], undefined, {
      loadOptions: { directory: process.env.PI_PII_REDACT_MODEL_DIR || undefined },
    });
    await redactor.redact("api_key = " + rand(24));
    const pi = createMockExtensionAPI();
    registerPiiCommands(pi.api, redactor);
    const notify = vi.fn();
    await pi.getCommand("pii")!.handler("status", { ui: { notify, setStatus: vi.fn() } });
    expect(notify.mock.calls[0][0]).toContain("Secret scanner: unavailable: native binding missing");
  });
});
