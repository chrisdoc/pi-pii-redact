import { describe, it, expect, beforeEach } from "vitest";
import {
  PiTestHarness,
  assertRedactedEmail,
  assertRedactedApiKey,
  assertRedactedIp,
  assertRedactedPhone,
  assertRedactedCreditCard,
} from "./harness.js";

describe("Tier 1: Feature Coverage (Opaque-Box E2E)", () => {
  let harness: PiTestHarness;

  beforeEach(async () => {
    harness = new PiTestHarness();
    await harness.initExtension();
  });

  // =========================================================================
  // Feature Group 1: Email Redaction
  // =========================================================================
  describe("Feature 1: Email Redaction", () => {
    it("1.1 redacts standard email in user input", async () => {
      const email = "developer@example.com";
      const result = await harness.triggerInput(`Contact me at ${email} for logs`);
      expect(result).toBeDefined();
      expect(result?.action).toBe("transform");
      assertRedactedEmail(result?.text!, email);
    });

    it("1.2 redacts email with subdomains in user input", async () => {
      const email = "ops-team@subdomain.corp.internal.io";
      const result = await harness.triggerInput(`Alert routed to ${email}`);
      expect(result?.action).toBe("transform");
      assertRedactedEmail(result?.text!, email);
    });

    it("1.3 redacts email with tag and plus characters", async () => {
      const email = "user.name+filters@service.org";
      const result = await harness.triggerInput(`User email registered: ${email}`);
      expect(result?.action).toBe("transform");
      assertRedactedEmail(result?.text!, email);
    });

    it("1.4 redacts multiple distinct email addresses in one prompt", async () => {
      const email1 = "lead@alpha.com";
      const email2 = "support@beta.net";
      const result = await harness.triggerInput(`Send from ${email1} to ${email2}`);
      expect(result?.action).toBe("transform");
      assertRedactedEmail(result?.text!, email1);
      assertRedactedEmail(result?.text!, email2);
    });

    it("1.5 redacts email placed at exact boundaries of string", async () => {
      const email = "boundary@start.com";
      const result = await harness.triggerInput(`${email}`);
      expect(result?.action).toBe("transform");
      assertRedactedEmail(result?.text!, email);
    });
  });

  // =========================================================================
  // Feature Group 2: Secret & API Key Token Redaction
  // =========================================================================
  describe("Feature 2: API Keys and Secret Tokens Redaction", () => {
    it("2.1 redacts OpenAI style secret API keys", async () => {
      const key = "sk-1234567890abcdef1234567890";
      const result = await harness.triggerInput(`Use OPENAI_API_KEY=${key}`);
      expect(result?.action).toBe("transform");
      assertRedactedApiKey(result?.text!, key);
    });

    it("2.2 redacts GitHub personal access tokens (ghp_)", async () => {
      const token = "ghp_1234567890abcdef1234567890abcdef1234";
      const result = await harness.triggerInput(`Clone repo with token ${token}`);
      expect(result?.action).toBe("transform");
      assertRedactedApiKey(result?.text!, token);
    });

    it("2.3 redacts GitHub OAuth access tokens (gho_)", async () => {
      const token = "gho_1234567890abcdef1234567890abcdef1234";
      const result = await harness.triggerInput(`OAuth token: ${token}`);
      expect(result?.action).toBe("transform");
      assertRedactedApiKey(result?.text!, token);
    });

    it("2.4 redacts GitLab personal access tokens (glpat-)", async () => {
      const token = "glpat-1234567890abcdef1234";
      const result = await harness.triggerInput(`GitLab auth: ${token}`);
      expect(result?.action).toBe("transform");
      assertRedactedApiKey(result?.text!, token);
    });

    it("2.5 redacts AWS Access Key IDs (AKIA)", async () => {
      const keyId = "AKIAIOSFODNN7EXAMPLE";
      const result = await harness.triggerInput(`Export AWS_ACCESS_KEY_ID=${keyId}`);
      expect(result?.action).toBe("transform");
      assertRedactedApiKey(result?.text!, keyId);
    });
  });

  // =========================================================================
  // Feature Group 3: IPv4 Address Redaction
  // =========================================================================
  describe("Feature 3: IPv4 Address Redaction", () => {
    it("3.1 redacts standard private class C IPv4 address", async () => {
      const ip = "192.168.1.100";
      const result = await harness.triggerInput(`Connect to host at ${ip}`);
      expect(result?.action).toBe("transform");
      assertRedactedIp(result?.text!, ip);
    });

    it("3.2 redacts public IPv4 DNS address", async () => {
      const ip = "8.8.8.8";
      const result = await harness.triggerInput(`Nameserver configured: ${ip}`);
      expect(result?.action).toBe("transform");
      assertRedactedIp(result?.text!, ip);
    });

    it("3.3 redacts IPv4 loopback address", async () => {
      const ip = "127.0.0.1";
      const result = await harness.triggerInput(`Local service on ${ip}:3000`);
      expect(result?.action).toBe("transform");
      assertRedactedIp(result?.text!, ip);
    });

    it("3.4 redacts subnet broadcast IPv4 address", async () => {
      const ip = "255.255.255.255";
      const result = await harness.triggerInput(`Broadcast to ${ip}`);
      expect(result?.action).toBe("transform");
      assertRedactedIp(result?.text!, ip);
    });

    it("3.5 redacts multiple IPv4 addresses across network route", async () => {
      const ip1 = "10.0.0.1";
      const ip2 = "172.16.254.1";
      const result = await harness.triggerInput(`Routing from ${ip1} to gateway ${ip2}`);
      expect(result?.action).toBe("transform");
      assertRedactedIp(result?.text!, ip1);
      assertRedactedIp(result?.text!, ip2);
    });
  });

  // =========================================================================
  // Feature Group 4: Phone Number Redaction
  // =========================================================================
  describe("Feature 4: Phone Number Redaction", () => {
    it("4.1 redacts US international formatted phone number", async () => {
      const phone = "+1 (555) 123-4567";
      const result = await harness.triggerInput(`Call support at ${phone}`);
      expect(result?.action).toBe("transform");
      assertRedactedPhone(result?.text!, phone);
    });

    it("4.2 redacts US dot-separated phone number", async () => {
      const phone = "555.234.5678";
      const result = await harness.triggerInput(`Dispatch desk: ${phone}`);
      expect(result?.action).toBe("transform");
      assertRedactedPhone(result?.text!, phone);
    });

    it("4.3 redacts parenthesized area code phone number", async () => {
      const phone = "(800) 555-0199";
      const result = await harness.triggerInput(`Toll-free line: ${phone}`);
      expect(result?.action).toBe("transform");
      assertRedactedPhone(result?.text!, phone);
    });

    it("4.4 redacts standard hyphenated phone number", async () => {
      const phone = "555-867-5309";
      const result = await harness.triggerInput(`Call Jenny at ${phone}`);
      expect(result?.action).toBe("transform");
      assertRedactedPhone(result?.text!, phone);
    });

    it("4.5 redacts international UK styled phone number", async () => {
      const phone = "+44 20 7946 0958";
      const result = await harness.triggerInput(`London office: ${phone}`);
      expect(result?.action).toBe("transform");
      assertRedactedPhone(result?.text!, phone);
    });
  });

  // =========================================================================
  // Feature Group 5: Credit Card Redaction
  // =========================================================================
  describe("Feature 5: Credit Card Redaction", () => {
    it("5.1 redacts 16-digit hyphen-separated credit card", async () => {
      const cc = "4532-1234-5678-9012";
      const result = await harness.triggerInput(`Card payment: ${cc}`);
      expect(result?.action).toBe("transform");
      assertRedactedCreditCard(result?.text!, cc);
    });

    it("5.2 redacts 16-digit space-separated credit card", async () => {
      const cc = "4532 1234 5678 9012";
      const result = await harness.triggerInput(`Billing number: ${cc}`);
      expect(result?.action).toBe("transform");
      assertRedactedCreditCard(result?.text!, cc);
    });

    it("5.3 redacts 16-digit contiguous credit card", async () => {
      const cc = "4532123456789012";
      const result = await harness.triggerInput(`Raw PAN: ${cc}`);
      expect(result?.action).toBe("transform");
      assertRedactedCreditCard(result?.text!, cc);
    });

    it("5.4 redacts Visa format credit card", async () => {
      const cc = "4111-2222-3333-4444";
      const result = await harness.triggerInput(`Visa test card: ${cc}`);
      expect(result?.action).toBe("transform");
      assertRedactedCreditCard(result?.text!, cc);
    });

    it("5.5 redacts Mastercard format credit card", async () => {
      const cc = "5500-0000-0000-0004";
      const result = await harness.triggerInput(`Mastercard account: ${cc}`);
      expect(result?.action).toBe("transform");
      assertRedactedCreditCard(result?.text!, cc);
    });
  });

  // =========================================================================
  // Feature Group 6: Session Start Hook
  // =========================================================================
  describe("Feature 6: Session Start Hook", () => {
    it("6.1 sets status to 'PII: On' on session start when enabled", async () => {
      await harness.triggerSessionStart();
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");
    });

    it("6.2 sets status to 'PII: Off' when initialized with disabled service", async () => {
      const customHarness = new PiTestHarness();
      customHarness.initCustomExtension([], { enabled: false });
      await customHarness.triggerSessionStart();
      expect(customHarness.ctx.ui.getStatus("pii-redact")).toBe("PII: Off");
    });

    it("6.3 uses consistent status bar key 'pii-redact'", async () => {
      await harness.triggerSessionStart();
      expect(harness.ctx.ui.statuses.has("pii-redact")).toBe(true);
    });

    it("6.4 supports multiple session_start triggers idempotently", async () => {
      await harness.triggerSessionStart();
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");
      await harness.triggerSessionStart();
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");
    });

    it("6.5 reflects state changes on subsequent session_start", async () => {
      await harness.triggerSessionStart();
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");
      await harness.executeCommand("disable");
      await harness.triggerSessionStart();
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: Off");
    });
  });

  // =========================================================================
  // Feature Group 7: User Input Hook
  // =========================================================================
  describe("Feature 7: User Input Hook", () => {
    it("7.1 returns transform action when sensitive data is detected", async () => {
      const result = await harness.triggerInput("Email me at bob@example.com");
      expect(result).toBeDefined();
      expect(result?.action).toBe("transform");
    });

    it("7.2 returns undefined when user input is completely clean", async () => {
      const result = await harness.triggerInput("Explain the difference between let and const in JavaScript");
      expect(result).toBeUndefined();
    });

    it("7.3 sends UI notification when input is redacted", async () => {
      await harness.triggerInput("Contact support@acme.corp");
      expect(harness.ctx.ui.notifications.length).toBeGreaterThan(0);
      const notif = harness.ctx.ui.notifications[0];
      expect(notif.type).toBe("info");
      expect(notif.message).toMatch(/Redacted \d+ sensitive item\(s\) from input/);
    });

    it("7.4 returns undefined when extension is disabled", async () => {
      await harness.executeCommand("disable");
      const result = await harness.triggerInput("Email me at bob@example.com");
      expect(result).toBeUndefined();
    });

    it("7.5 preserves surrounding text intact while masking PII", async () => {
      const email = "dev@org.com";
      const result = await harness.triggerInput(`Prefix message [${email}] suffix message`);
      expect(result?.text).toMatch(/^Prefix message \[.*\] suffix message$/);
      expect(result?.text).not.toContain(email);
    });
  });

  // =========================================================================
  // Feature Group 8: Tool Result Hook
  // =========================================================================
  describe("Feature 8: Tool Result Hook", () => {
    it("8.1 sanitizes text items in tool results array", async () => {
      const email = "leaked-user@company.com";
      const result = await harness.triggerToolResult("read_file", [
        { type: "text", text: `config: admin=${email}` },
      ]);
      expect(result).toBeDefined();
      expect(result?.content[0].text).not.toContain(email);
      assertRedactedEmail(result?.content[0].text!, email);
    });

    it("8.2 returns undefined when tool result contains no sensitive data", async () => {
      const result = await harness.triggerToolResult("bash", [
        { type: "text", text: "total 12\ndrwxr-xr-x 2 user staff 64 Oct 28 10:00 dist" },
      ]);
      expect(result).toBeUndefined();
    });

    it("8.3 preserves non-text items in tool results content", async () => {
      const email = "admin@server.net";
      const result = await harness.triggerToolResult("read_file", [
        { type: "image", data: "base64imagebytes" },
        { type: "text", text: `Contact: ${email}` },
      ]);
      expect(result).toBeDefined();
      expect(result?.content[0].type).toBe("image");
      expect(result?.content[0].data).toBe("base64imagebytes");
      assertRedactedEmail(result?.content[1].text!, email);
    });

    it("8.4 sends UI notification identifying the tool name", async () => {
      await harness.triggerToolResult("fetch_logs", [
        { type: "text", text: "Host 192.168.1.50 accessed endpoint" },
      ]);
      expect(harness.ctx.ui.notifications.length).toBeGreaterThan(0);
      const notif = harness.ctx.ui.notifications[0];
      expect(notif.type).toBe("info");
      expect(notif.message).toMatch(/Redacted \d+ item\(s\) from fetch_logs output/);
    });

    it("8.5 returns undefined when tool results hook is disabled via command", async () => {
      await harness.executeCommand("disable");
      const result = await harness.triggerToolResult("read_file", [
        { type: "text", text: "Secret key: sk-1234567890abcdef1234567890" },
      ]);
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // Feature Group 9: Context Messages Hook
  // =========================================================================
  describe("Feature 9: Context Messages Hook", () => {
    it("9.1 sanitizes string content messages in context history", async () => {
      const email = "user@test.org";
      const result = await harness.triggerContext([
        { role: "user", content: `My email is ${email}` },
      ]);
      expect(result).toBeDefined();
      const firstMsg = result?.messages[0];
      expect(typeof firstMsg.content).toBe("string");
      assertRedactedEmail(firstMsg.content, email);
    });

    it("9.2 sanitizes array block content messages in context history", async () => {
      const ip = "10.10.10.10";
      const result = await harness.triggerContext([
        {
          role: "assistant",
          content: [{ type: "text", text: `Connected to server at ${ip}` }],
        },
      ]);
      expect(result).toBeDefined();
      const content = result?.messages[0].content as Array<{ type: string; text?: string }>;
      assertRedactedIp(content[0].text!, ip);
    });

    it("9.3 leaves non-sensitive messages completely untouched", async () => {
      const cleanContent = "Calculate 2 + 2";
      const result = await harness.triggerContext([
        { role: "user", content: cleanContent },
      ]);
      expect(result).toBeUndefined();
    });

    it("9.4 preserves message roles and structure across turns", async () => {
      const email = "alice@example.com";
      const result = await harness.triggerContext([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: `Please email ${email}` },
        { role: "assistant", content: "I cannot send external emails." },
      ]);
      expect(result).toBeDefined();
      expect(result?.messages.length).toBe(3);
      expect(result?.messages[0].role).toBe("system");
      expect(result?.messages[0].content).toBe("You are a helpful assistant.");
      expect(result?.messages[1].role).toBe("user");
      assertRedactedEmail(result?.messages[1].content, email);
      expect(result?.messages[2].role).toBe("assistant");
      expect(result?.messages[2].content).toBe("I cannot send external emails.");
    });

    it("9.5 returns undefined when context messages masking is disabled", async () => {
      await harness.executeCommand("disable");
      const result = await harness.triggerContext([
        { role: "user", content: "My IP is 192.168.0.1" },
      ]);
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // Feature Group 10: Slash Command /pii
  // =========================================================================
  describe("Feature 10: Slash Command /pii", () => {
    it("10.1 executes '/pii status' and notifies with state and rule counts", async () => {
      await harness.executeCommand("status");
      expect(harness.ctx.ui.notifications.length).toBe(1);
      const notif = harness.ctx.ui.notifications[0];
      expect(notif.type).toBe("info");
      expect(notif.message).toContain("PII Redactor status: ACTIVE");
      expect(notif.message).toMatch(/Active rules: \d+\/\d+/);
    });

    it("10.2 executes '/pii toggle' flipping from ENABLED to DISABLED", async () => {
      await harness.executeCommand("toggle");
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: Off");
      const notif = harness.ctx.ui.notifications.find((n) => n.message.includes("PII redaction is now DISABLED"));
      expect(notif).toBeDefined();

      // Toggle back
      await harness.executeCommand("toggle");
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");
      const notif2 = harness.ctx.ui.notifications.find((n) => n.message.includes("PII redaction is now ENABLED"));
      expect(notif2).toBeDefined();
    });

    it("10.3 executes '/pii disable' setting state to DISABLED and updating status", async () => {
      await harness.executeCommand("disable");
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: Off");
      const notif = harness.ctx.ui.notifications.find((n) => n.message.includes("PII redaction DISABLED"));
      expect(notif).toBeDefined();
    });

    it("10.4 executes '/pii enable' setting state to ENABLED and updating status", async () => {
      await harness.executeCommand("disable");
      await harness.executeCommand("enable");
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");
      const notif = harness.ctx.ui.notifications.find((n) => n.message.includes("PII redaction ENABLED"));
      expect(notif).toBeDefined();
    });

    it("10.5 executes '/pii rules' and outputs list of registered rules", async () => {
      await harness.executeCommand("rules");
      expect(harness.ctx.ui.notifications.length).toBe(1);
      const notif = harness.ctx.ui.notifications[0];
      expect(notif.message).toContain("Active Redaction Rules:");
      expect(notif.message).toContain("email");
      expect(notif.message).toContain("api-key");
    });

    it("10.6 provides argument completions for slash command prefix", async () => {
      const completions = await harness.getCommandCompletions("st");
      expect(completions).toEqual([
        { value: "status", label: "status" },
        { value: "stats", label: "stats" },
      ]);

      const allCompletions = await harness.getCommandCompletions("");
      const values = allCompletions.map((c) => c.value);
      expect(values).toContain("status");
      expect(values).toContain("toggle");
      expect(values).toContain("rules");
      expect(values).toContain("enable");
      expect(values).toContain("disable");
    });
  });

  // =========================================================================
  // Feature Group 11: Configuration & Toggle Management
  // =========================================================================
  describe("Feature 11: Configuration & Toggle Management", () => {
    it("11.1 respects maskUserInputs: false while keeping other hooks active", async () => {
      const customHarness = new PiTestHarness();
      customHarness.initCustomExtension([], { maskUserInputs: false });

      const email = "user@example.com";
      // Input hook should NOT mask
      const inputRes = await customHarness.triggerInput(`Contact: ${email}`);
      expect(inputRes).toBeUndefined();

      // Tool result hook SHOULD still mask
      const toolRes = await customHarness.triggerToolResult("read_file", [
        { type: "text", text: `Contact: ${email}` },
      ]);
      expect(toolRes).toBeDefined();
      assertRedactedEmail(toolRes?.content[0].text!, email);
    });

    it("11.2 respects maskToolResults: false while keeping input hook active", async () => {
      const customHarness = new PiTestHarness();
      customHarness.initCustomExtension([], { maskToolResults: false });

      const email = "user@example.com";
      // Tool hook should NOT mask
      const toolRes = await customHarness.triggerToolResult("read_file", [
        { type: "text", text: `Contact: ${email}` },
      ]);
      expect(toolRes).toBeUndefined();

      // Input hook SHOULD still mask
      const inputRes = await customHarness.triggerInput(`Contact: ${email}`);
      expect(inputRes).toBeDefined();
      assertRedactedEmail(inputRes?.text!, email);
    });

    it("11.3 respects maskContextMessages: false while keeping input hook active", async () => {
      const customHarness = new PiTestHarness();
      customHarness.initCustomExtension([], { maskContextMessages: false });

      const email = "user@example.com";
      // Context hook should NOT mask
      const ctxRes = await customHarness.triggerContext([
        { role: "user", content: `Contact: ${email}` },
      ]);
      expect(ctxRes).toBeUndefined();

      // Input hook SHOULD still mask
      const inputRes = await customHarness.triggerInput(`Contact: ${email}`);
      expect(inputRes).toBeDefined();
      assertRedactedEmail(inputRes?.text!, email);
    });

    it("11.4 respects notifyOnRedact: false suppressing UI notifications", async () => {
      const customHarness = new PiTestHarness();
      customHarness.initCustomExtension([], { notifyOnRedact: false });

      const email = "user@example.com";
      const inputRes = await customHarness.triggerInput(`Contact: ${email}`);
      expect(inputRes).toBeDefined();
      assertRedactedEmail(inputRes?.text!, email);
      // Notifications must be empty
      expect(customHarness.ctx.ui.notifications.length).toBe(0);
    });

    it("11.5 supports toggling individual rules via service API", async () => {
      const customHarness = new PiTestHarness();
      const service = customHarness.initCustomExtension();

      // Disable email rule
      service.toggleRule("email", false);
      const emailRes = await customHarness.triggerInput("Contact me at user@example.com");
      expect(emailRes).toBeUndefined();

      // API key rule remains enabled
      const key = "sk-1234567890abcdef1234567890";
      const keyRes = await customHarness.triggerInput(`Key: ${key}`);
      expect(keyRes).toBeDefined();
      assertRedactedApiKey(keyRes?.text!, key);
    });
  });

  // =========================================================================
  // Feature Group 12: Extension Entry Point Wiring
  // =========================================================================
  describe("Feature 12: Extension Entry Point Wiring", () => {
    it("12.1 registers all 4 standard Pi hooks on entry point execution", () => {
      const handlers = harness.api.hookHandlers;
      expect(handlers.has("session_start")).toBe(true);
      expect(handlers.has("input")).toBe(true);
      expect(handlers.has("tool_result")).toBe(true);
      expect(handlers.has("context")).toBe(true);
    });

    it("12.2 registers 'pii' slash command on entry point execution", () => {
      const cmd = harness.api.getCommand("pii");
      expect(cmd).toBeDefined();
      expect(cmd?.description).toContain("Manage PII redaction");
    });

    it("12.3 operates with default enabled state out of the box", async () => {
      await harness.triggerSessionStart();
      expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");
    });

    it("12.4 isolates separate extension instances without shared mutable state", async () => {
      const harnessA = new PiTestHarness();
      await harnessA.initExtension();

      const harnessB = new PiTestHarness();
      await harnessB.initExtension();

      // Disable A
      await harnessA.executeCommand("disable");
      expect(harnessA.ctx.ui.getStatus("pii-redact")).toBe("PII: Off");

      // B remains enabled
      await harnessB.triggerSessionStart();
      expect(harnessB.ctx.ui.getStatus("pii-redact")).toBe("PII: On");
    });

    it("12.5 unregisters hook cleanly when unsubscribe returned by on() is called", () => {
      let customCallCount = 0;
      const unsubscribe = harness.api.on("input", () => {
        customCallCount++;
        return undefined;
      });
      unsubscribe();
      expect(customCallCount).toBe(0);
    });
  });
});
