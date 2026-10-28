import { describe, it, expect, beforeEach } from "vitest";
import {
  PiTestHarness,
  assertRedactedEmail,
  assertRedactedApiKey,
  assertRedactedIp,
  assertRedactedPhone,
  assertRedactedCreditCard,
} from "./harness.js";

describe("Tier 4: Real-World Application Workflows (Opaque-Box E2E)", () => {
  let harness: PiTestHarness;

  beforeEach(async () => {
    harness = new PiTestHarness();
    await harness.initExtension();
  });

  // =========================================================================
  // Scenario 1: Git Diff with Committed Secrets
  // =========================================================================
  it("4.1 sanitizes git diff output containing committed tokens while preserving patch formatting", async () => {
    const openaiKey = "sk-1234567890abcdef1234567890";
    const githubPat = "ghp_1234567890abcdef1234567890abcdef1234";
    const awsKey = "AKIAIOSFODNN7EXAMPLE";

    const diffOutput = `diff --git a/.env b/.env
index 83a1b2c..94d2e3f 100644
--- a/.env
+++ b/.env
@@ -1,4 +1,4 @@
-OPENAI_API_KEY=placeholder
+OPENAI_API_KEY=${openaiKey}
-GITHUB_TOKEN=ghp_old_placeholder
+GITHUB_TOKEN=${githubPat}
-AWS_KEY_ID=old
+AWS_KEY_ID=${awsKey}
diff --git a/src/config.ts b/src/config.ts
@@ -10,3 +10,3 @@
 export const REGION = "us-east-1";`;

    const result = await harness.triggerToolResult("git_diff", [
      { type: "text", text: diffOutput },
    ]);

    expect(result).toBeDefined();
    const sanitized = result?.content[0].text!;

    // Sensitive tokens must be purged
    assertRedactedApiKey(sanitized, openaiKey);
    assertRedactedApiKey(sanitized, githubPat);
    assertRedactedApiKey(sanitized, awsKey);

    // Git diff structural elements must be preserved
    expect(sanitized).toContain("diff --git a/.env b/.env");
    expect(sanitized).toContain("--- a/.env");
    expect(sanitized).toContain("+++ b/.env");
    expect(sanitized).toContain("@@ -1,4 +1,4 @@");
    expect(sanitized).toContain("export const REGION = \"us-east-1\";");
    expect(harness.ctx.ui.notifications[0].message).toContain("git_diff");
  });

  // =========================================================================
  // Scenario 2: Web Server Access and Auth Logs
  // =========================================================================
  it("4.2 sanitizes Nginx web server access logs with IP addresses and user emails", async () => {
    const clientIp1 = "192.168.1.105";
    const clientEmail1 = "alice.smith@enterprise.com";
    const clientIp2 = "10.0.4.12";
    const adminEmail = "admin@cluster.internal";

    const logChunk = `[28/Oct/2026:12:00:01 +0000] IP=${clientIp1} USER=${clientEmail1} "GET /api/v1/user HTTP/1.1" 200 432 "Mozilla/5.0"
[28/Oct/2026:12:00:03 +0000] IP=${clientIp2} USER=${adminEmail} "POST /auth/login HTTP/1.1" 401 89 "curl/8.4.0"
[28/Oct/2026:12:00:05 +0000] System health check status OK (internal heartbeat)`;

    const result = await harness.triggerToolResult("read_file", [
      { type: "text", text: logChunk },
    ]);

    expect(result).toBeDefined();
    const sanitized = result?.content[0].text!;

    // IPs and Emails purged
    assertRedactedIp(sanitized, clientIp1);
    assertRedactedIp(sanitized, clientIp2);
    assertRedactedEmail(sanitized, clientEmail1);
    assertRedactedEmail(sanitized, adminEmail);

    // HTTP log context preserved
    expect(sanitized).toContain('"GET /api/v1/user HTTP/1.1" 200 432 "Mozilla/5.0"');
    expect(sanitized).toContain('"POST /auth/login HTTP/1.1" 401 89 "curl/8.4.0"');
    expect(sanitized).toContain("System health check status OK (internal heartbeat)");
  });

  // =========================================================================
  // Scenario 3: Database Crash Error & Stack Trace
  // =========================================================================
  it("4.3 sanitizes database connection crash traces with host IP, password token, and support phone", async () => {
    const dbHostIp = "10.250.0.1";
    const dbSecretToken = "sk-1234567890abcdef1234567890";
    const onCallPhone = "555-911-0000";

    const crashTrace = `UnhandledPromiseRejection: DatabaseConnectionError: connection to postgresql://app_user:${dbSecretToken}@${dbHostIp}:5432/analytics failed
    at Client._connect (/app/node_modules/pg/lib/client.js:132:11)
    at Connection.connect (/app/node_modules/pg/lib/connection.js:52:17)
    at DatabasePool.init (/app/src/db/pool.ts:45:9)
    at async bootstrapServer (/app/src/server.ts:18:3)
Emergency support contact for database incident: ${onCallPhone}`;

    const result = await harness.triggerInput(`Here is the production crash log:\n${crashTrace}`);
    expect(result?.action).toBe("transform");
    const sanitized = result?.text!;

    // Secrets, IP, and Phone removed
    assertRedactedApiKey(sanitized, dbSecretToken);
    assertRedactedIp(sanitized, dbHostIp);
    assertRedactedPhone(sanitized, onCallPhone);

    // Stack trace structure preserved
    expect(sanitized).toContain("UnhandledPromiseRejection: DatabaseConnectionError:");
    expect(sanitized).toContain("at Client._connect (/app/node_modules/pg/lib/client.js:132:11)");
    expect(sanitized).toContain("at async bootstrapServer (/app/src/server.ts:18:3)");
  });

  // =========================================================================
  // Scenario 4: CI/CD Build & Deployment Pipeline Logs
  // =========================================================================
  it("4.4 sanitizes CI/CD runner build logs containing pipeline tokens and cluster nodes", async () => {
    const gitlabToken = "glpat-1234567890abcdef1234";
    const clusterIp = "172.20.100.5";
    const notificationEmail = "dev-lead@cloud-systems.io";

    const ciLog = `[2026-10-28T10:15:00Z] [CI-RUNNER] Starting job #489201 on runner-x86-04
[2026-10-28T10:15:01Z] [AUTH] Authenticating with registry token ${gitlabToken}
[2026-10-28T10:15:04Z] [DEPLOY] Pushing container images to Kubernetes node ${clusterIp}:8443
[2026-10-28T10:15:10Z] [NOTIFY] Build success webhook dispatched to ${notificationEmail}
[2026-10-28T10:15:12Z] [DONE] Job completed successfully in 12s`;

    const result = await harness.triggerToolResult("ci_runner_logs", [
      { type: "text", text: ciLog },
    ]);

    expect(result).toBeDefined();
    const sanitized = result?.content[0].text!;

    assertRedactedApiKey(sanitized, gitlabToken);
    assertRedactedIp(sanitized, clusterIp);
    assertRedactedEmail(sanitized, notificationEmail);

    expect(sanitized).toContain("[CI-RUNNER] Starting job #489201 on runner-x86-04");
    expect(sanitized).toContain("[DONE] Job completed successfully in 12s");
  });

  // =========================================================================
  // Scenario 5: Customer REST API JSON Payload
  // =========================================================================
  it("4.5 sanitizes JSON API response payloads containing customer profile details", async () => {
    const customerEmail = "customer.care@shopper.co.uk";
    const customerPhone = "555-888-9999";
    const clientIp = "172.16.254.89";
    const cardNumber = "4532-1234-5678-9012";

    const jsonPayload = JSON.stringify(
      {
        id: "usr_99812",
        status: "active",
        email: customerEmail,
        phone: customerPhone,
        last_login_ip: clientIp,
        default_payment: {
          brand: "visa",
          card_number: cardNumber,
          exp: "12/29",
        },
      },
      null,
      2
    );

    const result = await harness.triggerToolResult("fetch_user_api", [
      { type: "text", text: jsonPayload },
    ]);

    expect(result).toBeDefined();
    const sanitized = result?.content[0].text!;

    // Sensitive fields sanitized
    assertRedactedEmail(sanitized, customerEmail);
    assertRedactedPhone(sanitized, customerPhone);
    assertRedactedIp(sanitized, clientIp);
    assertRedactedCreditCard(sanitized, cardNumber);

    // Valid JSON structure remains parseable
    expect(() => JSON.parse(sanitized)).not.toThrow();
    const parsed = JSON.parse(sanitized);
    expect(parsed.id).toBe("usr_99812");
    expect(parsed.status).toBe("active");
    expect(parsed.default_payment.brand).toBe("visa");
    expect(parsed.default_payment.exp).toBe("12/29");
  });

  // =========================================================================
  // Scenario 6: Full Turn Interactive Lifecycle
  // =========================================================================
  it("4.6 full end-to-end interactive turn workflow across input, tool, and context hooks", async () => {
    // 1. Session start initializes status
    await harness.triggerSessionStart();
    expect(harness.ctx.ui.getStatus("pii-redact")).toBe("PII: On");

    // 2. User submits prompt containing an email and IP
    const userPrompt = "Find credentials for dev@internal.net on server 192.168.0.22";
    const inputResult = await harness.triggerInput(userPrompt);
    expect(inputResult?.action).toBe("transform");
    assertRedactedEmail(inputResult?.text!, "dev@internal.net");
    assertRedactedIp(inputResult?.text!, "192.168.0.22");
    expect(harness.ctx.ui.notifications.length).toBe(1);

    // 3. Agent calls read_file tool, which returns a file with an API key
    const fileContent = "DATABASE_URL=postgres://user:sk-1234567890abcdef1234567890@localhost:5432";
    const toolResult = await harness.triggerToolResult("read_file", [
      { type: "text", text: fileContent },
    ]);
    expect(toolResult).toBeDefined();
    assertRedactedApiKey(toolResult?.content[0].text!, "sk-1234567890abcdef1234567890");
    expect(harness.ctx.ui.notifications.length).toBe(2);

    // 4. Context hook prepares the full conversation transcript before LLM dispatch
    const contextMessages = [
      { role: "user", content: inputResult?.text! },
      {
        role: "tool",
        content: [{ type: "text", text: toolResult?.content[0].text! }],
      },
      { role: "user", content: "Also notify admin via emergency line 555-444-3333" },
    ];
    const contextResult = await harness.triggerContext(contextMessages);
    expect(contextResult).toBeDefined();

    const finalMessages = contextResult?.messages!;
    expect(finalMessages.length).toBe(3);
    // User turn 1 has no original email or IP
    expect(finalMessages[0].content).not.toContain("dev@internal.net");
    expect(finalMessages[0].content).not.toContain("192.168.0.22");
    // Tool turn 2 has no original API key
    const toolBlockText = (finalMessages[1].content as Array<{ type: string; text?: string }>)[0].text!;
    expect(toolBlockText).not.toContain("sk-1234567890abcdef1234567890");
    // User turn 3 has redacted emergency phone
    assertRedactedPhone(finalMessages[2].content as string, "555-444-3333");
  });
});
