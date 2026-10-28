import { describe, it, expect, beforeEach } from "vitest";
import { PiTestHarness, assertRedactedEmail, assertRedactedApiKey } from "./e2e/harness.js";
import { RedactorService } from "../src/services/redactor.js";

describe("Challenger 2 Empirical Verification: Hooks, Concurrency, and False Positives", () => {
  let harness: PiTestHarness;
  let redactor: RedactorService;

  beforeEach(async () => {
    harness = new PiTestHarness();
    redactor = harness.initCustomExtension();
    await redactor.init();
  });

  // =========================================================================
  // 1. Extreme Payloads on Hooks
  // =========================================================================
  describe("1. Extreme Payloads & Malformed Inputs on Hooks", () => {
    describe("1.1 Input Hook", () => {
      it("handles null / undefined / empty string text gracefully", async () => {
        expect(await harness.triggerInput("")).toBeUndefined();
        expect(await harness.triggerInput("   ")).toBeUndefined();
        expect(await harness.triggerInput(null as any)).toBeUndefined();
        expect(await harness.triggerInput(undefined as any)).toBeUndefined();
        expect(await harness.triggerInput(12345 as any)).toBeUndefined();
      });

      it("reproduces [BUG] unhandled TypeError when input hook receives null or undefined event", async () => {
        const handlers = harness.api.getHookHandlers("input");
        expect(handlers.length).toBeGreaterThan(0);

        for (const handler of handlers) {
          // Calling handler with null event throws TypeError in src/hooks/index.ts:17
          await expect(async () => {
            await handler(null as any, harness.ctx as any);
          }).rejects.toThrow(/Cannot read properties of null/);

          await expect(async () => {
            await handler(undefined as any, harness.ctx as any);
          }).rejects.toThrow(/Cannot read properties of undefined/);
        }
      });
    });

    describe("1.2 Tool Result Hook", () => {
      it("handles null or malformed tool_result events", async () => {
        expect(await harness.triggerToolResult("test", null as any)).toBeUndefined();
        expect(await harness.triggerToolResult("test", undefined as any)).toBeUndefined();
        expect(await harness.triggerToolResult("test", [] as any)).toBeUndefined();
        expect(await harness.triggerToolResult("test", "not an array" as any)).toBeUndefined();
      });

      it("handles deeply nested non-text objects and corrupt text items", async () => {
        const content = [
          null,
          undefined,
          "just a string",
          12345,
          {},
          { type: null },
          { type: "text" }, // missing text property
          { type: "text", text: null },
          { type: "text", text: undefined },
          { type: "text", text: 99999 },
          { type: "custom", deeply: { nested: { array: [1, 2, { three: "ok" }] } } },
          { type: "text", text: "Contact alert@service.com now" },
        ];

        const res = await harness.triggerToolResult("stress_tool", content as any);
        expect(res).toBeDefined();
        expect(res?.content).toBeDefined();

        // The sensitive item must be redacted
        const redactedBlock = res?.content.find(
          (c: any) => c && c.type === "text" && typeof c.text === "string" && c.text.includes("[EMAIL")
        );
        expect(redactedBlock).toBeDefined();
        expect(redactedBlock.text).not.toContain("alert@service.com");

        // Non-text and malformed items should be preserved safely
        expect(res?.content[0]).toBeNull();
        expect(res?.content[1]).toBeUndefined();
        expect(res?.content[2]).toBe("just a string");
        expect(res?.content[3]).toBe(12345);
        expect(res?.content[6]).toEqual({ type: "text" });
        expect(res?.content[10].deeply.nested.array[2].three).toBe("ok");
      });
    });

    describe("1.3 Context Hook", () => {
      it("handles null or malformed context events", async () => {
        expect(await harness.triggerContext(null as any)).toBeUndefined();
        expect(await harness.triggerContext(undefined as any)).toBeUndefined();
        expect(await harness.triggerContext([] as any)).toBeUndefined();
        expect(await harness.triggerContext("not an array" as any)).toBeUndefined();
      });

      it("handles null message items and deeply nested non-text structures", async () => {
        const messages = [
          null,
          undefined,
          "scalar string message",
          12345,
          { role: "user", content: null },
          { role: "assistant", content: undefined },
          { role: "user", content: 12345 },
          { role: "assistant", content: [] },
          {
            role: "assistant",
            content: [
              null,
              undefined,
              "raw string in blocks",
              { type: null },
              { type: "tool_use", id: "t1", input: { deep: { nested: { secret: "clean" } } } },
              { type: "text", text: null },
              { type: "text", text: "Report to security@corp.com" },
            ],
          },
        ];

        const res = await harness.triggerContext(messages as any);
        expect(res).toBeDefined();
        expect(res?.messages).toBeDefined();

        // Null and malformed messages safely preserved
        expect(res?.messages[0]).toBeNull();
        expect(res?.messages[1]).toBeUndefined();
        expect(res?.messages[2]).toBe("scalar string message");
        expect(res?.messages[3]).toBe(12345);
        expect(res?.messages[4]).toEqual({ role: "user", content: null });

        // Sanitized text block inside complex structure
        const lastMsg = res?.messages[8];
        expect(Array.isArray(lastMsg.content)).toBe(true);
        const textBlock = lastMsg.content.find(
          (b: any) => b && b.type === "text" && typeof b.text === "string" && b.text.includes("[EMAIL")
        );
        expect(textBlock).toBeDefined();
        expect(textBlock.text).not.toContain("security@corp.com");
      });
    });
  });

  // =========================================================================
  // 2. False Positive Resistance
  // =========================================================================
  describe("2. False Positive Resistance on Natural Sentences", () => {
    it("does not redact 'Score was 12-34'", async () => {
      const text = "Score was 12-34";
      const res = await redactor.redact(text);
      expect(res.hasRedactions).toBe(false);
      expect(res.text).toBe(text);
    });

    it("does not redact 'Short token prefix'", async () => {
      const text = "Short token prefix";
      const res = await redactor.redact(text);
      expect(res.hasRedactions).toBe(false);
      expect(res.text).toBe(text);
    });

    it("evaluates 'Call 911 in emergency' behavior", async () => {
      const text = "Call 911 in emergency";
      const res = await redactor.redact(text);
      expect(res.hasRedactions).toBe(false);
      expect(res.text).toBe(text);
    });

    it("does not redact 'May I help you'", async () => {
      const text = "May I help you";
      const res = await redactor.redact(text);
      expect(res.hasRedactions).toBe(false);
      expect(res.text).toBe(text);
    });

    it("does not redact common English conversational phrases", async () => {
      const phrases = [
        "Will you please help me?",
        "I was born in May or June.",
        "Let us meet in the central park tomorrow.",
        "Error 404: File not found on port 8080.",
        "The screen aspect ratio is 16:9.",
        "The temperature was 72 degrees Fahrenheit.",
        "The recipe calls for 1-2 cups of water.",
        "Order #12345 was processed successfully.",
      ];

      for (const phrase of phrases) {
        const res = await redactor.redact(phrase);
        expect(res.hasRedactions).toBe(false);
        expect(res.text).toBe(phrase);
      }
    });

    it("preserves genuine PII detection while rejecting near misses", async () => {
      const genuinePhone = "Please call 555-123-4567 for support";
      const resPhone = await redactor.redact(genuinePhone);
      expect(resPhone.hasRedactions).toBe(true);
      expect(resPhone.text).not.toContain("555-123-4567");

      const genuineEmail = "Send invoice to billing@enterprise.com";
      const resEmail = await redactor.redact(genuineEmail);
      expect(resEmail.hasRedactions).toBe(true);
      expect(resEmail.text).not.toContain("billing@enterprise.com");
    });
  });

  // =========================================================================
  // 3. Concurrency & Race Conditions Across Multiple Async Turns
  // =========================================================================
  describe("3. Concurrent Execution Across Multiple Async Turns", () => {
    it("preserves per-turn closure isolation across 50 simultaneous parallel redactions", async () => {
      const count = 50;
      const tasks = Array.from({ length: count }, async (_, i) => {
        const email = `concurrent_user_${i}@example.org`;
        const key = `sk-proj_conc_${i}_1234567890abcdef1234567890`;
        const prompt = `Request ${i}: User ${email} with credential ${key}`;

        const result = await redactor.redact(prompt);
        expect(result.hasRedactions).toBe(true);
        expect(result.text).not.toContain(email);
        expect(result.text).not.toContain(key);

        const simulatedLlmResponse = `Processing for [EMAIL_1] using token [API_KEY_1].`;
        const restored = result.restore(simulatedLlmResponse);

        expect(restored).toContain(email);
        expect(restored).toContain(key);
        expect(restored).not.toContain("[EMAIL_1]");
        expect(restored).not.toContain("[API_KEY_1]");
        return { i, email, key, result, restored };
      });

      const finished = await Promise.all(tasks);
      expect(finished.length).toBe(count);
    });

    it("handles concurrent redaction and restore operations simultaneously", async () => {
      const emailA = "simul_a@test.com";
      const keyA = "sk-simula1234567890abcdef12345";
      const emailB = "simul_b@test.com";
      const keyB = "sk-simulb1234567890abcdef12345";

      const [turnA, turnB] = await Promise.all([
        redactor.redact(`A: ${emailA} ${keyA}`),
        redactor.redact(`B: ${emailB} ${keyB}`),
      ]);

      const restoredA = turnA.restore("A: [EMAIL_1] [API_KEY_1]");
      const restoredB = turnB.restore("B: [EMAIL_1] [API_KEY_1]");

      expect(restoredA).toBe(`A: ${emailA} ${keyA}`);
      expect(restoredB).toBe(`B: ${emailB} ${keyB}`);
    });

    it("verifies service-level restore behavior under rapid interleaved overlay turns", async () => {
      const res1 = await redactor.redact("Turn 1: contact alice@test.com with sk-alice1234567890abcdef12345");
      const res2 = await redactor.redact("Turn 2: contact bob@test.com with sk-bob1234567890abcdef12345");

      expect(res1.restore("Email: [EMAIL_1], Key: [API_KEY_1]")).toBe("Email: alice@test.com, Key: sk-alice1234567890abcdef12345");
      expect(res2.restore("Email: [EMAIL_1], Key: [API_KEY_1]")).toBe("Email: bob@test.com, Key: sk-bob1234567890abcdef12345");

      // For overlay rules, lastRestoreMap overwrites cleanly
      const serviceRestored = redactor.restore("Email: [EMAIL_1], Key: [API_KEY_1]");
      expect(serviceRestored).toBe("Email: bob@test.com, Key: sk-bob1234567890abcdef12345");
    });

    it("verifies service-level restore reflects latest turn without native entity shadowing", async () => {
      // Turn 1 with phone number
      const phone1 = "555-111-1111";
      const res1 = await redactor.redact(`Turn 1: contact me at ${phone1}`);
      expect(res1.text).toContain("[PHONE_1]");

      // Turn 2 with different phone number
      const phone2 = "555-222-2222";
      const res2 = await redactor.redact(`Turn 2: contact me at ${phone2}`);
      expect(res2.text).toContain("[PHONE_1]");

      // Result-level restore closures are correct and isolated
      expect(res1.restore("Call [PHONE_1]")).toBe(`Call ${phone1}`);
      expect(res2.restore("Call [PHONE_1]")).toBe(`Call ${phone2}`);

      // Service-level restore:
      // Verifies that service.restore restores using mappings from the most recent redaction (Turn 2)
      const serviceRestored = redactor.restore("Call [PHONE_1]");
      expect(serviceRestored).toBe(`Call ${phone2}`);
    });
  });
});
