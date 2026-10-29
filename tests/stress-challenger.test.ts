import { describe, it, expect, vi } from "vitest";
import { MaskerMini } from "../src/services/masker-mini/index.js";
import { realLoad } from "./setup-shared-model.js";
import { RedactorService } from "../src/services/redactor.js";

describe("Challenger 1 Stress & Adversarial Test Suite", () => {
  // =========================================================================
  // 1. Multi-PII Payloads
  // =========================================================================
  describe("1. Multi-PII Payloads & Interleaved Spans", () => {
    it("redacts complex mixed payload containing names, emails, phones, credit cards, IPs, and API keys", async () => {
      const service = new RedactorService();
      const payload =
        "Security incident report filed by Alice Smith (alice.smith@corp.example.com, phone +1-555-0144). " +
        "Unauthorized access from 192.168.10.45 using compromised token sk-1234567890abcdef1234567890. " +
        "Customer card 4532-0150-1234-5671 was queried.";

      const result = await service.redact(payload);

      expect(result.hasRedactions).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(5);

      // Verify none of the raw sensitive values remain in the redacted text
      expect(result.text).not.toContain("alice.smith@corp.example.com");
      expect(result.text).not.toContain("+1-555-0144");
      expect(result.text).not.toContain("192.168.10.45");
      expect(result.text).not.toContain("sk-1234567890abcdef1234567890");
      expect(result.text).not.toContain("4532-0150-1234-5671");

      // Verify restoration restores all items accurately
      const restored = result.restore(result.text);
      expect(restored).toBe(payload);
    });

    it("handles multiple occurrences of identical PII entities scattered across text", async () => {
      const service = new RedactorService();
      const payload =
        "Notice: Contact support@service.io for assistance. If support@service.io is unavailable, email support@service.io again.";

      const result = await service.redact(payload);

      expect(result.hasRedactions).toBe(true);
      expect(result.text).not.toContain("support@service.io");

      // Restoring the redacted text must reproduce the exact original
      const restored = result.restore(result.text);
      expect(restored).toBe(payload);
    });

    it("handles tightly packed adjacent PII delimiters without losing entities", async () => {
      const service = new RedactorService();
      const payload = "admin@internal.net,10.20.30.40,sk-9999999999888888888877777";
      const result = await service.redact(payload);

      expect(result.hasRedactions).toBe(true);
      expect(result.text).not.toContain("admin@internal.net");
      expect(result.text).not.toContain("10.20.30.40");
      expect(result.text).not.toContain("sk-9999999999888888888877777");

      const restored = result.restore(result.text);
      expect(restored).toBe(payload);
    });

    it("checks substring collision behavior between short names and longer regular words", async () => {
      const service = new RedactorService();
      const payload = "Hello Dan, be careful of the Danger in Jordan.";
      const result = await service.redact(payload);

      // Defect verification: Does the redacted text mutilate regular English words?
      // "Danger" should NOT become "[GIVEN_NAME_2#xxxx]ger"
      expect(result.text).not.toContain("]ger");
      expect(result.text).toContain("Danger");

      const robPayload = "Call Rob regarding the problem with our robot.";
      const robResult = await service.redact(robPayload);
      expect(robResult.text).toContain("problem");
      expect(robResult.text).toContain("robot");
    });
  });

  // =========================================================================
  // 2. LLM Response Restoration Accuracy
  // =========================================================================
  describe("2. LLM Response Restoration Accuracy", () => {
    it("accurately restores placeholders wrapped in complex markdown formatting", async () => {
      const service = new RedactorService();
      const text = "Notify developer dev@domain.com with key sk-abcdef1234567890abcdef123456";
      const result = await service.redact(text);

      expect(result.hasRedactions).toBe(true);
      const emailPlaceholder = result.redactions.find(r => r.original === "dev@domain.com")?.masked!;
      const keyPlaceholder = result.redactions.find(r => r.original === "sk-abcdef1234567890abcdef123456")?.masked!;

      // Simulate LLM markdown styling
      const llmMarkdown =
        `Here is the plan:\n` +
        `- User: **${emailPlaceholder}**\n` +
        `- Auth: \`${keyPlaceholder}\`\n` +
        `- Link: [Send Mail](mailto:${emailPlaceholder})`;

      const restored = result.restore(llmMarkdown);

      expect(restored).toContain("**dev@domain.com**");
      expect(restored).toContain("`sk-abcdef1234567890abcdef123456`");
      expect(restored).toContain("[Send Mail](mailto:dev@domain.com)");
    });

    it("accurately restores placeholders with trailing punctuation and brackets", async () => {
      const service = new RedactorService();
      const text = "Reach us at team@company.com or 192.168.1.1.";
      const result = await service.redact(text);

      const emailPlaceholder = result.redactions.find(r => r.original === "team@company.com")?.masked!;
      const ipPlaceholder = result.redactions.find(r => r.original === "192.168.1.1")?.masked!;

      const llmPunctuation =
        `Is your email ${emailPlaceholder}? Or maybe (${emailPlaceholder})! ` +
        `Check IP: "${ipPlaceholder}", or "${ipPlaceholder}:8080".`;

      const restored = result.restore(llmPunctuation);

      expect(restored).toBe(
        `Is your email team@company.com? Or maybe (team@company.com)! ` +
        `Check IP: "192.168.1.1", or "192.168.1.1:8080".`
      );
    });

    it("accurately restores repeated occurrences of the same placeholder in LLM output", async () => {
      const service = new RedactorService();
      const text = "Alert for agent@ops.org";
      const result = await service.redact(text);
      const ph = result.redactions[0].masked;

      const llmResponse = `Sent notice to ${ph}. Also copied ${ph} on ticket. Confirmed by ${ph}.`;
      const restored = result.restore(llmResponse);

      expect(restored).toBe(
        "Sent notice to agent@ops.org. Also copied agent@ops.org on ticket. Confirmed by agent@ops.org."
      );
    });

    it("accurately restores placeholders embedded inside JSON payloads", async () => {
      const service = new RedactorService();
      const text = "Database at 10.0.0.5 requires token sk-secret12345678901234567890 and email admin@db.internal";
      const result = await service.redact(text);

      const emailPh = result.redactions.find(r => r.original === "admin@db.internal")?.masked!;
      const keyPh = result.redactions.find(r => r.original === "sk-secret12345678901234567890")?.masked!;
      const ipPh = result.redactions.find(r => r.original === "10.0.0.5")?.masked!;

      const jsonString = JSON.stringify({
        connection: { host: ipPh, token: keyPh },
        maintainer: emailPh,
        active: true,
      });

      const restoredJson = result.restore(jsonString);
      const parsed = JSON.parse(restoredJson);

      expect(parsed.connection.host).toBe("10.0.0.5");
      expect(parsed.connection.token).toBe("sk-secret12345678901234567890");
      expect(parsed.maintainer).toBe("admin@db.internal");
      expect(parsed.active).toBe(true);
    });

    it("safely handles LLM responses with no placeholders or invalid/hallucinated placeholders", async () => {
      const service = new RedactorService();
      const text = "Email is user@domain.com";
      const result = await service.redact(text);

      // LLM response without any placeholders
      const plainResponse = "The request has been processed successfully.";
      expect(result.restore(plainResponse)).toBe(plainResponse);

      // LLM response with hallucinated placeholder
      const hallucinated = "Card used was [CREDIT_CARD_999#zzzz] and token [API_KEY_99#zzzz] and legacy [EMAIL_1] [REDACTED:API_KEY].";
      expect(result.restore(hallucinated)).toBe(hallucinated);

      // Null, empty, or non-string inputs
      expect(result.restore("")).toBe("");
      expect((result.restore as any)(null)).toBe("");
      expect((result.restore as any)(undefined)).toBe("");
    });
  });

  // =========================================================================
  // 3. Edge Case 5 Native Bypass Verification
  // =========================================================================
  describe("3. Edge Case 5 Native Bypass Verification", () => {
    it("completely bypasses native inference when all native model rules are disabled", async () => {
      const service = new RedactorService();

      // Disable all rules that do NOT have a custom regex pattern (i.e. all native rules) and email
      for (const rule of service.getRules()) {
        if (!rule.pattern || rule.id === "email" || rule.id === "phone") {
          service.toggleRule(rule.id, false);
        }
      }

      // Input full of natural language PII (names, emails, phones)
      const input = "Please call John Doe at +1-555-0199 or email john.doe@example.com in New York.";
      const result = await service.redact(input);

      // Native inference must be completely bypassed: ZERO redactions
      expect(result.hasRedactions).toBe(false);
      expect(result.count).toBe(0);
      expect(result.text).toBe(input);
    });

    it("retains regex overlay redactions when all native rules are disabled but regex rules remain enabled", async () => {
      const service = new RedactorService();

      // Disable all native rules and email
      for (const rule of service.getRules()) {
        if (!rule.pattern || rule.id === "email" || rule.id === "phone") {
          service.toggleRule(rule.id, false);
        }
      }

      // Input containing both native PII and secret tokens
      const input =
        "Developer Jane Doe (jane@example.com) generated API key sk-1234567890abcdef1234567890 and visited 172.16.0.1";
      const result = await service.redact(input);

      // Native PII (Jane Doe, jane@example.com) should NOT be redacted
      expect(result.text).toContain("Jane Doe");
      expect(result.text).toContain("jane@example.com");

      // Secret tokens and IP overlay SHOULD still be redacted
      expect(result.text).not.toContain("sk-1234567890abcdef1234567890");
      expect(result.text).toMatch(/\[API_KEY_\d+#[a-z0-9]{4}\]/);
      expect(result.text).not.toContain("172.16.0.1");

      const restored = result.restore(result.text);
      expect(restored).toBe(input);
    });

    it("redacts only the selectively enabled native label and nothing else", async () => {
      const service = new RedactorService();

      // Disable all rules
      for (const rule of service.getRules()) {
        service.toggleRule(rule.id, false);
      }

      // Selectively re-enable ONLY "email"
      expect(service.toggleRule("email", true)).toBe(true);

      const input = "Contact Alice at alice@mail.com, phone 555-123-4567, token sk-1234567890abcdef1234567890.";
      const result = await service.redact(input);

      expect(result.hasRedactions).toBe(true);
      // Email must be redacted
      expect(result.text).not.toContain("alice@mail.com");
      expect(result.text).toMatch(/\[EMAIL_\d+#[a-z0-9]{4}\]/);

      // Phone, Name, and API key must NOT be redacted because their rules are disabled
      expect(result.text).toContain("Alice");
      expect(result.text).toContain("555-123-4567");
      expect(result.text).toContain("sk-1234567890abcdef1234567890");
    });
  });

  // =========================================================================
  // 4. Concurrency & Race Conditions
  // =========================================================================
  describe("4. Concurrency & Race Conditions", () => {
    it("handles 10 concurrent calls to redact() on a fresh uninitialized service", async () => {
      const service = new RedactorService();

      const emails = Array.from({ length: 10 }, (_, i) => `worker${i}@stressdomain.com`);
      const inputs = emails.map(email => `Testing concurrent prompt with ${email} for user.`);

      // Launch all 10 calls in parallel
      const promises = inputs.map(text => service.redact(text));
      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      results.forEach((res, i) => {
        if (!res.hasRedactions) {
          console.error(`Concurrency failure at index ${i}: text="${res.text}" email="${emails[i]}"`);
        }
        expect(res.hasRedactions).toBe(true);
        expect(res.text).not.toContain(emails[i]);
        expect(res.restore(res.text)).toBe(inputs[i]);
      });
    }, 15000);

    it("handles re-initialization cleanly after dispose()", async () => {
      // Bypass the shared model for this test so dispose() and reload are real.
      const loadSpy = vi.mocked(MaskerMini.load);
      loadSpy.mockImplementationOnce(realLoad).mockImplementationOnce(realLoad);
      const callsBefore = loadSpy.mock.calls.length;
      const service = new RedactorService();

      // First run
      const res1 = await service.redact("Initial email test1@domain.com");
      expect(res1.hasRedactions).toBe(true);
      const first = await service.getRedactInstance();
      const disposeSpy = vi.spyOn(first, "dispose");

      // Dispose engine
      service.dispose();
      expect(disposeSpy).toHaveBeenCalledTimes(1);

      // Second run after disposal reloads a fresh engine
      const res2 = await service.redact("Second email test2@domain.com");
      expect(loadSpy.mock.calls.length - callsBefore).toBe(2);
      expect(await service.getRedactInstance()).not.toBe(first);
      expect(res2.hasRedactions).toBe(true);
      expect(res2.text).not.toContain("test2@domain.com");
      expect(res2.restore(res2.text)).toBe("Second email test2@domain.com");
      service.dispose();
    });

    it("preserves independent restore closures across distinct concurrent redactions", async () => {
      const service = new RedactorService();

      const [resA, resB] = await Promise.all([
        service.redact("User alpha is alpha@company.com"),
        service.redact("User beta is beta@company.com"),
      ]);

      const llmA = `Response for ${resA.redactions[0].masked}`;
      const llmB = `Response for ${resB.redactions[0].masked}`;

      expect(resA.restore(llmA)).toBe("Response for alpha@company.com");
      expect(resB.restore(llmB)).toBe("Response for beta@company.com");
    });
  });

  // =========================================================================
  // 5. Extreme Inputs & Boundary Stress
  // =========================================================================
  describe("5. Extreme Inputs & Boundary Stress", () => {
    it("processes large payloads (~3,000 characters) without crash or memory exhaustion", async () => {
      const service = new RedactorService();

      const filler = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(25); // ~1,400 chars each
      const payload = `${filler} Contact emergency@datacenter.org immediately. ${filler}`;

      const startTime = performance.now();
      const result = await service.redact(payload);
      const duration = performance.now() - startTime;

      expect(result.hasRedactions).toBe(true);
      expect(result.text).not.toContain("emergency@datacenter.org");
      expect(result.restore(result.text)).toBe(payload);
      // Performance sanity check: 3k chars should finish well within the suite timeout, even under parallel test load
      expect(duration).toBeLessThan(25000);
    });

    it("handles unicode strings, multilingual scripts, and emojis", async () => {
      const service = new RedactorService();

      const unicodePayload =
        "🔥🚀 Chinese: 请联系张伟，邮箱是 zhang.wei@enterprise.cn\n" +
        "Japanese: 田中太郎への連絡先：090-1234-5678 または tanaka@tokyo.jp\n" +
        "Arabic: يرجى الاتصال بـ contact@riyadh.sa\n" +
        "Russian: Свяжитесь с ivan@moscow.ru\n" +
        "Secret: sk-1234567890abcdef1234567890 👨‍👩‍👧‍👦✨";

      const result = await service.redact(unicodePayload);

      expect(result.hasRedactions).toBe(true);
      expect(result.text).not.toContain("zhang.wei@enterprise.cn");
      expect(result.text).not.toContain("tanaka@tokyo.jp");
      expect(result.text).not.toContain("contact@riyadh.sa");
      expect(result.text).not.toContain("ivan@moscow.ru");
      expect(result.text).not.toContain("sk-1234567890abcdef1234567890");

      const restored = result.restore(result.text);
      expect(restored).toBe(unicodePayload);
    });

    it("handles adversarial inputs: control characters, null bytes, and near-miss ReDoS strings", async () => {
      const service = new RedactorService();

      // Null bytes and control characters
      const controlPayload = "Null byte \0 tab \t newline \r\n user@valid.com end.";
      const resControl = await service.redact(controlPayload);
      expect(resControl.hasRedactions).toBe(true);
      expect(resControl.text).not.toContain("user@valid.com");
      expect(resControl.restore(resControl.text)).toBe(controlPayload);

      // Near-miss ReDoS string for API key regex
      const redosNearMiss = "sk-" + "a".repeat(2000) + " trailing text";
      const start = performance.now();
      const resRedos = await service.redact(redosNearMiss);
      const elapsed = performance.now() - start;

      // Includes one native model pass; catastrophic regex backtracking on 2000 chars would take far longer
      expect(elapsed).toBeLessThan(2000);
      expect(resRedos.hasRedactions).toBe(true); // sk- with 2000 chars matches [a-zA-Z0-9_-]{20,}
      expect(resRedos.restore(resRedos.text)).toBe(redosNearMiss);

      // Extreme repetitive non-PII symbols
      const symbols = "@".repeat(1000) + " #".repeat(500) + " user@real.com";
      const resSymbols = await service.redact(symbols);
      expect(resSymbols.hasRedactions).toBe(true);
      expect(resSymbols.text).not.toContain("user@real.com");
      expect(resSymbols.restore(resSymbols.text)).toBe(symbols);
    });
  });
});
