import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RedactorService } from "../services/redactor.js";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { persistConfig } from "../hooks/persist.js";
import { PiiStats } from "../services/stats.js";
import { renderStatsLines, type BoardStyle, type StatsBoardData } from "./stats-board.js";

/** Collects board data from the redactor (vault + rules) and the run counters. */
function collectBoardData(redactor: RedactorService, stats: PiiStats): StatsBoardData {
  const protectedByLabel: Record<string, number> = {};
  for (const entry of redactor.getVault().knownOriginals()) {
    protectedByLabel[entry.label] = (protectedByLabel[entry.label] ?? 0) + 1;
  }
  const rules = redactor.getRules();
  return {
    enabled: redactor.isEnabled(),
    rulesEnabled: rules.filter((r) => r.enabled).length,
    rulesTotal: rules.length,
    protectedByLabel,
    stats: stats.snapshot(),
  };
}

export function registerPiiCommands(pi: ExtensionAPI, redactor: RedactorService, stats: PiiStats = new PiiStats()): void {
  pi.registerCommand("pii", {
    description: "Manage PII redaction (status, toggle, rules, stats)",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["status", "toggle", "rules", "stats", "enable", "disable"];
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

      if (action === "stats") {
        const data = collectBoardData(redactor, stats);
        // RPC mode reports hasUI but its custom() is a no-op, so only the TUI gets the overlay.
        if (ctx.mode === "tui" && typeof ctx.ui?.custom === "function") {
          await ctx.ui.custom<void>(
            (tui, theme, _kb, done) => {
              const style: BoardStyle = {
                title: (t) => theme.bold(theme.fg("accent", t)),
                dim: (t) => theme.fg("dim", t),
                accent: (t) => theme.fg("accent", t),
                bold: (t) => theme.bold(t),
              };
              const body = ["", ...renderStatsLines(data, { width: Number.POSITIVE_INFINITY, style }), ""];
              let offset = 0;
              /** Body rows that fit: terminal height minus borders, hint and a little margin. */
              const visibleRows = () => Math.max(3, (tui?.terminal?.rows ?? 24) - 5);
              const scroll = (delta: number) => {
                const max = Math.max(0, body.length - visibleRows());
                const next = Math.min(max, Math.max(0, offset + delta));
                if (next !== offset) {
                  offset = next;
                  tui?.requestRender?.();
                }
              };
              return {
                handleInput(input: string) {
                  if (matchesKey(input, "escape") || matchesKey(input, "ctrl+c") || input === "q") done();
                  else if (matchesKey(input, "up") || input === "k") scroll(-1);
                  else if (matchesKey(input, "down") || input === "j") scroll(1);
                  else if (matchesKey(input, "pageUp")) scroll(-visibleRows());
                  else if (matchesKey(input, "pageDown")) scroll(visibleRows());
                },
                render(width: number) {
                  // Opaque bordered box: every row is padded so the conversation behind never shows through.
                  const rows = visibleRows();
                  offset = Math.min(offset, Math.max(0, body.length - rows));
                  const shown = body.slice(offset, offset + rows);
                  const hint = theme.fg("dim", body.length > rows ? "↑↓ scroll · Esc to close" : "Esc to close");
                  const innerW = Math.max(1, Math.min(width - 2, Math.max(...[...body, hint].map((l) => visibleWidth(l))) + 2));
                  const row = (l: string) => {
                    const text = truncateToWidth(` ${l}`, innerW);
                    return theme.fg("border", "│") + text + " ".repeat(Math.max(0, innerW - visibleWidth(text))) + theme.fg("border", "│");
                  };
                  return [
                    theme.fg("border", `╭${"─".repeat(innerW)}╮`),
                    ...shown.map(row),
                    row(hint),
                    theme.fg("border", `╰${"─".repeat(innerW)}╯`),
                  ];
                },
                invalidate() {},
              };
            },
            { overlay: true }
          );
          return;
        }
        ctx.ui.notify(renderStatsLines(data).join("\n"), "info");
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
