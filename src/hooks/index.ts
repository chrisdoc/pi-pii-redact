import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RedactorService } from "../services/redactor.js";

export function registerHooks(pi: ExtensionAPI, redactor: RedactorService): void {
  // Update footer status on session start
  pi.on("session_start", async (_event, ctx) => {
    const status = redactor.isEnabled() ? "PII: On" : "PII: Off";
    ctx.ui.setStatus("pii-redact", status);
  });

  // Intercept user prompts before expansion or dispatch
  pi.on("input", async (event, ctx) => {
    if (!redactor.isEnabled() || !redactor.getConfig().maskUserInputs) {
      return undefined;
    }

    const result = await redactor.redact(event.text);
    if (result.hasRedactions) {
      if (redactor.getConfig().notifyOnRedact) {
        ctx.ui.notify(`Redacted ${result.count} sensitive item(s) from input`, "info");
      }
      return { action: "transform", text: result.text };
    }
    return undefined;
  });

  // Intercept tool results (e.g. read_file, bash output) before storing in session & sending to model
  pi.on("tool_result", async (event, ctx) => {
    if (!redactor.isEnabled() || !redactor.getConfig().maskToolResults) {
      return undefined;
    }

    if (!Array.isArray(event.content)) {
      return undefined;
    }

    let changed = false;
    let totalRedactions = 0;

    const sanitizedContent = await Promise.all(
      event.content.map(async (item) => {
        if (item && typeof item === "object" && "type" in item && item.type === "text" && typeof item.text === "string") {
          const result = await redactor.redact(item.text);
          if (result.hasRedactions) {
            changed = true;
            totalRedactions += result.count;
            return { ...item, text: result.text };
          }
        }
        return item;
      })
    );

    if (changed) {
      if (redactor.getConfig().notifyOnRedact) {
        ctx.ui.notify(`Redacted ${totalRedactions} item(s) from ${event.toolName} output`, "info");
      }
      return { content: sanitizedContent };
    }

    return undefined;
  });

  // Intercept messages in context before LLM requests
  pi.on("context", async (event, _ctx) => {
    if (!redactor.isEnabled() || !redactor.getConfig().maskContextMessages) {
      return undefined;
    }

    let modified = false;
    const sanitizedMessages = await Promise.all(
      event.messages.map(async (msg: any) => {
        if (typeof msg.content === "string") {
          const result = await redactor.redact(msg.content);
          if (result.hasRedactions) {
            modified = true;
            return { ...msg, content: result.text };
          }
        } else if (Array.isArray(msg.content)) {
          let blockModified = false;
          const newBlocks = await Promise.all(
            msg.content.map(async (block: any) => {
              if (block && block.type === "text" && typeof block.text === "string") {
                const res = await redactor.redact(block.text);
                if (res.hasRedactions) {
                  blockModified = true;
                  return { ...block, text: res.text };
                }
              }
              return block;
            })
          );
          if (blockModified) {
            modified = true;
            return { ...msg, content: newBlocks };
          }
        }
        return msg;
      })
    );

    return modified ? { messages: sanitizedMessages } : undefined;
  });
}
