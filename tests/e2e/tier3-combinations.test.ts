import { describe, it, expect, beforeEach } from "vitest";
import {
  PiTestHarness,
  assertRedactedEmail,
  assertRedactedApiKey,
  assertRedactedIp,
  assertRedactedPhone,
  assertRedactedCreditCard,
} from "./harness.js";

describe("Tier 3: Cross-Feature Combinations & State Shifts (Opaque-Box E2E)", () => {
  let harness: PiTestHarness;

  beforeEach(async () => {
    harness = new PiTestHarness();
    await harness.initExtension();
  });

  it("3.1 redacts all 5 distinct PII types combined in a single user prompt", async () => {
    const email = "lead-dev@corp.internal";
    const apiKey = "sk-1234567890abcdef1234567890";
    const ip = "10.128.4.99";
    const phone = "555-432-1098";
    const creditCard = "4532-1234-5678-9014";

    const prompt = `Account setup for ${email}:
API Key: ${apiKey}
Internal Gateway: ${ip}
Support Hotline: ${phone}
Corporate Card: ${creditCard}
Please configure the production credentials accordingly.`;

    const result = await harness.triggerInput(prompt);
    expect(result?.action).toBe("transform");
    const output = result?.text!;

    // Assert every sensitive item was completely removed
    assertRedactedEmail(output, email);
    assertRedactedApiKey(output, apiKey);
    assertRedactedIp(output, ip);
    assertRedactedPhone(output, phone);
    assertRedactedCreditCard(output, creditCard);

    // Verify template prose remains intact
    expect(output).toContain("Account setup for");
    expect(output).toContain("API Key:");
    expect(output).toContain("Internal Gateway:");
    expect(output).toContain("Support Hotline:");
    expect(output).toContain("Corporate Card:");
    expect(output).toContain("Please configure the production credentials accordingly.");
  });

  it("3.2 dynamic command toggle alters input hook interception in live session", async () => {
    const email = "alice@example.com";

    // 1. Initial enabled state: input must be transformed
    const res1 = await harness.triggerInput(`Hello ${email}`);
    expect(res1?.action).toBe("transform");
    assertRedactedEmail(res1?.text!, email);

    // 2. Disable via slash command
    await harness.executeCommand("disable");
    expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: Off");

    // 3. Next input: must pass through raw without transformation
    const res2 = await harness.triggerInput(`Hello ${email}`);
    expect(res2).toBeUndefined();

    // 4. Re-enable via slash command toggle
    await harness.executeCommand("toggle");
    expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");

    // 5. Next input: must be transformed again
    const res3 = await harness.triggerInput(`Hello ${email}`);
    expect(res3?.action).toBe("transform");
    assertRedactedEmail(res3?.text!, email);
  });

  it("3.3 dynamic command toggle alters tool_result hook interception in live session", async () => {
    const key = "sk-1234567890abcdef1234567890";

    // 1. Initially enabled
    const res1 = await harness.triggerToolResult("read_file", [
      { type: "text", text: `KEY=${key}` },
    ]);
    expect(res1).toBeDefined();
    assertRedactedApiKey(res1?.content[0].text!, key);

    // 2. Disable via slash command
    await harness.executeCommand("disable");

    // 3. Tool result now passes through unchanged
    const res2 = await harness.triggerToolResult("read_file", [
      { type: "text", text: `KEY=${key}` },
    ]);
    expect(res2).toBeUndefined();

    // 4. Re-enable via slash command
    await harness.executeCommand("enable");

    // 5. Tool result is sanitized once again
    const res3 = await harness.triggerToolResult("read_file", [
      { type: "text", text: `KEY=${key}` },
    ]);
    expect(res3).toBeDefined();
    assertRedactedApiKey(res3?.content[0].text!, key);
  });

  it("3.4 dynamic command toggle alters context hook interception in live session", async () => {
    const ip = "192.168.10.50";

    // 1. Initially enabled
    const res1 = await harness.triggerContext([
      { role: "user", content: `Server is at ${ip}` },
    ]);
    expect(res1).toBeDefined();
    assertRedactedIp(res1?.messages[0].content as string, ip);

    // 2. Disable
    await harness.executeCommand("disable");

    // 3. Context passes through untouched
    const res2 = await harness.triggerContext([
      { role: "user", content: `Server is at ${ip}` },
    ]);
    expect(res2).toBeUndefined();

    // 4. Re-enable
    await harness.executeCommand("enable");

    // 5. Context is sanitized again
    const res3 = await harness.triggerContext([
      { role: "user", content: `Server is at ${ip}` },
    ]);
    expect(res3).toBeDefined();
    assertRedactedIp(res3?.messages[0].content as string, ip);
  });

  it("3.5 sanitizes multi-block tool results with mixed sensitive, clean, and non-text blocks", async () => {
    const apiKey = "ghp_1234567890abcdef1234567890abcdef1234";
    const email = "sysadmin@corp.io";
    const ip = "172.16.0.4";

    const content = [
      { type: "text", text: `Build authorization token: ${apiKey}` },
      { type: "image", mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUg" },
      { type: "text", text: "Compiler version: rustc 1.82.0 (f6e511eec 2024-10-15)" },
      { type: "text", text: `Deployment target: ${ip} maintained by ${email}` },
      { type: "text", text: "" },
    ];

    const result = await harness.triggerToolResult("docker_build", content);
    expect(result).toBeDefined();
    expect(result?.content.length).toBe(5);

    // Block 0 sanitized
    expect(result?.content[0].text).not.toContain(apiKey);
    assertRedactedApiKey(result?.content[0].text!, apiKey);

    // Block 1 preserved
    expect(result?.content[1].type).toBe("image");
    expect(result?.content[1].data).toBe("iVBORw0KGgoAAAANSUhEUg");

    // Block 2 preserved clean text
    expect(result?.content[2].text).toBe("Compiler version: rustc 1.82.0 (f6e511eec 2024-10-15)");

    // Block 3 sanitized both IP and email
    expect(result?.content[3].text).not.toContain(ip);
    expect(result?.content[3].text).not.toContain(email);
    assertRedactedIp(result?.content[3].text!, ip);
    assertRedactedEmail(result?.content[3].text!, email);

    // Block 4 preserved empty
    expect(result?.content[4].text).toBe("");

    // Check notification reports total count across all items
    expect(harness.ctx.ui.notifications.length).toBe(1);
    expect(harness.ctx.ui.notifications[0].message).toMatch(/Redacted 3 item\(s\) from docker_build output/);
  });

  it("3.6 sanitizes multi-turn context messages with alternating string and block structures", async () => {
    const userEmail = "client@domain.com";
    const assistantIp = "10.0.1.25";
    const toolKey = "AKIAIOSFODNN7EXAMPLE";
    const followUpPhone = "555-765-4321";

    const conversation = [
      { role: "system", content: "You are an automated infrastructure assistant." },
      { role: "user", content: `Please review access logs for ${userEmail}.` },
      {
        role: "assistant",
        content: [
          { type: "text", text: `I found incoming connections from host ${assistantIp}.` },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool_use", id: "t1", name: "aws_describe" } as any,
          { type: "text", text: `AWS Account Key identified: ${toolKey}` },
        ],
      },
      { role: "user", content: `If there are issues, reach dispatch at ${followUpPhone}.` },
    ];

    const result = await harness.triggerContext(conversation);
    expect(result).toBeDefined();
    expect(result?.messages.length).toBe(5);

    // Turn 0: Clean system string
    expect(result?.messages[0].content).toBe("You are an automated infrastructure assistant.");

    // Turn 1: User string sanitized
    assertRedactedEmail(result?.messages[1].content as string, userEmail);

    // Turn 2: Assistant text block sanitized
    const turn2Blocks = result?.messages[2].content as Array<{ type: string; text?: string }>;
    assertRedactedIp(turn2Blocks[0].text!, assistantIp);

    // Turn 3: Tool text block sanitized while non-text block preserved
    const turn3Blocks = result?.messages[3].content as Array<any>;
    expect(turn3Blocks[0].type).toBe("tool_use");
    expect(turn3Blocks[0].id).toBe("t1");
    assertRedactedApiKey(turn3Blocks[1].text!, toolKey);

    // Turn 4: User string sanitized
    assertRedactedPhone(result?.messages[4].content as string, followUpPhone);
  });

  it("3.7 handles partial config enabling only tool_result masking while disabling input masking", async () => {
    const customHarness = new PiTestHarness();
    customHarness.initCustomExtension([], {
      enabled: true,
      maskUserInputs: false,
      maskToolResults: true,
      maskContextMessages: false,
      notifyOnRedact: true,
    });

    const email = "user@test.org";
    const ip = "192.168.1.1";

    // Input hook: skipped
    const inRes = await customHarness.triggerInput(`User: ${email}`);
    expect(inRes).toBeUndefined();

    // Tool hook: masked
    const toolRes = await customHarness.triggerToolResult("read_file", [
      { type: "text", text: `Server: ${ip}` },
    ]);
    expect(toolRes).toBeDefined();
    assertRedactedIp(toolRes?.content[0].text!, ip);

    // Context hook: skipped
    const ctxRes = await customHarness.triggerContext([
      { role: "user", content: `User: ${email}` },
    ]);
    expect(ctxRes).toBeUndefined();
  });

  it("3.8 suppresses notifications during hook redactions while slash command notifications remain functional", async () => {
    const customHarness = new PiTestHarness();
    customHarness.initCustomExtension([], {
      enabled: true,
      notifyOnRedact: false,
    });

    // 1. Redact via input hook
    const inRes = await customHarness.triggerInput("Key: sk-1234567890abcdef1234567890");
    expect(inRes?.action).toBe("transform");
    expect(customHarness.ctx.ui.notifications.length).toBe(0);

    // 2. Redact via tool result hook
    const toolRes = await customHarness.triggerToolResult("bash", [
      { type: "text", text: "IP: 10.0.0.1" },
    ]);
    expect(toolRes).toBeDefined();
    expect(customHarness.ctx.ui.notifications.length).toBe(0);

    // 3. Run slash command: command notifications still display to user
    await customHarness.executeCommand("status");
    expect(customHarness.ctx.ui.notifications.length).toBe(1);
    expect(customHarness.ctx.ui.notifications[0].message).toContain("PII Redactor status: ACTIVE");
  });

  it("3.9 rule toggle selective masking when multiple PII types appear in prompt", async () => {
    const customHarness = new PiTestHarness();
    const service = customHarness.initCustomExtension();

    // Disable email rule specifically
    service.toggleRule("email", false);

    const email = "keep-me-visible@company.com";
    const apiKey = "sk-1234567890abcdef1234567890";
    const ip = "192.168.1.50";

    const prompt = `Contact: ${email}, Key: ${apiKey}, Host: ${ip}`;
    const result = await customHarness.triggerInput(prompt);

    expect(result?.action).toBe("transform");
    // Email is preserved because its rule is toggled off
    expect(result?.text).toContain(email);
    // API key and IP are redacted
    assertRedactedApiKey(result?.text!, apiKey);
    assertRedactedIp(result?.text!, ip);
  });

  it("3.10 processes consecutive independent tool executions in an automated pipeline", async () => {
    // Tool 1: git diff
    const gitKey = "ghp_1234567890abcdef1234567890abcdef1234";
    const res1 = await harness.triggerToolResult("git_diff", [
      { type: "text", text: `+ GITHUB_TOKEN=${gitKey}` },
    ]);
    expect(res1).toBeDefined();
    assertRedactedApiKey(res1?.content[0].text!, gitKey);
    expect(harness.ctx.ui.notifications[0].message).toContain("git_diff");

    // Tool 2: curl response
    const email = "subscriber@newsletter.io";
    const res2 = await harness.triggerToolResult("curl", [
      { type: "text", text: `{"status": 200, "user": "${email}"}` },
    ]);
    expect(res2).toBeDefined();
    assertRedactedEmail(res2?.content[0].text!, email);
    expect(harness.ctx.ui.notifications[1].message).toContain("curl");

    // Tool 3: read_file database config
    const dbIp = "10.0.50.12";
    const res3 = await harness.triggerToolResult("read_file", [
      { type: "text", text: `DB_HOST=${dbIp}` },
    ]);
    expect(res3).toBeDefined();
    assertRedactedIp(res3?.content[0].text!, dbIp);
    expect(harness.ctx.ui.notifications[2].message).toContain("read_file");
  });

  it("3.11 slash command autocompletion works seamlessly after dynamic state changes", async () => {
    // Start session
    await harness.triggerSessionStart();
    expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");

    // Test completions
    const initialCompletions = await harness.getCommandCompletions("di");
    expect(initialCompletions).toEqual([{ value: "disable", label: "disable" }]);

    // Execute completion choice
    await harness.executeCommand(initialCompletions[0].value);
    expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: Off");

    // Test completion for enable
    const nextCompletions = await harness.getCommandCompletions("en");
    expect(nextCompletions).toEqual([{ value: "enable", label: "enable" }]);

    // Execute enable
    await harness.executeCommand(nextCompletions[0].value);
    expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");
  });
});
