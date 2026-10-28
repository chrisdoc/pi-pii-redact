import { describe, it, expect, beforeEach } from "vitest";
import {
  PiTestHarness,
  assertRedactedEmail,
  assertRedactedApiKey,
  assertRedactedIp,
  assertRedactedPhone,
  assertRedactedCreditCard,
} from "./harness.js";

describe("Tier 2: Boundary & Corner Cases (Opaque-Box E2E)", () => {
  let harness: PiTestHarness;

  beforeEach(async () => {
    harness = new PiTestHarness();
    await harness.initExtension();
  });

  // =========================================================================
  // Dimension 1: Empty Strings, Whitespace & Empty Collections
  // =========================================================================
  describe("Dimension 1: Empty Strings, Whitespace & Empty Collections", () => {
    it("1.1 handles empty string user input without errors", async () => {
      const result = await harness.triggerInput("");
      expect(result).toBeUndefined();
    });

    it("1.2 handles whitespace-only user input without errors", async () => {
      const result = await harness.triggerInput("   \n\t  \r\n   ");
      expect(result).toBeUndefined();
    });

    it("1.3 handles empty content array in tool result", async () => {
      const result = await harness.triggerToolResult("bash", []);
      expect(result).toBeUndefined();
    });

    it("1.4 handles empty text string in tool result item", async () => {
      const result = await harness.triggerToolResult("read_file", [
        { type: "text", text: "" },
      ]);
      expect(result).toBeUndefined();
    });

    it("1.5 handles empty messages array in context hook", async () => {
      const result = await harness.triggerContext([]);
      expect(result).toBeUndefined();
    });

    it("1.6 handles empty content string in context message", async () => {
      const result = await harness.triggerContext([
        { role: "user", content: "" },
      ]);
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // Dimension 2: Multi-Match & Repeated Identical Entities
  // =========================================================================
  describe("Dimension 2: Multi-Match & Repeated Identical Entities", () => {
    it("2.1 redacts all occurrences of repeated identical email address", async () => {
      const email = "repeat@test.com";
      const result = await harness.triggerInput(`From: ${email}, CC: ${email}, BCC: ${email}`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(email);
      // Ensure all occurrences were replaced
      const matches = result?.text?.match(/\[(?:REDACTED:EMAIL|EMAIL(?:_\d+(?:#[a-z0-9]{4})?)?)\]/gi);
      expect(matches?.length).toBe(3);
    });

    it("2.2 redacts all occurrences of repeated identical API keys", async () => {
      const key = "sk-1234567890abcdef1234567890";
      const result = await harness.triggerInput(`Primary: ${key}\nBackup: ${key}`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(key);
      const matches = result?.text?.match(/\[(?:REDACTED:API_KEY|API_KEY(?:_\d+(?:#[a-z0-9]{4})?)?)\]/gi);
      expect(matches?.length).toBe(2);
    });

    it("2.3 redacts all occurrences of repeated identical IPv4 addresses", async () => {
      const ip = "192.168.1.1";
      const result = await harness.triggerInput(`Ping ${ip} gateway at ${ip}`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(ip);
      const matches = result?.text?.match(/\[(?:REDACTED:IP_ADDRESS|IP_ADDRESS(?:_\d+(?:#[a-z0-9]{4})?)?)\]/gi);
      expect(matches?.length).toBe(2);
    });

    it("2.4 redacts all occurrences of repeated identical phone numbers", async () => {
      const phone = "555-123-4567";
      const result = await harness.triggerInput(`Day: ${phone}, Evening: ${phone}`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(phone);
      const matches = result?.text?.match(/\[(?:REDACTED:PHONE|PHONE(?:_\d+(?:#[a-z0-9]{4})?)?)\]/gi);
      expect(matches?.length).toBe(2);
    });

    it("2.5 redacts all occurrences of repeated identical credit cards", async () => {
      const cc = "4111-2222-3333-4444";
      const result = await harness.triggerInput(`Card 1: ${cc}, Retype: ${cc}`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(cc);
      const matches = result?.text?.match(/\[(?:REDACTED:CREDIT_CARD|CREDIT_CARD(?:_\d+(?:#[a-z0-9]{4})?)?)\]/gi);
      expect(matches?.length).toBe(2);
    });
  });

  // =========================================================================
  // Dimension 3: Adjacent PII & Punctuation Delimiters
  // =========================================================================
  describe("Dimension 3: Adjacent PII & Punctuation Delimiters", () => {
    it("3.1 redacts adjacent emails separated only by comma or semicolon", async () => {
      const email1 = "alice@example.com";
      const email2 = "bob@domain.org";
      const result = await harness.triggerInput(`${email1},${email2};support@test.io`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(email1);
      expect(result?.text).not.toContain(email2);
      expect(result?.text).not.toContain("support@test.io");
    });

    it("3.2 redacts PII wrapped tightly in parentheses, brackets, or angle brackets", async () => {
      const email = "user@example.com";
      const ip = "10.0.0.1";
      const result = await harness.triggerInput(`(<${email}>) [${ip}]`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(email);
      expect(result?.text).not.toContain(ip);
      expect(result?.text).toMatch(/\(<.*>\)\s\[.*\]/);
    });

    it("3.3 redacts PII embedded inside JSON-like and XML-like strings", async () => {
      const key = "sk-1234567890abcdef1234567890";
      const result = await harness.triggerInput(`{"secret": "${key}", "xml": "<token>${key}</token>"}`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(key);
    });

    it("3.4 redacts PII ending immediately with sentence punctuation", async () => {
      const phone = "555-987-6543";
      const result = await harness.triggerInput(`Call ${phone}! Or maybe ${phone}? Yes, ${phone}.`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(phone);
      expect(result?.text).toMatch(/!\s.*Or maybe.*\?\s.*Yes,.*\./);
    });

    it("3.5 redacts consecutive adjacent API keys on newlines", async () => {
      const key1 = "sk-1234567890abcdef1234567890";
      const key2 = "ghp_1234567890abcdef1234567890abcdef1234";
      const result = await harness.triggerInput(`${key1}\n${key2}`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(key1);
      expect(result?.text).not.toContain(key2);
    });
  });

  // =========================================================================
  // Dimension 4: Multilingual & Unicode Contexts
  // =========================================================================
  describe("Dimension 4: Multilingual & Unicode Contexts", () => {
    it("4.1 redacts email embedded in East Asian (Chinese) text", async () => {
      const email = "developer@shanghai.cn";
      const result = await harness.triggerInput(`请将系统错误报告发送至 ${email} 谢谢配合。`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(email);
      expect(result?.text).toContain("请将系统错误报告发送至");
      expect(result?.text).toContain("谢谢配合。");
    });

    it("4.2 redacts IPv4 embedded in Japanese text", async () => {
      const ip = "192.168.1.10";
      const result = await harness.triggerInput(`データベースサーバーのアドレスは ${ip} です。`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(ip);
      expect(result?.text).toContain("データベースサーバーのアドレスは");
      expect(result?.text).toContain("です。");
    });

    it("4.3 redacts API key surrounded by European accents and umlauts (German/French)", async () => {
      const key = "sk-1234567890abcdef1234567890";
      const result = await harness.triggerInput(`Veuillez vérifier le clé d'accès ${key} für die Überprüfung.`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(key);
      expect(result?.text).toContain("Veuillez vérifier le clé d'accès");
      expect(result?.text).toContain("für die Überprüfung.");
    });

    it("4.4 redacts phone number accompanied by emojis", async () => {
      const phone = "555-019-9234";
      const result = await harness.triggerInput(`📞 Urgent hotline: ${phone} 🚨 Call ASAP! 📱`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(phone);
      expect(result?.text).toContain("📞 Urgent hotline:");
      expect(result?.text).toContain("🚨 Call ASAP! 📱");
    });

    it("4.5 redacts credit card surrounded by mathematical symbols and currency signs", async () => {
      const cc = "4532-1234-5678-9012";
      const result = await harness.triggerInput(`Total: €150.00 / ¥20,000 → Charged on: ${cc} (±0.05%)`);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(cc);
      expect(result?.text).toContain("Total: €150.00 / ¥20,000 → Charged on:");
    });
  });

  // =========================================================================
  // Dimension 5: Extreme Lengths & Stress Inputs
  // =========================================================================
  describe("Dimension 5: Extreme Lengths & Stress Inputs", () => {
    it("5.1 redacts email buried inside a ~1,000-character payload", async () => {
      const email = "deep-needle@domain.com";
      const padding = "lorem ipsum dolor sit amet ".repeat(40);
      const text = `${padding} FIND_ME: ${email} ${padding}`;
      const result = await harness.triggerInput(text);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(email);
      assertRedactedEmail(result?.text!, email);
    });

    it("5.2 redacts IP address in a tool result containing 30 log entries", async () => {
      const leakedIp = "10.240.12.88";
      const content = [];
      for (let i = 0; i < 30; i++) {
        content.push({
          type: "text",
          text: i === 20 ? `[CRITICAL] Unauthorized access from ${leakedIp} at line ${i}` : `[INFO] Normal request ping #${i}`,
        });
      }
      const result = await harness.triggerToolResult("syslog", content);
      expect(result).toBeDefined();
      expect(result?.content[20].text).not.toContain(leakedIp);
      assertRedactedIp(result?.content[20].text!, leakedIp);
      expect(result?.content[0].text).toBe("[INFO] Normal request ping #0");
    });

    it("5.3 redacts PII positioned at the very end of a large multi-line string", async () => {
      const key = "sk-1234567890abcdef1234567890";
      const lines = Array.from({ length: 15 }, (_, i) => `line ${i}: nothing sensitive here`).join("\n");
      const fullText = `${lines}\nFINAL_SECRET=${key}`;
      const result = await harness.triggerInput(fullText);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(key);
      assertRedactedApiKey(result?.text!, key);
    });

    it("5.4 redacts PII separated by hundreds of spaces and tabs", async () => {
      const email = "spaced@out.com";
      const text = `Start${" ".repeat(300)}${email}${"\t".repeat(200)}End`;
      const result = await harness.triggerInput(text);
      expect(result?.action).toBe("transform");
      expect(result?.text).not.toContain(email);
    });

    it("5.5 handles conversation history with 10 alternating turns efficiently", async () => {
      const secret = "sk-1234567890abcdef1234567890";
      const messages = [];
      for (let i = 0; i < 10; i++) {
        messages.push({
          role: i % 2 === 0 ? "user" : "assistant",
          content: i === 7 ? `Turn ${i} with key ${secret}` : `Turn ${i} conversation standard text`,
        });
      }
      const result = await harness.triggerContext(messages);
      expect(result).toBeDefined();
      expect(result?.messages[7].content).not.toContain(secret);
      assertRedactedApiKey(result?.messages[7].content as string, secret);
    });
  });

  // =========================================================================
  // Dimension 6: Near-Miss / Non-Matching Inputs (No False Redactions)
  // =========================================================================
  describe("Dimension 6: Near-Miss Inputs", () => {
    it("6.1 does not redact invalid email missing domain name or '@'", async () => {
      const nonEmail = "not-an-email-address";
      const result = await harness.triggerInput(`Check ${nonEmail} here`);
      expect(result).toBeUndefined();
    });

    it("6.2 does not redact short token string with insufficient length", async () => {
      const shortToken = "sk-short";
      const result = await harness.triggerInput(`Short token prefix ${shortToken}`);
      expect(result).toBeUndefined();
    });

    it("6.3 does not falsely redact invalid IP format with alphanumeric octet", async () => {
      const invalidIp = "192.168.1.abc";
      const result = await harness.triggerInput(`Invalid IP: ${invalidIp}`);
      expect(result).toBeUndefined();
    });

    it("6.4 does not falsely redact short hyphenated digit sequence (e.g. 12-34)", async () => {
      const result = await harness.triggerInput("Score was 12-34 in match");
      expect(result).toBeUndefined();
    });

    it("6.5 does not falsely redact regular 4-digit year numbers", async () => {
      const result = await harness.triggerInput("The event took place in 1999 and again in 2024.");
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // Dimension 7: Malformed / Non-Standard Hook Structures
  // =========================================================================
  describe("Dimension 7: Malformed / Non-Standard Hook Structures", () => {
    it("7.1 safely handles tool result item with missing text property", async () => {
      const result = await harness.triggerToolResult("custom_tool", [
        { type: "text" } as any,
      ]);
      expect(result).toBeUndefined();
    });

    it("7.2 safely handles tool result item with non-string text property", async () => {
      const result = await harness.triggerToolResult("custom_tool", [
        { type: "text", text: 12345 as any },
      ]);
      expect(result).toBeUndefined();
    });

    it("7.3 safely handles context message containing empty content blocks array", async () => {
      const result = await harness.triggerContext([
        { role: "assistant", content: [] },
      ]);
      expect(result).toBeUndefined();
    });

    it("7.4 safely handles context message containing non-text block types", async () => {
      const result = await harness.triggerContext([
        {
          role: "assistant",
          content: [{ type: "audio", data: "binary_stream" } as any],
        },
      ]);
      expect(result).toBeUndefined();
    });

    it("7.5 safely handles non-array tool result content gracefully", async () => {
      const result = await harness.triggerToolResult("broken_tool", null as any);
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // Dimension 8: Slash Command Boundary Arguments
  // =========================================================================
  describe("Dimension 8: Slash Command Boundary Arguments", () => {
    it("8.1 handles command with leading and trailing excessive whitespace", async () => {
      await harness.executeCommand("   toggle   ");
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: Off");
    });

    it("8.2 handles command with mixed/upper case arguments (TOGGLE)", async () => {
      await harness.executeCommand("TOGGLE");
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: Off");
    });

    it("8.3 handles command with empty argument string defaulting to status", async () => {
      await harness.executeCommand("");
      expect(harness.ctx.ui.notifications.length).toBe(1);
      expect(harness.ctx.ui.notifications[0].message).toContain("PII Redactor status:");
    });

    it("8.4 handles command with unknown subcommand string falling back to status", async () => {
      await harness.executeCommand("unknown_action_xyz");
      expect(harness.ctx.ui.notifications.length).toBe(1);
      expect(harness.ctx.ui.notifications[0].message).toContain("PII Redactor status:");
    });

    it("8.5 autocompletion returns empty array for non-matching prefix", async () => {
      const completions = await harness.getCommandCompletions("xyz");
      expect(completions).toEqual([]);
    });

    it("8.6 autocompletion ignores leading whitespace in prefix", async () => {
      const completions = await harness.getCommandCompletions("   en");
      expect(completions).toEqual([{ value: "enable", label: "enable" }]);
    });
  });
});
