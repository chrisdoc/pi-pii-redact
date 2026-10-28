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

  it("supports restoring redacted native text and LLM responses via result.restore", async () => {
    const service = new RedactorService();
    const prompt = "Register user bob@company.org with secret sk-1234567890abcdef1234567890 now.";
    const result = await service.redact(prompt);
    expect(result.hasRedactions).toBe(true);
    expect(result.restore).toBeDefined();

    // Simulate an LLM responding using the redacted placeholders
    const llmResponse = "Confirmed: Account [EMAIL_1] provisioned with auth key [REDACTED:API_KEY].";
    const restored = result.restore!(llmResponse);
    expect(restored).toBe(
      "Confirmed: Account bob@company.org provisioned with auth key sk-1234567890abcdef1234567890."
    );
  });

  it("supports service-level restore method across native and overlay placeholders", async () => {
    const service = new RedactorService();
    const text = "Connect to developer@platform.net using token sk-9876543210fedcba9876543210 on 10.0.0.1";
    await service.redact(text);

    const llmAnswer = "I will connect to [EMAIL_1] using token [REDACTED:API_KEY] at host [IP_ADDRESS_1].";
    const restored = service.restore(llmAnswer);
    expect(restored).toBe(
      "I will connect to developer@platform.net using token sk-9876543210fedcba9876543210 at host 10.0.0.1."
    );
  });

  it("handles empty, whitespace, and nullish strings gracefully", async () => {
    const service = new RedactorService();
    const resEmpty = await service.redact("");
    expect(resEmpty.hasRedactions).toBe(false);
    expect(resEmpty.text).toBe("");
    expect(resEmpty.restore("hello")).toBe("hello");

    const resWhitespace = await service.redact("   ");
    expect(resWhitespace.hasRedactions).toBe(false);

    expect(service.restore("")).toBe("");
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
