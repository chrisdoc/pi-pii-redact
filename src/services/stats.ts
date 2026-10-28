import type { RedactionDetail } from "../types.js";

const TOKEN_LABEL = /^\[([A-Z][A-Z0-9_]*)_\d+#[a-z0-9]{4}\]$/;

/** Where a redaction happened. `context` is tracked separately because it re-redacts the whole history. */
export type RedactionSource = "input" | "tool" | "summary" | "context";

/** Plain-data view of the usage counters for the current Pi process. */
export interface PiiStatsSnapshot {
  input: { items: number; prompts: number };
  tool: { items: number; byTool: Record<string, number> };
  summary: { items: number; count: number };
  /** Items per category, excluding context re-masking. */
  categories: Record<string, number>;
  context: { requests: number; items: number };
  restored: { toolArgs: number; replies: number };
  /** Input + tool + summary items (context excluded). */
  totalRedacted: number;
}

/** In-memory usage counters ("this run"); they reset when Pi restarts or reloads. */
export class PiiStats {
  private input = { items: 0, prompts: 0 };
  private tool = { items: 0, byTool: new Map<string, number>() };
  private summary = { items: 0, count: 0 };
  private categories = new Map<string, number>();
  private context = { requests: 0, items: 0 };
  private restored = { toolArgs: 0, replies: 0 };

  /** Records a redaction. No-op when `count` is not positive. Context items never touch totals or categories. */
  public recordRedaction(
    source: RedactionSource,
    count: number,
    details: ReadonlyArray<Pick<RedactionDetail, "category"> & Partial<Pick<RedactionDetail, "masked">>> = [],
    toolName?: string
  ): void {
    if (!(count > 0)) return;
    if (source === "context") {
      this.context.requests += 1;
      this.context.items += count;
      return;
    }
    if (source === "input") {
      this.input.items += count;
      this.input.prompts += 1;
    } else if (source === "tool") {
      this.tool.items += count;
      const name = toolName || "unknown";
      this.tool.byTool.set(name, (this.tool.byTool.get(name) ?? 0) + count);
    } else {
      this.summary.items += count;
      this.summary.count += 1;
    }
    for (const d of details) {
      // Prefer the vault token's label so categories match the "protected values" labels.
      const key = TOKEN_LABEL.exec(d.masked ?? "")?.[1] ?? d.category;
      this.categories.set(key, (this.categories.get(key) ?? 0) + 1);
    }
  }

  /** Records tokens restored in tool-call arguments. */
  public recordToolArgRestore(n = 1): void {
    this.restored.toolArgs += n;
  }

  /** Records tokens restored in assistant replies. */
  public recordReplyRestore(n = 1): void {
    this.restored.replies += n;
  }

  public snapshot(): PiiStatsSnapshot {
    return {
      input: { ...this.input },
      tool: { items: this.tool.items, byTool: Object.fromEntries(this.tool.byTool) },
      summary: { ...this.summary },
      categories: Object.fromEntries(this.categories),
      context: { ...this.context },
      restored: { ...this.restored },
      totalRedacted: this.input.items + this.tool.items + this.summary.items,
    };
  }

  public reset(): void {
    this.input = { items: 0, prompts: 0 };
    this.tool = { items: 0, byTool: new Map() };
    this.summary = { items: 0, count: 0 };
    this.categories = new Map();
    this.context = { requests: 0, items: 0 };
    this.restored = { toolArgs: 0, replies: 0 };
  }
}
