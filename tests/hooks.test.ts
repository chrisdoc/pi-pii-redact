import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerHooks } from "../src/hooks/index.js";
import { RedactorService } from "../src/services/redactor.js";
import { PiiStats } from "../src/services/stats.js";
import type { RedactorConfig, RedactionResult } from "../src/types.js";
import extensionEntry from "../src/index.js";
import {
  createMockExtensionAPI,
  createMockContext,
  createMockRedactor,
  type MockExtensionAPIFixture,
  type MockContextFixture,
  type MockRedactorFixture,
} from "./mock-pi.js";

describe("registerHooks - Component Unit Tests", () => {
  let mockPi: MockExtensionAPIFixture;

  beforeEach(() => {
    mockPi = createMockExtensionAPI();
  });

  // --------------------------------------------------------------------------
  // Registration Verification
  // --------------------------------------------------------------------------
  describe("Hook Registration", () => {
    it("subscribes to all 9 extension lifecycle hooks", () => {
      const { redactor } = createMockRedactor();
      registerHooks(mockPi.api, redactor);

      expect(mockPi.onSpy).toHaveBeenCalledTimes(9);
      expect(mockPi.handlers.has("session_start")).toBe(true);
      expect(mockPi.handlers.has("input")).toBe(true);
      expect(mockPi.handlers.has("tool_result")).toBe(true);
      expect(mockPi.handlers.has("context")).toBe(true);
      for (const ev of ["tool_call", "message_end", "session_before_compact", "session_before_tree", "session_shutdown"]) {
        expect(mockPi.handlers.has(ev)).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 1. session_start hook
  // --------------------------------------------------------------------------
  describe("1. session_start hook", () => {
    it("1.1 updates status bar to 'PII: On' when redactor is enabled", async () => {
      const { redactor } = createMockRedactor({ enabled: true });
      registerHooks(mockPi.api, redactor);

      const { ctx, setStatusSpy } = createMockContext();
      await mockPi.trigger("session_start", {}, ctx);

      expect(setStatusSpy).toHaveBeenCalledTimes(1);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: On");
    });

    it("1.2 updates status bar to 'PII: Off' when redactor is disabled", async () => {
      const { redactor } = createMockRedactor({ enabled: false });
      registerHooks(mockPi.api, redactor);

      const { ctx, setStatusSpy } = createMockContext();
      await mockPi.trigger("session_start", {}, ctx);

      expect(setStatusSpy).toHaveBeenCalledTimes(1);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: Off");
    });

    it("1.3 handles headless context safely without throwing when ctx.ui is undefined", async () => {
      const { redactor } = createMockRedactor({ enabled: true });
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext({ headless: true });
      await expect(mockPi.trigger("session_start", {}, ctx)).resolves.not.toThrow();
    });

    it("1.4 handles undefined or null ctx gracefully", async () => {
      const { redactor } = createMockRedactor({ enabled: true });
      registerHooks(mockPi.api, redactor);

      await expect(mockPi.trigger("session_start", {}, undefined)).resolves.not.toThrow();
      await expect(mockPi.trigger("session_start", {}, null)).resolves.not.toThrow();
    });

    it("1.5 handles ctx.ui where setStatus is undefined gracefully", async () => {
      const { redactor } = createMockRedactor({ enabled: true });
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext({ missingSetStatus: true });
      await expect(mockPi.trigger("session_start", {}, ctx)).resolves.not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 2. input hook
  // --------------------------------------------------------------------------
  describe("2. input hook", () => {
    it("2.1 intercepts prompt with PII and returns transform action with redacted text", async () => {
      const { redactor, redactSpy } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text: text.replace("alice@example.com", "[EMAIL_1]"),
          hasRedactions: true,
          count: 1,
          redactions: [
            {
              category: "email",
              ruleId: "email",
              original: "alice@example.com",
              masked: "[EMAIL_1]",
              placeholder: "[EMAIL_1]",
            },
          ],
          restore: (t: string) => t.replace("[EMAIL_1]", "alice@example.com"),
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx, notifySpy } = createMockContext();
      const result = await mockPi.trigger("input", { text: "Contact alice@example.com now" }, ctx);

      expect(redactSpy).toHaveBeenCalledWith("Contact alice@example.com now");
      expect(result).toEqual({
        action: "transform",
        text: "Contact [EMAIL_1] now",
      });
      expect(notifySpy).toHaveBeenCalledWith("Redacted 1 sensitive item(s) from input", "info");
    });

    it("2.2 dispatches info notification with multiple redaction count", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async () => ({
          text: "Redacted [EMAIL_1] and [API_KEY_1]",
          hasRedactions: true,
          count: 2,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx, notifySpy } = createMockContext();
      const result = await mockPi.trigger("input", { text: "original text" }, ctx);

      expect(result?.action).toBe("transform");
      expect(notifySpy).toHaveBeenCalledWith("Redacted 2 sensitive item(s) from input", "info");
    });

    it("2.3 suppresses UI notification when notifyOnRedact is false while still transforming", async () => {
      const { redactor } = createMockRedactor({
        config: { notifyOnRedact: false },
        redactImpl: async (text: string) => ({
          text: "[MASKED]",
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx, notifySpy } = createMockContext();
      const result = await mockPi.trigger("input", { text: "secret" }, ctx);

      expect(result).toEqual({
        action: "transform",
        text: "[MASKED]",
      });
      expect(notifySpy).not.toHaveBeenCalled();
    });

    it("2.4 returns undefined when input contains no sensitive data", async () => {
      const { redactor, redactSpy } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text,
          hasRedactions: false,
          count: 0,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx, notifySpy } = createMockContext();
      const result = await mockPi.trigger("input", { text: "Clean prompt" }, ctx);

      expect(redactSpy).toHaveBeenCalledWith("Clean prompt");
      expect(result).toBeUndefined();
      expect(notifySpy).not.toHaveBeenCalled();
    });

    it("2.5 bypasses redaction and returns undefined when redactor is globally disabled", async () => {
      const { redactor, redactSpy } = createMockRedactor({ enabled: false });
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("input", { text: "secret@domain.com" }, ctx);

      expect(result).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("2.6 bypasses redaction and returns undefined when maskUserInputs is false", async () => {
      const { redactor, redactSpy } = createMockRedactor({
        config: { maskUserInputs: false },
      });
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("input", { text: "secret@domain.com" }, ctx);

      expect(result).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("2.7 safely returns undefined for null or undefined event", async () => {
      const { redactor, redactSpy } = createMockRedactor();
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      expect(await mockPi.trigger("input", null, ctx)).toBeUndefined();
      expect(await mockPi.trigger("input", undefined, ctx)).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("2.8 safely returns undefined for malformed event with missing or non-string text", async () => {
      const { redactor, redactSpy } = createMockRedactor();
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      expect(await mockPi.trigger("input", {}, ctx)).toBeUndefined();
      expect(await mockPi.trigger("input", { text: 123 }, ctx)).toBeUndefined();
      expect(await mockPi.trigger("input", { text: null }, ctx)).toBeUndefined();
      expect(await mockPi.trigger("input", { text: {} }, ctx)).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("2.9 safely transforms input when context is headless (ctx.ui undefined)", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async () => ({
          text: "[MASKED]",
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext({ headless: true });
      const result = await mockPi.trigger("input", { text: "secret" }, ctx);

      expect(result).toEqual({ action: "transform", text: "[MASKED]" });
    });

    it("2.10 safely transforms input when ctx is null or undefined", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async () => ({
          text: "[MASKED]",
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const result = await mockPi.trigger("input", { text: "secret" }, undefined);
      expect(result).toEqual({ action: "transform", text: "[MASKED]" });
    });
  });

  // --------------------------------------------------------------------------
  // 3. tool_result hook
  // --------------------------------------------------------------------------
  describe("3. tool_result hook", () => {
    it("3.1 sanitizes single text item in content array and returns new content", async () => {
      const { redactor, redactSpy } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text: text.replace("sk-secret", "[API_KEY_1]"),
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx, notifySpy } = createMockContext();
      const event = {
        toolName: "read_file",
        content: [{ type: "text", text: "config with sk-secret" }],
      };

      const result = await mockPi.trigger("tool_result", event, ctx);

      expect(redactSpy).toHaveBeenCalledWith("config with sk-secret");
      expect(result).toEqual({
        content: [{ type: "text", text: "config with [API_KEY_1]" }],
      });
      expect(notifySpy).toHaveBeenCalledWith("Redacted 1 item(s) from read_file output", "info");
    });

    it("3.2 sanitizes multiple text items and aggregates total redaction count", async () => {
      let callIndex = 0;
      const { redactor } = createMockRedactor({
        redactImpl: async () => {
          callIndex++;
          return {
            text: `[REDACTED_${callIndex}]`,
            hasRedactions: true,
            count: callIndex, // 1 in first, 2 in second -> total 3
            redactions: [],
            restore: (t: string) => t,
          };
        },
      });
      registerHooks(mockPi.api, redactor);

      const { ctx, notifySpy } = createMockContext();
      const event = {
        toolName: "bash",
        content: [
          { type: "text", text: "first log" },
          { type: "text", text: "second log" },
        ],
      };

      const result = await mockPi.trigger("tool_result", event, ctx);

      expect(result?.content).toEqual([
        { type: "text", text: "[REDACTED_1]" },
        { type: "text", text: "[REDACTED_2]" },
      ]);
      expect(notifySpy).toHaveBeenCalledWith("Redacted 3 item(s) from bash output", "info");
    });

    it("3.3 preserves non-text items (image, binary) unmodified alongside sanitized text blocks", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text: text.replace("secret", "[TOKEN]"),
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const imageItem = { type: "image", data: "base64rawdata...", mimeType: "image/png" };
      const event = {
        toolName: "browser",
        content: [imageItem, { type: "text", text: "found secret here" }],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("tool_result", event, ctx);

      expect(result?.content[0]).toBe(imageItem); // Reference and properties preserved exactly
      expect(result?.content[1]).toEqual({ type: "text", text: "found [TOKEN] here" });
    });

    it("3.4 preserves additional custom properties on text items", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text: "[MASKED]",
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const textItem = {
        type: "text",
        text: "secret text",
        customId: "block-99",
        metadata: { source: "stdout", exitCode: 0 },
      };
      const event = {
        toolName: "exec",
        content: [textItem],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("tool_result", event, ctx);

      expect(result?.content[0]).toEqual({
        type: "text",
        text: "[MASKED]",
        customId: "block-99",
        metadata: { source: "stdout", exitCode: 0 },
      });
    });

    it("3.5 uses fallback label 'tool output' when toolName is missing or empty", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async () => ({
          text: "[MASKED]",
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx, notifySpy } = createMockContext();

      // Test with undefined toolName
      await mockPi.trigger("tool_result", { content: [{ type: "text", text: "secret" }] }, ctx);
      expect(notifySpy).toHaveBeenCalledWith("Redacted 1 item(s) from tool output", "info");

      notifySpy.mockClear();

      // Test with empty string toolName
      await mockPi.trigger("tool_result", { toolName: "", content: [{ type: "text", text: "secret" }] }, ctx);
      expect(notifySpy).toHaveBeenCalledWith("Redacted 1 item(s) from tool output", "info");
    });

    it("3.6 suppresses notification when notifyOnRedact is false while still returning sanitized content", async () => {
      const { redactor } = createMockRedactor({
        config: { notifyOnRedact: false },
        redactImpl: async () => ({
          text: "[MASKED]",
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx, notifySpy } = createMockContext();
      const result = await mockPi.trigger(
        "tool_result",
        { toolName: "read_file", content: [{ type: "text", text: "secret" }] },
        ctx
      );

      expect(result).toBeDefined();
      expect(notifySpy).not.toHaveBeenCalled();
    });

    it("3.7 returns undefined when text items contain no sensitive data", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text,
          hasRedactions: false,
          count: 0,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx, notifySpy } = createMockContext();
      const result = await mockPi.trigger(
        "tool_result",
        { toolName: "bash", content: [{ type: "text", text: "clean output" }] },
        ctx
      );

      expect(result).toBeUndefined();
      expect(notifySpy).not.toHaveBeenCalled();
    });

    it("3.8 bypasses redaction and returns undefined when redactor is globally disabled", async () => {
      const { redactor, redactSpy } = createMockRedactor({ enabled: false });
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      const result = await mockPi.trigger(
        "tool_result",
        { toolName: "bash", content: [{ type: "text", text: "secret" }] },
        ctx
      );

      expect(result).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("3.9 bypasses redaction and returns undefined when maskToolResults is false", async () => {
      const { redactor, redactSpy } = createMockRedactor({
        config: { maskToolResults: false },
      });
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      const result = await mockPi.trigger(
        "tool_result",
        { toolName: "bash", content: [{ type: "text", text: "secret" }] },
        ctx
      );

      expect(result).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("3.10 safely returns undefined for null or undefined event", async () => {
      const { redactor, redactSpy } = createMockRedactor();
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      expect(await mockPi.trigger("tool_result", null, ctx)).toBeUndefined();
      expect(await mockPi.trigger("tool_result", undefined, ctx)).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("3.11 safely returns undefined for event without content array", async () => {
      const { redactor, redactSpy } = createMockRedactor();
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      expect(await mockPi.trigger("tool_result", {}, ctx)).toBeUndefined();
      expect(await mockPi.trigger("tool_result", { content: null }, ctx)).toBeUndefined();
      expect(await mockPi.trigger("tool_result", { content: "string" }, ctx)).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("3.12 safely handles content array containing null or non-object items", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text: `[SANITIZED_${text}]`,
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      const event = {
        toolName: "mixed",
        content: [null, undefined, 42, "raw-string", { type: "text", text: "val" }, { type: "custom" }],
      };

      const result = await mockPi.trigger("tool_result", event, ctx);

      expect(result?.content[0]).toBeNull();
      expect(result?.content[1]).toBeUndefined();
      expect(result?.content[2]).toBe(42);
      expect(result?.content[3]).toBe("raw-string");
      expect(result?.content[4]).toEqual({ type: "text", text: "[SANITIZED_val]" });
      expect(result?.content[5]).toEqual({ type: "custom" });
    });

    it("3.13 safely sanitizes tool result when context is headless (ctx.ui undefined)", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async () => ({
          text: "[MASKED]",
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext({ headless: true });
      const event = {
        toolName: "read_file",
        content: [{ type: "text", text: "secret" }],
      };

      const result = await mockPi.trigger("tool_result", event, ctx);
      expect(result).toEqual({ content: [{ type: "text", text: "[MASKED]" }] });
    });
  });

  // --------------------------------------------------------------------------
  // 4. context hook
  // --------------------------------------------------------------------------
  describe("4. context hook", () => {
    it("4.1 sanitizes string message content containing sensitive data", async () => {
      const { redactor, redactSpy } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text: text.replace("user@corp.com", "[EMAIL_1]"),
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const event = {
        messages: [
          { role: "system", content: "You are an assistant" },
          { role: "user", content: "My email is user@corp.com" },
        ],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("context", event, ctx);

      expect(redactSpy).toHaveBeenCalledWith("You are an assistant");
      expect(redactSpy).toHaveBeenCalledWith("My email is user@corp.com");
      expect(result).toEqual({
        messages: [
          { role: "system", content: "You are an assistant" },
          { role: "user", content: "My email is [EMAIL_1]" },
        ],
      });
    });

    it("4.2 sanitizes array message content blocks with text items", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text: text.replace("192.168.1.1", "[IP_ADDRESS_1]"),
          hasRedactions: text.includes("192.168.1.1"),
          count: text.includes("192.168.1.1") ? 1 : 0,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const event = {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Server at 192.168.1.1 is down" },
              { type: "text", text: "Please investigate" },
            ],
          },
        ],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("context", event, ctx);

      expect(result?.messages[0].content).toEqual([
        { type: "text", text: "Server at [IP_ADDRESS_1] is down" },
        { type: "text", text: "Please investigate" },
      ]);
    });

    it("4.3 preserves non-text blocks in array message content untouched", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text: text.replace("secret", "[TOKEN]"),
          hasRedactions: text.includes("secret"),
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const imageBlock = { type: "image", source: { type: "base64", data: "abcd" } };
      const event = {
        messages: [
          {
            role: "user",
            content: [imageBlock, { type: "text", text: "check secret key" }],
          },
        ],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("context", event, ctx);

      expect(result?.messages[0].content[0]).toBe(imageBlock);
      expect(result?.messages[0].content[1]).toEqual({ type: "text", text: "check [TOKEN] key" });
    });

    it("4.4 preserves message roles and other metadata properties on message objects", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async () => ({
          text: "[MASKED]",
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const event = {
        messages: [
          {
            role: "assistant",
            name: "claude",
            content: "secret",
            timestamp: 123456789,
          },
        ],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("context", event, ctx);

      expect(result?.messages[0]).toEqual({
        role: "assistant",
        name: "claude",
        content: "[MASKED]",
        timestamp: 123456789,
      });
    });

    it("4.5 handles mixed conversations with string content and array content blocks", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async (text: string) => {
          const has = text.includes("pii");
          return {
            text: has ? text.replace("pii", "[PII]") : text,
            hasRedactions: has,
            count: has ? 1 : 0,
            redactions: [],
            restore: (t: string) => t,
          };
        },
      });
      registerHooks(mockPi.api, redactor);

      const event = {
        messages: [
          { role: "system", content: "clean system" },
          { role: "user", content: "turn with pii here" },
          {
            role: "assistant",
            content: [{ type: "text", text: "clean reply" }],
          },
          {
            role: "user",
            content: [{ type: "text", text: "block with pii" }],
          },
        ],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("context", event, ctx);

      expect(result?.messages).toEqual([
        { role: "system", content: "clean system" },
        { role: "user", content: "turn with [PII] here" },
        {
          role: "assistant",
          content: [{ type: "text", text: "clean reply" }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "block with [PII]" }],
        },
      ]);
    });

    it("4.6 returns undefined when no messages in context contain sensitive data", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text,
          hasRedactions: false,
          count: 0,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const event = {
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello world" },
        ],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("context", event, ctx);

      expect(result).toBeUndefined();
    });

    it("4.7 bypasses redaction and returns undefined when redactor is globally disabled", async () => {
      const { redactor, redactSpy } = createMockRedactor({ enabled: false });
      registerHooks(mockPi.api, redactor);

      const event = {
        messages: [{ role: "user", content: "user@domain.com" }],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("context", event, ctx);

      expect(result).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("4.8 bypasses redaction and returns undefined when maskContextMessages is false", async () => {
      const { redactor, redactSpy } = createMockRedactor({
        config: { maskContextMessages: false },
      });
      registerHooks(mockPi.api, redactor);

      const event = {
        messages: [{ role: "user", content: "user@domain.com" }],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("context", event, ctx);

      expect(result).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("4.9 safely returns undefined for null or undefined event", async () => {
      const { redactor, redactSpy } = createMockRedactor();
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      expect(await mockPi.trigger("context", null, ctx)).toBeUndefined();
      expect(await mockPi.trigger("context", undefined, ctx)).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("4.10 safely returns undefined for event without messages array", async () => {
      const { redactor, redactSpy } = createMockRedactor();
      registerHooks(mockPi.api, redactor);

      const { ctx } = createMockContext();
      expect(await mockPi.trigger("context", {}, ctx)).toBeUndefined();
      expect(await mockPi.trigger("context", { messages: null }, ctx)).toBeUndefined();
      expect(await mockPi.trigger("context", { messages: "string" }, ctx)).toBeUndefined();
      expect(redactSpy).not.toHaveBeenCalled();
    });

    it("4.11 safely handles null or non-object message entries in messages array", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text: `[REDACTED_${text}]`,
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const event = {
        messages: [null, undefined, 123, { role: "user", content: "secret" }],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("context", event, ctx);

      expect(result?.messages[0]).toBeNull();
      expect(result?.messages[1]).toBeUndefined();
      expect(result?.messages[2]).toBe(123);
      expect(result?.messages[3]).toEqual({ role: "user", content: "[REDACTED_secret]" });
    });

    it("4.12 safely handles messages with null, undefined, or non-string/non-array content", async () => {
      const { redactor } = createMockRedactor({
        redactImpl: async (text: string) => ({
          text: `[REDACTED_${text}]`,
          hasRedactions: true,
          count: 1,
          redactions: [],
          restore: (t: string) => t,
        }),
      });
      registerHooks(mockPi.api, redactor);

      const event = {
        messages: [
          { role: "assistant", content: null },
          { role: "assistant", content: undefined },
          { role: "assistant", content: 123 },
          { role: "user", content: "secret" },
        ],
      };

      const { ctx } = createMockContext();
      const result = await mockPi.trigger("context", event, ctx);

      expect(result?.messages[0]).toEqual({ role: "assistant", content: null });
      expect(result?.messages[1]).toEqual({ role: "assistant", content: undefined });
      expect(result?.messages[2]).toEqual({ role: "assistant", content: 123 });
      expect(result?.messages[3]).toEqual({ role: "user", content: "[REDACTED_secret]" });
    });
  });

  // --------------------------------------------------------------------------
  // 5. Component Integration with Real RedactorService
  // --------------------------------------------------------------------------
  describe("5. Component Integration with Real RedactorService", () => {
    let realRedactor: RedactorService;

    beforeEach(() => {
      realRedactor = new RedactorService();
      registerHooks(mockPi.api, realRedactor);
    });

    it("5.1 session_start hook correctly reflects real RedactorService initial state", async () => {
      const { ctx, setStatusSpy } = createMockContext();
      await mockPi.trigger("session_start", {}, ctx);

      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: On");

      // After disabling
      realRedactor.setEnabled(false);
      setStatusSpy.mockClear();
      await mockPi.trigger("session_start", {}, ctx);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: Off");
    });

    it("5.2 input hook redacts email and API key using real redaction engine", async () => {
      const { ctx, notifySpy } = createMockContext();
      const prompt = "Please send credentials to developer@example.com using sk-1234567890abcdef1234567890";
      const result = await mockPi.trigger("input", { text: prompt }, ctx);

      expect(result).toBeDefined();
      expect(result?.action).toBe("transform");
      expect(result?.text).toMatch(/\[EMAIL_\d+#[a-z0-9]{4}\]/);
      expect(result?.text).toMatch(/\[API_KEY_\d+#[a-z0-9]{4}\]/);
      expect(result?.text).not.toContain("developer@example.com");
      expect(result?.text).not.toContain("sk-1234567890abcdef1234567890");
      expect(notifySpy).toHaveBeenCalledTimes(1);
    });

    it("5.3 tool_result hook sanitizes real PII while preserving image objects", async () => {
      const { ctx, notifySpy } = createMockContext();
      const imageBlock = { type: "image", mimeType: "image/png", data: "iVBORw0KGgo..." };
      const event = {
        toolName: "read_file",
        content: [
          imageBlock,
          { type: "text", text: "Database host is 192.168.1.100 port 5432 with token ghp_1234567890abcdef1234567890abcdef1234" },
        ],
      };

      const result = await mockPi.trigger("tool_result", event, ctx);

      expect(result).toBeDefined();
      expect(result?.content[0]).toBe(imageBlock);
      expect(result?.content[1].text).toMatch(/\[IP_ADDRESS_\d+#[a-z0-9]{4}\]/);
      expect(result?.content[1].text).toMatch(/\[API_KEY_\d+#[a-z0-9]{4}\]/);
      expect(result?.content[1].text).not.toContain("192.168.1.100");
      expect(result?.content[1].text).not.toContain("ghp_1234567890abcdef1234567890abcdef1234");
      expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining("read_file output"), "info");
    });

    it("5.4 context hook sanitizes conversation history using real redactor engine", async () => {
      const { ctx } = createMockContext();
      const event = {
        messages: [
          { role: "system", content: "You are a helpful coding assistant" },
          { role: "user", content: "Call Dr. Alice Grant at +1-555-0199 now" },
        ],
      };

      const result = await mockPi.trigger("context", event, ctx);

      expect(result).toBeDefined();
      expect(result?.messages[0].content).toBe("You are a helpful coding assistant");
      expect(result?.messages[1].content).toMatch(/\[PHONE_\d+#[a-z0-9]{4}\]/);
      expect(result?.messages[1].content).not.toContain("+1-555-0199");
    });

    it("5.5 dynamically toggling real RedactorService disables all hook interceptions", async () => {
      const { ctx } = createMockContext();
      realRedactor.setEnabled(false);

      const inputResult = await mockPi.trigger("input", { text: "user@example.com" }, ctx);
      expect(inputResult).toBeUndefined();

      const toolResult = await mockPi.trigger("tool_result", { content: [{ type: "text", text: "user@example.com" }] }, ctx);
      expect(toolResult).toBeUndefined();

      const contextResult = await mockPi.trigger("context", { messages: [{ role: "user", content: "user@example.com" }] }, ctx);
      expect(contextResult).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Extension Entry Point Wiring (src/index.ts)
  // --------------------------------------------------------------------------
  describe("6. Extension Entry Point Wiring (src/index.ts)", () => {
    let mock: MockExtensionAPIFixture;

    beforeEach(() => {
      mock = createMockExtensionAPI();
    });

    it("6.1 registers all 9 lifecycle hooks and the slash command on ExtensionAPI", () => {
      extensionEntry(mock.api);

      // Verify hooks registered
      expect(mock.onSpy).toHaveBeenCalledTimes(9);
      expect(mock.handlers.has("session_start")).toBe(true);
      expect(mock.handlers.has("input")).toBe(true);
      expect(mock.handlers.has("tool_result")).toBe(true);
      expect(mock.handlers.has("context")).toBe(true);

      // Verify command registered
      expect(mock.registerCommandSpy).toHaveBeenCalledWith("pii", expect.objectContaining({
        description: expect.any(String),
        getArgumentCompletions: expect.any(Function),
        handler: expect.any(Function),
      }));
    });

    it("6.2 wires hooks and commands to the same shared RedactorService instance", async () => {
      extensionEntry(mock.api);
      const ctx = createMockContext();

      // Initially enabled: session_start reports PII: On
      await mock.trigger("session_start", {}, ctx.ctx);
      expect(ctx.setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: On");

      // Toggle via slash command: disables redactor
      await mock.executeCommand("pii", "toggle", ctx.ctx);
      expect(ctx.setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: Off");

      // Input hook now bypasses redaction because redactor is disabled
      const result = await mock.trigger("input", { text: "user@example.com" }, ctx.ctx);
      expect(result).toBeUndefined();
    });
  });
});

describe("registerHooks - usage stats", () => {
  const email = (n: number) => ({
    text: "[EMAIL_1]",
    hasRedactions: true,
    count: n,
    redactions: Array.from({ length: n }, () => ({
      category: "email" as const,
      ruleId: "email",
      original: "a@b.co",
      masked: "[EMAIL_1]",
    })),
    restore: (t: string) => t,
  });

  it("counts input and tool_result redactions by source, tool and category", async () => {
    const mockPi = createMockExtensionAPI();
    const { redactor } = createMockRedactor({ redactImpl: async () => email(2) });
    const stats = new PiiStats();
    registerHooks(mockPi.api, redactor, stats);
    const { ctx } = createMockContext();

    await mockPi.trigger("input", { text: "x" }, ctx);
    await mockPi.trigger("tool_result", { toolName: "bash", content: [{ type: "text", text: "y" }] }, ctx);
    await mockPi.trigger("context", { messages: [{ role: "user", content: "z" }] }, ctx);

    const snap = stats.snapshot();
    expect(snap.input).toEqual({ items: 2, prompts: 1 });
    expect(snap.tool.byTool).toEqual({ bash: 2 });
    expect(snap.categories).toEqual({ email: 4 });
    expect(snap.context).toEqual({ requests: 1, items: 2 });
    expect(snap.totalRedacted).toBe(4);
  });

  it("counts restores in tool_call args and assistant replies", async () => {
    const mockPi = createMockExtensionAPI();
    const fx = createMockRedactor();
    const token = fx.vault.tokenFor("EMAIL", "a@b.co");
    const stats = new PiiStats();
    registerHooks(mockPi.api, fx.redactor, stats);

    const input = { to: `${token} ${token}` };
    await mockPi.trigger("tool_call", { input });
    expect(input.to).toBe("a@b.co a@b.co");

    await mockPi.trigger("message_end", {
      message: { role: "assistant", content: [{ type: "text", text: `hi ${token}` }] },
    });
    expect(stats.snapshot().restored).toEqual({ toolArgs: 2, replies: 1 });
  });
});
