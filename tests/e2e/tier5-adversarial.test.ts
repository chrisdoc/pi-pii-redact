import { describe, it, expect, beforeEach } from "vitest";
import {
  PiTestHarness,
  assertRedactedEmail,
  assertRedactedApiKey,
  assertRedactedIp,
  assertRedactedPhone,
  assertRedactedCreditCard,
} from "./harness.js";

describe("Tier 5: Adversarial Stress & Concurrency Hardening (Challenger 2)", () => {
  let harness: PiTestHarness;

  beforeEach(async () => {
    harness = new PiTestHarness();
    await harness.initExtension();
  });

  // =========================================================================
  // Section 1: Rapid State Toggling & Concurrent Hook Processing
  // =========================================================================
  describe("1. Rapid State Toggling & Concurrent Execution", () => {
    it("1.1 survives rapid consecutive state toggle commands without desync", async () => {
      // Execute 30 rapid state toggles
      for (let i = 0; i < 30; i++) {
        await harness.executeCommand("toggle");
        const expectedStatus = i % 2 === 0 ? "PII: Off" : "PII: On";
        expect(harness.ctx.ui.getStatus("pii-redact")).toBe(expectedStatus);
      }
      // After 30 toggles (even number of toggles starting from On), state should be "PII: On"
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");

      // Verify input redaction works after rapid toggling
      const res = await harness.triggerInput("Contact me at user@example.com");
      expect(res?.action).toBe("transform");
      assertRedactedEmail(res?.text!, "user@example.com");
    });

    it("1.2 handles rapid alternating enable/disable commands concurrently with hooks", async () => {
      const email = "concurrency@stress-test.org";
      const key = "sk-stress1234567890abcdef1234567890";

      // Concurrently fire 20 hook requests while toggling state
      const hookTasks: Promise<any>[] = [];
      const toggleTasks: Promise<any>[] = [];

      for (let i = 0; i < 15; i++) {
        // Interleave commands
        if (i % 2 === 0) {
          toggleTasks.push(harness.executeCommand("disable"));
        } else {
          toggleTasks.push(harness.executeCommand("enable"));
        }

        // Interleave hooks
        hookTasks.push(harness.triggerInput(`User prompt ${i}: email ${email}`));
        hookTasks.push(
          harness.triggerToolResult("bash", [
            { type: "text", text: `Output ${i}: ${key}` },
          ])
        );
        hookTasks.push(
          harness.triggerContext([
            { role: "user", content: `Context turn ${i}: ${email}` },
          ])
        );
      }

      // All commands and hooks must settle without throwing unhandled exceptions
      await Promise.all([...toggleTasks, ...hookTasks]);

      // State must be deterministic once settled
      await harness.executeCommand("enable");
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");

      const finalInput = await harness.triggerInput(`Clean check: ${email}`);
      expect(finalInput?.action).toBe("transform");
      assertRedactedEmail(finalInput?.text!, email);
    });

    it("1.3 handles burst of 50 concurrent input redactions while active", async () => {
      const inputs = Array.from({ length: 50 }, (_, i) => `Query ${i}: admin${i}@company.com`);
      const results = await Promise.all(inputs.map((text) => harness.triggerInput(text)));

      expect(results.length).toBe(50);
      for (let i = 0; i < 50; i++) {
        expect(results[i]?.action).toBe("transform");
        expect(results[i]?.text).not.toContain(`admin${i}@company.com`);
        assertRedactedEmail(results[i]?.text!, `admin${i}@company.com`);
      }
    });
  });

  // =========================================================================
  // Section 2: Complex Tool Result Payloads
  // =========================================================================
  describe("2. Complex Tool Result Payloads", () => {
    it("2.1 handles tool results with non-text blocks, null text, and undefined properties", async () => {
      const secret = "ghp_1234567890abcdef1234567890abcdef1234";
      const content = [
        { type: "image", mimeType: "image/jpeg", data: "base64..." },
        { type: "audio", format: "wav", data: "binary..." },
        { type: "text", text: null as any },
        { type: "text", text: undefined as any },
        { type: "text", text: `API Token: ${secret}` },
        { type: "custom_type", payload: { nested: true } },
        { type: "text", text: "Clean message with no secrets" },
      ];

      const result = await harness.triggerToolResult("complex_tool", content);
      expect(result).toBeDefined();
      expect(result?.content.length).toBe(7);

      // Non-text blocks preserved
      expect(result?.content[0].type).toBe("image");
      expect(result?.content[1].type).toBe("audio");
      expect(result?.content[2].text).toBeNull();
      expect(result?.content[3].text).toBeUndefined();

      // Sensitive text block redacted
      expect(result?.content[4].text).not.toContain(secret);
      assertRedactedApiKey(result?.content[4].text!, secret);

      // Custom type preserved
      expect(result?.content[5].type).toBe("custom_type");

      // Clean text block untouched
      expect(result?.content[6].text).toBe("Clean message with no secrets");
    });

    it("2.2 preserves additional metadata properties on text blocks in tool results", async () => {
      const ip = "192.168.100.200";
      const content = [
        {
          type: "text",
          text: `Host IP: ${ip}`,
          metadata: { executionTimeMs: 142, cached: true },
          annotations: ["priority:high"],
        },
      ];

      const result = await harness.triggerToolResult("fetch_host", content);
      expect(result).toBeDefined();
      const block = result?.content[0];
      assertRedactedIp(block.text, ip);
      expect(block.metadata).toEqual({ executionTimeMs: 142, cached: true });
      expect(block.annotations).toEqual(["priority:high"]);
    });

    it("2.3 returns undefined when tool result contains empty content array", async () => {
      const result = await harness.triggerToolResult("empty_tool", []);
      expect(result).toBeUndefined();
    });

    it("2.4 handles 100 alternating clean and sensitive tool result items", async () => {
      const content: Array<{ type: string; text: string }> = [];
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          content.push({ type: "text", text: `Log line ${i}: server-node-${i} ok` });
        } else {
          content.push({ type: "text", text: `Log line ${i}: err with token ghp_secret${i.toString().padStart(30, "0")}` });
        }
      }

      const result = await harness.triggerToolResult("mass_log", content);
      expect(result).toBeDefined();
      expect(result?.content.length).toBe(100);

      // Check clean blocks are untouched
      for (let i = 0; i < 100; i += 2) {
        expect(result?.content[i].text).toBe(`Log line ${i}: server-node-${i} ok`);
      }
      // Check sensitive blocks are redacted
      for (let i = 1; i < 100; i += 2) {
        expect(result?.content[i].text).not.toContain("ghp_secret");
        assertRedactedApiKey(result?.content[i].text!);
      }
    });
  });

  // =========================================================================
  // Section 3: Context Messages Stress & Structure Edge Cases
  // =========================================================================
  describe("3. Multi-Turn Context Messages Stress & Nested Structures", () => {
    it("3.1 sanitizes 30-turn complex dialogue with mixed string and block payloads", async () => {
      const messages: Array<{ role: string; content: any }> = [];

      for (let turn = 0; turn < 30; turn++) {
        const role = turn % 3 === 0 ? "user" : turn % 3 === 1 ? "assistant" : "tool";
        if (turn % 2 === 0) {
          // String content
          messages.push({
            role,
            content: `Turn ${turn}: operator email operator${turn}@cloud.net with IP 10.0.${turn}.1`,
          });
        } else {
          // Block array content
          messages.push({
            role,
            content: [
              { type: "text", text: `Phase ${turn} part 1: clean description` },
              { type: "text", text: `Phase ${turn} part 2: secret sk-step${turn}012345678901234567890` },
              { type: "tool_use", id: `call_${turn}`, name: "system_ping" },
            ],
          });
        }
      }

      const result = await harness.triggerContext(messages);
      expect(result).toBeDefined();
      expect(result?.messages.length).toBe(30);

      for (let turn = 0; turn < 30; turn++) {
        const msg = result?.messages[turn];
        if (turn % 2 === 0) {
          expect(typeof msg.content).toBe("string");
          expect(msg.content).not.toContain(`operator${turn}@cloud.net`);
          expect(msg.content).not.toContain(`10.0.${turn}.1`);
          assertRedactedEmail(msg.content);
          assertRedactedIp(msg.content);
        } else {
          expect(Array.isArray(msg.content)).toBe(true);
          expect(msg.content[0].text).toBe(`Phase ${turn} part 1: clean description`);
          expect(msg.content[1].text).not.toContain(`sk-step${turn}`);
          assertRedactedApiKey(msg.content[1].text);
          expect(msg.content[2].type).toBe("tool_use");
          expect(msg.content[2].id).toBe(`call_${turn}`);
        }
      }
    });

    it("3.2 gracefully handles context messages with empty arrays or non-text blocks", async () => {
      const messages = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: [] },
        { role: "assistant", content: [{ type: "thought", text: "Analyzing..." }] },
        { role: "tool", content: [{ type: "image", mimeType: "image/png", data: "png_bytes" }] },
      ];

      const result = await harness.triggerContext(messages);
      // No PII to redact, should return undefined
      expect(result).toBeUndefined();
    });

    it("3.3 redacts sensitive data inside system messages", async () => {
      const messages = [
        {
          role: "system",
          content: "System configuration: default alert email is alert-bot@internal.corp and auth token is AKIAIOSFODNN7EXAMPLE",
        },
        { role: "user", content: "Hello world" },
      ];

      const result = await harness.triggerContext(messages);
      expect(result).toBeDefined();
      expect(result?.messages[0].content).not.toContain("alert-bot@internal.corp");
      expect(result?.messages[0].content).not.toContain("AKIAIOSFODNN7EXAMPLE");
      assertRedactedEmail(result?.messages[0].content);
      assertRedactedApiKey(result?.messages[0].content);

      // Clean user message unchanged
      expect(result?.messages[1].content).toBe("Hello world");
    });

    it("3.4 tests robustness against malformed context messages array or null items", async () => {
      // Test 3.4a: what happens if messages is null or non-array?
      let nonArrayError: any = null;
      try {
        await harness.triggerContext(null as any);
      } catch (err) {
        nonArrayError = err;
      }

      // Test 3.4b: what happens if messages contains null / undefined items?
      let nullItemError: any = null;
      try {
        await harness.triggerContext([null as any, { role: "user", content: "hello" }]);
      } catch (err) {
        nullItemError = err;
      }

      // If either threw an error, log what kind of error occurred
      if (nonArrayError) {
        console.log("OBSERVED: context hook throws on null messages:", nonArrayError.message);
      }
      if (nullItemError) {
        console.log("OBSERVED: context hook throws on null message item:", nullItemError.message);
      }
    });
  });

  // =========================================================================
  // Section 4: Selective Configuration Combinations
  // =========================================================================
  describe("4. Selective Configuration Matrix", () => {
    it("4.1 only redacts user inputs when maskToolResults and maskContextMessages are false", async () => {
      const customHarness = new PiTestHarness();
      customHarness.initCustomExtension([], {
        enabled: true,
        maskUserInputs: true,
        maskToolResults: false,
        maskContextMessages: false,
        notifyOnRedact: true,
      });

      const email = "selective1@test.com";

      // 1. Input: should redact
      const inRes = await customHarness.triggerInput(`User: ${email}`);
      expect(inRes?.action).toBe("transform");
      assertRedactedEmail(inRes?.text!, email);

      // 2. Tool result: should NOT redact
      const toolRes = await customHarness.triggerToolResult("read", [
        { type: "text", text: `Tool: ${email}` },
      ]);
      expect(toolRes).toBeUndefined();

      // 3. Context: should NOT redact
      const ctxRes = await customHarness.triggerContext([
        { role: "user", content: `Context: ${email}` },
      ]);
      expect(ctxRes).toBeUndefined();
    });

    it("4.2 only redacts context messages when maskUserInputs and maskToolResults are false", async () => {
      const customHarness = new PiTestHarness();
      customHarness.initCustomExtension([], {
        enabled: true,
        maskUserInputs: false,
        maskToolResults: false,
        maskContextMessages: true,
        notifyOnRedact: true,
      });

      const email = "selective2@test.com";

      // 1. Input: should NOT redact
      const inRes = await customHarness.triggerInput(`User: ${email}`);
      expect(inRes).toBeUndefined();

      // 2. Tool result: should NOT redact
      const toolRes = await customHarness.triggerToolResult("read", [
        { type: "text", text: `Tool: ${email}` },
      ]);
      expect(toolRes).toBeUndefined();

      // 3. Context: should redact
      const ctxRes = await customHarness.triggerContext([
        { role: "user", content: `Context: ${email}` },
      ]);
      expect(ctxRes).toBeDefined();
      assertRedactedEmail(ctxRes?.messages[0].content as string, email);
    });

    it("4.3 suppresses all notifications when notifyOnRedact is false", async () => {
      const customHarness = new PiTestHarness();
      customHarness.initCustomExtension([], {
        enabled: true,
        maskUserInputs: true,
        maskToolResults: true,
        maskContextMessages: true,
        notifyOnRedact: false,
      });

      const email = "silent@privacy.org";
      const key = "sk-silent1234567890abcdef1234567890";

      await customHarness.triggerInput(`User: ${email}`);
      await customHarness.triggerToolResult("api", [{ type: "text", text: `Token: ${key}` }]);
      await customHarness.triggerContext([{ role: "user", content: `User: ${email}` }]);

      expect(customHarness.ctx.ui.notifications.length).toBe(0);
    });

    it("4.4 individual rule disabling selectively bypasses that category across all hooks", async () => {
      const customHarness = new PiTestHarness();
      const redactor = customHarness.initCustomExtension();

      // Disable email rule while leaving API keys enabled
      redactor.toggleRule("email", false);

      const email = "active-email@test.com";
      const key = "sk-active1234567890abcdef1234567890";

      // Input hook: email preserved, key redacted
      const inRes = await customHarness.triggerInput(`Email: ${email}, Key: ${key}`);
      expect(inRes?.action).toBe("transform");
      expect(inRes?.text).toContain(email);
      expect(inRes?.text).not.toContain(key);
      assertRedactedApiKey(inRes?.text!, key);

      // Tool hook: email preserved, key redacted
      const toolRes = await customHarness.triggerToolResult("inspect", [
        { type: "text", text: `Email: ${email}, Key: ${key}` },
      ]);
      expect(toolRes).toBeDefined();
      expect(toolRes?.content[0].text).toContain(email);
      expect(toolRes?.content[0].text).not.toContain(key);
      assertRedactedApiKey(toolRes?.content[0].text!, key);

      // Context hook: email preserved, key redacted
      const ctxRes = await customHarness.triggerContext([
        { role: "user", content: `Email: ${email}, Key: ${key}` },
      ]);
      expect(ctxRes).toBeDefined();
      expect(ctxRes?.messages[0].content).toContain(email);
      expect(ctxRes?.messages[0].content).not.toContain(key);
      assertRedactedApiKey(ctxRes?.messages[0].content as string, key);
    });
  });

  // =========================================================================
  // Section 5: LLM Response Restoration Across Hooks
  // =========================================================================
  describe("5. LLM Response Restoration Across Hooks", () => {
    it("5.1 restores LLM responses containing placeholders from input and context redactions", async () => {
      const customHarness = new PiTestHarness();
      const redactor = customHarness.initCustomExtension();

      const email = "doctor@hospital.org";
      const key = "AKIAIOSFODNN7EXAMPLE";

      // 1. Redact input
      const inRes = await customHarness.triggerInput(`Send patient report to ${email} with key ${key}`);
      expect(inRes?.action).toBe("transform");
      const redactedPrompt = inRes?.text!;

      // 2. Simulate LLM returning a message citing both placeholders
      // RedactorService retains service.restore() for the latest redaction
      const llmResponse = `Confirmed: I have dispatched the record to [EMAIL_1] and verified credentials with [REDACTED:API_KEY].`;
      const restored = redactor.restore(llmResponse);

      expect(restored).toContain(email);
      expect(restored).toContain(key);
      expect(restored).not.toContain("[EMAIL_1]");
      expect(restored).not.toContain("[REDACTED:API_KEY]");
    });

    it("5.2 restores LLM responses containing duplicated and repeated placeholders", async () => {
      const customHarness = new PiTestHarness();
      const redactor = customHarness.initCustomExtension();

      const phone = "555-867-5309";
      const inRes = await customHarness.triggerInput(`Call emergency support at ${phone}`);
      expect(inRes?.action).toBe("transform");

      // LLM echoes the placeholder multiple times
      const llmEcho = `I will call [PHONE_1] immediately. Once finished with [PHONE_1], status will be updated.`;
      const restored = redactor.restore(llmEcho);

      expect(restored).toBe(`I will call ${phone} immediately. Once finished with ${phone}, status will be updated.`);
    });

    it("5.3 preserves unrelated bracketed syntax in LLM responses", async () => {
      const customHarness = new PiTestHarness();
      const redactor = customHarness.initCustomExtension();

      const email = "coder@dev.io";
      await customHarness.triggerInput(`Log in as ${email}`);

      // LLM response contains valid placeholder plus unrelated code brackets
      const llmResponse = `Found user [EMAIL_1]. Accessing array[0], matrix[1][2], and regex pattern [a-zA-Z0-9_]+. Missing [EMAIL_999].`;
      const restored = redactor.restore(llmResponse);

      expect(restored).toContain(`Found user ${email}.`);
      expect(restored).toContain("Accessing array[0], matrix[1][2], and regex pattern [a-zA-Z0-9_]+.");
      expect(restored).toContain("Missing [EMAIL_999].");
    });
  });

  // =========================================================================
  // Section 6: Slash Command Boundary & Argument Stress
  // =========================================================================
  describe("6. Slash Command Robustness & Argument Variations", () => {
    it("6.1 handles rapid execution of 50 slash commands sequentially", async () => {
      for (let i = 0; i < 50; i++) {
        const subcmd = i % 4 === 0 ? "status" : i % 4 === 1 ? "rules" : i % 4 === 2 ? "toggle" : "status";
        await harness.executeCommand(subcmd);
      }
      expect(harness.ctx.ui.notifications.length).toBeGreaterThanOrEqual(50);
    });

    it("6.2 autocompletion works with mixed whitespace and case", async () => {
      const comps1 = await harness.getCommandCompletions("  TOG  ");
      expect(comps1).toHaveLength(1);
      expect(comps1[0].value).toBe("toggle");

      const comps2 = await harness.getCommandCompletions("RUL");
      expect(comps2).toHaveLength(1);
      expect(comps2[0].value).toBe("rules");

      const comps3 = await harness.getCommandCompletions("nonexistent_prefix");
      expect(comps3).toHaveLength(0);
    });

    it("6.3 formats rules list comprehensively via /pii rules", async () => {
      await harness.executeCommand("rules");
      const notif = harness.ctx.ui.notifications[harness.ctx.ui.notifications.length - 1];
      expect(notif.message).toContain("Active Redaction Rules:");
      expect(notif.message).toContain("Email Addresses (email): enabled");
      expect(notif.message).toContain("Common API Keys & Tokens (api-key-generic): enabled");
      expect(notif.message).toContain("IP Addresses (ip-address): enabled");
    });
  });

  // =========================================================================
  // Section 7: Extreme Data Payloads & Control Characters
  // =========================================================================
  describe("7. Extreme Payloads & Control Characters", () => {
    it("7.1 safely handles null bytes, control characters, and Unicode surrogates", async () => {
      const email = "special@unicode.org";
      const payload = `User\x00\x01\x1b[31mRed\x1b[0m with \uFEFF BOM and ${email} and \u200B zero-width space.`;

      const res = await harness.triggerInput(payload);
      expect(res?.action).toBe("transform");
      assertRedactedEmail(res?.text!, email);
      expect(res?.text).toContain("\x00");
      expect(res?.text).toContain("\u200B");
    });

    it("7.2 safely handles 10,000-character payload with multiple PII entities", async () => {
      const email = "stress10k@test.com";
      const ip = "10.254.1.99";
      const key = "sk-stress10k1234567890abcdef1234567890";

      const filler = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(150);
      const payload = `${filler} Contact: ${email} Server: ${ip} Auth: ${key} ${filler}`;
      expect(payload.length).toBeGreaterThan(10000);

      const res = await harness.triggerInput(payload);
      expect(res?.action).toBe("transform");
      assertRedactedEmail(res?.text!, email);
      assertRedactedIp(res?.text!, ip);
      assertRedactedApiKey(res?.text!, key);
      expect(res?.text?.length).toBeGreaterThan(10000);
    });
  });
});
