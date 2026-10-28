import { describe, it, expect } from "vitest";
import { RedactorService } from "../src/services/redactor.js";

describe("RedactorService", () => {
  it("redacts email addresses", async () => {
    const service = new RedactorService();
    const result = await service.redact("Contact me at user@example.com for info.");
    expect(result.hasRedactions).toBe(true);
    expect(result.text).toBe("Contact me at [EMAIL_1] for info.");
    expect(result.count).toBe(1);
    expect(result.redactions[0].category).toBe("email");
    expect(result.redactions[0].original).toBe("user@example.com");
  });

  it("redacts API keys and tokens", async () => {
    const service = new RedactorService();
    const result = await service.redact("Key is sk-1234567890abcdef1234567890.");
    expect(result.hasRedactions).toBe(true);
    expect(result.text).toBe("Key is [REDACTED:API_KEY].");
    expect(result.count).toBe(1);
    expect(result.redactions[0].category).toBe("api-key");
    expect(result.redactions[0].original).toBe("sk-1234567890abcdef1234567890");
  });

  it("redacts IPv4 addresses", async () => {
    const service = new RedactorService();
    const result = await service.redact("Server running on 192.168.1.100 port 8080.");
    expect(result.hasRedactions).toBe(true);
    expect(result.text).toBe("Server running on [IP_ADDRESS_1] port 8080.");
    expect(result.count).toBe(1);
    expect(result.redactions[0].category).toBe("ip");
    expect(result.redactions[0].original).toBe("192.168.1.100");
  });

  it("respects enabled/disabled toggle", async () => {
    const service = new RedactorService();
    service.setEnabled(false);
    expect(service.isEnabled()).toBe(false);
    const result = await service.redact("user@example.com");
    expect(result.hasRedactions).toBe(false);
    expect(result.text).toBe("user@example.com");
    expect(result.count).toBe(0);
    expect(result.redactions).toEqual([]);
  });

  it("redacts additional PII types (phone numbers and names)", async () => {
    const service = new RedactorService();
    const result = await service.redact("Please call Dr. Alice Grant at +1-555-0199 regarding the report.");
    expect(result.hasRedactions).toBe(true);
    expect(result.text).toContain("[PHONE_1]");
    expect(result.text).not.toContain("+1-555-0199");
  });

  it("supports toggling individual rules", async () => {
    const service = new RedactorService();

    // Disable email rule
    expect(service.toggleRule("email", false)).toBe(false);
    const emailResult = await service.redact("Send email to test@domain.org");
    expect(emailResult.hasRedactions).toBe(false);
    expect(emailResult.text).toBe("Send email to test@domain.org");

    // API key rule remains active
    const keyResult = await service.redact("Token sk-1234567890abcdef1234567890 here");
    expect(keyResult.hasRedactions).toBe(true);
    expect(keyResult.text).toContain("[REDACTED:API_KEY]");

    // Re-enable email rule
    expect(service.toggleRule("email", true)).toBe(true);
    const recheck = await service.redact("Send email to test@domain.org");
    expect(recheck.hasRedactions).toBe(true);
    expect(recheck.text).toContain("[EMAIL_1]");
  });

  it("supports restoring redacted native text", async () => {
    const service = new RedactorService();
    const result = await service.redact("Meeting with alice@corp.com tomorrow");
    expect(result.hasRedactions).toBe(true);
    expect(result.restore).toBeDefined();
    const restored = result.restore!(result.text);
    expect(restored).toBe("Meeting with alice@corp.com tomorrow");
  });

  it("handles empty, whitespace, and nullish strings gracefully", async () => {
    const service = new RedactorService();
    const resEmpty = await service.redact("");
    expect(resEmpty.hasRedactions).toBe(false);
    expect(resEmpty.text).toBe("");

    const resWhitespace = await service.redact("   ");
    expect(resWhitespace.hasRedactions).toBe(false);
  });

  it("introspects rules with getRules and getConfig", () => {
    const service = new RedactorService();
    const rules = service.getRules();
    expect(rules.length).toBe(23);
    const config = service.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.maskUserInputs).toBe(true);
    expect(config.maskToolResults).toBe(true);
    expect(config.maskContextMessages).toBe(true);
    expect(config.notifyOnRedact).toBe(true);
  });
});
