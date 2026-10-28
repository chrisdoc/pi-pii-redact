import type { PiiStatsSnapshot } from "../services/stats.js";

/** Styling hook; the identity style yields plain text. */
export interface BoardStyle {
  title: (s: string) => string;
  dim: (s: string) => string;
  accent: (s: string) => string;
  bold: (s: string) => string;
}

export const PLAIN_STYLE: BoardStyle = {
  title: (s) => s,
  dim: (s) => s,
  accent: (s) => s,
  bold: (s) => s,
};

/** Input for the board: this-run counters plus session-vault data. */
export interface StatsBoardData {
  enabled: boolean;
  rulesEnabled: number;
  rulesTotal: number;
  /** Unique protected values in the session vault, by vault label. */
  protectedByLabel: Record<string, number>;
  stats: PiiStatsSnapshot;
}

export interface RenderOptions {
  /** Maximum visible width per line (default 80). */
  width?: number;
  style?: BoardStyle;
}

const BAR_WIDTH = 10;

/** "GIVEN_NAME" / "credit-card" -> "given name" / "credit card". */
export function humanize(name: string): string {
  return name.toLowerCase().replace(/[_-]+/g, " ").trim();
}

function bar(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "";
  return "█".repeat(Math.max(1, Math.round((value / max) * BAR_WIDTH)));
}

/** Truncates to `width` characters, ending with an ellipsis. */
function clip(line: string, width: number): string {
  return line.length <= width ? line : width <= 1 ? line.slice(0, Math.max(0, width)) : `${line.slice(0, width - 1)}…`;
}

/** Merges counts of names that humanize to the same text, sorted by count desc then name. */
function sortedEntries(counts: Record<string, number>): Array<[string, number]> {
  const merged = new Map<string, number>();
  for (const [k, v] of Object.entries(counts)) {
    if (v > 0) merged.set(humanize(k), (merged.get(humanize(k)) ?? 0) + v);
  }
  return [...merged.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function breakdown(counts: Record<string, number>, limit: number, empty: string, st: BoardStyle): string[] {
  const entries = sortedEntries(counts).slice(0, limit);
  if (entries.length === 0) return [`  ${st.dim(empty)}`];
  const max = entries[0][1];
  const nameWidth = Math.max(...entries.map(([n]) => n.length));
  return entries.map(([name, n]) => `  ${name.padEnd(nameWidth)}  ${st.accent(bar(n, max).padEnd(BAR_WIDTH))} ${n}`);
}

/**
 * Renders the usage board as lines. Pure: only counts are shown, never original values or tokens.
 * Lines are styled by `style` and truncated to `width` visible characters (style codes must be applied
 * by the caller's truncation when width matters; with the plain style truncation is exact).
 */
export function renderStatsLines(data: StatsBoardData, opts: RenderOptions = {}): string[] {
  const width = opts.width ?? 80;
  const st = opts.style ?? PLAIN_STYLE;
  const s = data.stats;
  const lines: string[] = [];

  lines.push(st.title("PII redaction usage"));
  lines.push(`Status: ${data.enabled ? "ON" : "OFF"} · ${data.rulesEnabled}/${data.rulesTotal} rules enabled`);
  lines.push("");

  const protectedTotal = Object.values(data.protectedByLabel).reduce((a, b) => a + b, 0);
  lines.push(st.bold(`Protected values this session: ${protectedTotal}`));
  lines.push(...breakdown(data.protectedByLabel, 8, "Nothing protected yet", st));
  lines.push("");

  lines.push(st.bold(`Redacted this run: ${s.totalRedacted}`));
  if (s.totalRedacted === 0) {
    lines.push(`  ${st.dim("Nothing redacted yet")}`);
  } else {
    const tools = sortedEntries(s.tool.byTool)
      .slice(0, 5)
      .map(([n, c]) => `${n} ${c}`)
      .join(", ");
    const row = (label: string, n: number, extra?: string) =>
      `  ${label.padEnd(12)} ${String(n).padStart(4)}${extra ? `  (${extra})` : ""}`;
    lines.push(row("Prompts", s.input.items, `${s.input.prompts} ${s.input.prompts === 1 ? "prompt" : "prompts"}`));
    lines.push(row("Tool output", s.tool.items, tools || undefined));
    lines.push(row("Summaries", s.summary.items, s.summary.count > 0 ? `${s.summary.count} run${s.summary.count === 1 ? "" : "s"}` : undefined));
  }
  lines.push("");

  lines.push(st.bold("Top categories this run"));
  lines.push(...breakdown(s.categories, 5, "Nothing yet", st));
  lines.push("");

  const restored = s.restored.toolArgs + s.restored.replies;
  lines.push(
    st.bold(`Restored to real values: ${restored}`) + `  ${st.dim("(tokens swapped back in replies and tool calls)")}`
  );
  lines.push(
    s.context.requests === 0
      ? `Context: ${st.dim("no requests re-masked yet")}`
      : `Context: ${s.context.requests} request${s.context.requests === 1 ? "" : "s"} re-masked (${s.context.items} items)`
  );
  lines.push("");
  lines.push(st.dim("Run counters reset when Pi restarts; protected values come from the session."));

  return lines.map((l) => clip(l, width));
}
