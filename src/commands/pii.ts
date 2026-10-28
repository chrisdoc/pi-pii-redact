import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RedactorService } from "../services/redactor.js";
import { persistConfig } from "../hooks/persist.js";

export function registerPiiCommands(pi: ExtensionAPI, redactor: RedactorService): void {
  pi.registerCommand("pii", {
    description: "Manage PII redaction (status, toggle, rules)",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["status", "toggle", "rules", "enable", "disable"];
      return subcommands
        .filter((sc) => sc.startsWith(prefix.trim().toLowerCase()))
        .map((sc) => ({ value: sc, label: sc }));
    },
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const action = parts[0]?.toLowerCase() || "status";

      if (action === "toggle") {
        const next = !redactor.isEnabled();
        redactor.setEnabled(next);
        persistConfig(pi, redactor);
        ctx.ui.setStatus("pii-redact", next ? "PII: On" : "PII: Off");
        ctx.ui.notify(`PII redaction is now ${next ? "ENABLED" : "DISABLED"}`, "info");
        return;
      }

      if (action === "enable") {
        redactor.setEnabled(true);
        persistConfig(pi, redactor);
        ctx.ui.setStatus("pii-redact", "PII: On");
        ctx.ui.notify("PII redaction ENABLED", "info");
        return;
      }

      if (action === "disable") {
        redactor.setEnabled(false);
        persistConfig(pi, redactor);
        ctx.ui.setStatus("pii-redact", "PII: Off");
        ctx.ui.notify("PII redaction DISABLED", "info");
        return;
      }

      if (action === "rules") {
        const rules = redactor.getRules();
        const ruleList = rules
          .map((r) => `• ${r.name} (${r.id}): ${r.enabled ? "enabled" : "disabled"}`)
          .join("\n");
        ctx.ui.notify(`Active Redaction Rules:\n${ruleList}`, "info");
        return;
      }

      // Default: status
      const state = redactor.isEnabled() ? "ACTIVE" : "INACTIVE";
      const activeRules = redactor.getRules().filter((r) => r.enabled).length;
      ctx.ui.notify(
        `PII Redactor status: ${state}\nActive rules: ${activeRules}/${redactor.getRules().length}`,
        "info"
      );
    },
  });
}
