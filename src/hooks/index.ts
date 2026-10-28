import { compact, generateBranchSummary } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, ToolResultEventResult } from "@earendil-works/pi-coding-agent";
import type { RedactorService } from "../services/redactor.js";
import {
  mapContent,
  mapMessage,
  mapMessages,
  mapSessionEntry,
  mapStringsDeep,
  restoreAssistantMessage,
  restoreStringsInPlace,
} from "./messages.js";
import { loadConfig, loadVault, persistVaultDelta } from "./persist.js";

type JsonValue = unknown;

export function registerHooks(pi: ExtensionAPI, redactor: RedactorService): void {
  const statusText = () => (redactor.isEnabled() ? "PII: On" : "PII: Off");
  const restore = (text: string) => redactor.restore(text);
  const vaultHasEntries = () => redactor.getVault().size > 0;

  /** Redacts one string and counts redactions, for use as a deep-walker callback. */
  const counter = () => {
    const state = { count: 0 };
    const fn = async (text: string): Promise<string> => {
      const result = await redactor.redact(text);
      state.count += result.count;
      return result.text;
    };
    return { state, fn };
  };

  const compactionActive = () => redactor.isEnabled() && redactor.getConfig().maskContextMessages;

  /** Resolves the model and auth used to summarize, or notifies and returns null. */
  const resolveModelAuth = async (ctx: ExtensionContext, what: string) => {
    const model = ctx?.model;
    if (!model) {
      ctx?.ui?.notify?.(`PII redaction: no model available for ${what}; cancelled to avoid leaking plaintext`, "error");
      return null;
    }
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
      ctx?.ui?.notify?.(`PII redaction: ${what} auth failed (${auth.error}); cancelled to avoid leaking plaintext`, "error");
      return null;
    }
    // Provider headers may carry null (= "remove header"); the summarizers only accept strings.
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(auth.headers ?? {})) {
      if (typeof v === "string") headers[k] = v;
    }
    return { model, apiKey: auth.apiKey, headers };
  };

  // Restore the vault and settings from the session, and update the footer status
  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx?.sessionManager?.getEntries?.() ?? [];
    if (ctx?.sessionManager) {
      loadVault(entries, redactor);
      loadConfig(entries, redactor);
    }
    ctx?.ui?.setStatus?.("pii-redact", statusText());
  });

  // Intercept user prompts before expansion or dispatch
  pi.on("input", async (event, ctx) => {
    if (!redactor.isEnabled() || !redactor.getConfig().maskUserInputs) {
      return undefined;
    }

    if (!event || typeof event.text !== "string") {
      return undefined;
    }

    const result = await redactor.redact(event.text);
    persistVaultDelta(pi, redactor);
    if (result.hasRedactions) {
      if (redactor.getConfig().notifyOnRedact) {
        ctx?.ui?.notify?.(`Redacted ${result.count} sensitive item(s) from input`, "info");
      }
      return { action: "transform", text: result.text };
    }
    return undefined;
  });

  // Restore tokens in tool arguments so tools operate on real values (works even while redaction is off)
  pi.on("tool_call", async (event) => {
    if (!event?.input || typeof event.input !== "object" || !vaultHasEntries()) {
      return undefined;
    }
    restoreStringsInPlace(event.input, restore);
    return undefined;
  });

  // Restore assistant replies to plaintext at rest (thinking blocks stay byte-identical)
  pi.on("message_end", async (event) => {
    if (!event?.message || (event.message as any).role !== "assistant" || !vaultHasEntries()) {
      return undefined;
    }
    const restored = await restoreAssistantMessage(event.message, restore);
    return restored !== event.message ? { message: restored } : undefined;
  });

  // Intercept tool results (e.g. read_file, bash output) before storing in session & sending to model
  pi.on("tool_result", async (event, ctx) => {
    if (!redactor.isEnabled() || !redactor.getConfig().maskToolResults) {
      return undefined;
    }

    if (!event || !Array.isArray(event.content)) {
      return undefined;
    }

    const { state, fn } = counter();
    const content = await mapContent(event.content, fn);
    const hasStructured = event.structuredContent !== undefined;
    const structuredContent = hasStructured ? await mapStringsDeep(event.structuredContent as JsonValue, fn) : undefined;
    persistVaultDelta(pi, redactor);

    if (content !== event.content || structuredContent !== event.structuredContent) {
      if (redactor.getConfig().notifyOnRedact) {
        const toolLabel = event?.toolName ? `${event.toolName} output` : "tool output";
        ctx?.ui?.notify?.(`Redacted ${state.count} item(s) from ${toolLabel}`, "info");
      }
      return (hasStructured ? { content, structuredContent } : { content }) as ToolResultEventResult;
    }

    return undefined;
  });

  // Intercept messages in context before LLM requests (all roles; inputs are never mutated)
  pi.on("context", async (event) => {
    if (!redactor.isEnabled() || !redactor.getConfig().maskContextMessages) {
      return undefined;
    }

    if (!event || !Array.isArray(event.messages)) {
      return undefined;
    }

    const { fn } = counter();
    const { messages, changed } = await mapMessages(event.messages, fn);
    persistVaultDelta(pi, redactor);
    return changed ? { messages } : undefined;
  });

  // Compaction calls the model directly, bypassing `context`: take it over with redacted input
  pi.on("session_before_compact", async (event, ctx) => {
    if (!compactionActive()) return undefined;

    try {
      const auth = await resolveModelAuth(ctx, "compaction");
      if (!auth) return { cancel: true };

      const { fn } = counter();
      const prep = event.preparation;
      const preparation = {
        ...prep,
        messagesToSummarize: (await mapMessages(prep.messagesToSummarize ?? [], fn)).messages,
        turnPrefixMessages: (await mapMessages(prep.turnPrefixMessages ?? [], fn)).messages,
        previousSummary: prep.previousSummary ? await fn(prep.previousSummary) : prep.previousSummary,
      };
      const instructions = event.customInstructions ? await fn(event.customInstructions) : undefined;

      const result = await compact(preparation, auth.model, auth.apiKey, auth.headers, instructions, event.signal);
      return { compaction: { ...result, summary: restore(result.summary) } };
    } catch (error) {
      if (!event.signal?.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        ctx?.ui?.notify?.(`PII redaction: compaction failed (${message}); cancelled to avoid leaking plaintext`, "error");
      }
      return { cancel: true };
    } finally {
      persistVaultDelta(pi, redactor);
    }
  });

  // Branch summaries also call the model directly
  pi.on("session_before_tree", async (event, ctx) => {
    if (!compactionActive() || !event?.preparation?.userWantsSummary) return undefined;

    try {
      const auth = await resolveModelAuth(ctx, "branch summary");
      if (!auth) return { cancel: true };

      const { fn } = counter();
      const prep = event.preparation;
      const entries: any[] = [];
      for (const entry of prep.entriesToSummarize ?? []) {
        entries.push(await mapSessionEntry(entry, fn));
      }
      const instructions = prep.customInstructions ? await fn(prep.customInstructions) : undefined;

      const result = await generateBranchSummary(entries, {
        model: auth.model,
        apiKey: auth.apiKey,
        headers: auth.headers,
        signal: event.signal,
        customInstructions: instructions,
        replaceInstructions: prep.replaceInstructions,
      });
      if (result.aborted) return { cancel: true };
      if (result.error || !result.summary) {
        throw new Error(result.error ?? "empty summary");
      }
      return {
        summary: {
          summary: restore(result.summary),
          details: { readFiles: result.readFiles ?? [], modifiedFiles: result.modifiedFiles ?? [] },
          usage: result.usage,
        },
      };
    } catch (error) {
      if (!event.signal?.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        ctx?.ui?.notify?.(`PII redaction: branch summary failed (${message}); cancelled to avoid leaking plaintext`, "error");
      }
      return { cancel: true };
    } finally {
      persistVaultDelta(pi, redactor);
    }
  });

  pi.on("session_shutdown", async () => {
    redactor.dispose();
  });
}
