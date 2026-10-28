import { describe, it, expect } from "vitest";
import { PiiStats } from "../src/services/stats.js";
import { renderStatsLines, humanize, type StatsBoardData } from "../src/commands/stats-board.js";

const d = (category: string) => ({ category }) as any;

function board(stats: PiiStats, over: Partial<StatsBoardData> = {}): StatsBoardData {
  return {
    enabled: true,
    rulesEnabled: 23,
    rulesTotal: 24,
    protectedByLabel: {},
    stats: stats.snapshot(),
    ...over,
  };
}

describe("PiiStats", () => {
  it("counts categories by vault token label when the item was tokenized", () => {
    const s = new PiiStats();
    s.recordRedaction("input", 2, [
      { category: "ip", masked: "[IP_ADDRESS_1#k7q2]" },
      { category: "api-key", masked: "sk-***" },
    ] as any);
    expect(s.snapshot().categories).toEqual({ IP_ADDRESS: 1, "api-key": 1 });
  });

  it("counts by source, tool and category", () => {
    const s = new PiiStats();
    s.recordRedaction("input", 2, [d("email"), d("phone")]);
    s.recordRedaction("tool", 3, [d("email"), d("email"), d("ip")], "bash");
    s.recordRedaction("tool", 1, [d("email")]);
    s.recordRedaction("summary", 1, [d("phone")]);
    const snap = s.snapshot();
    expect(snap.input).toEqual({ items: 2, prompts: 1 });
    expect(snap.tool.items).toBe(4);
    expect(snap.tool.byTool).toEqual({ bash: 3, unknown: 1 });
    expect(snap.summary).toEqual({ items: 1, count: 1 });
    expect(snap.categories).toEqual({ email: 4, phone: 2, ip: 1 });
    expect(snap.totalRedacted).toBe(7);
  });

  it("ignores zero counts", () => {
    const s = new PiiStats();
    s.recordRedaction("input", 0);
    expect(s.snapshot().input.prompts).toBe(0);
  });

  it("context does not inflate totals or categories", () => {
    const s = new PiiStats();
    s.recordRedaction("context", 5, [d("email")]);
    s.recordRedaction("context", 5, [d("email")]);
    const snap = s.snapshot();
    expect(snap.context).toEqual({ requests: 2, items: 10 });
    expect(snap.totalRedacted).toBe(0);
    expect(snap.categories).toEqual({});
  });

  it("counts restores separately and resets", () => {
    const s = new PiiStats();
    s.recordToolArgRestore(2);
    s.recordReplyRestore();
    expect(s.snapshot().restored).toEqual({ toolArgs: 2, replies: 1 });
    s.reset();
    expect(s.snapshot().restored).toEqual({ toolArgs: 0, replies: 0 });
  });
});

describe("renderStatsLines", () => {
  it("shows friendly empty state", () => {
    const text = renderStatsLines(board(new PiiStats())).join("\n");
    expect(text).toContain("PII redaction usage");
    expect(text).toContain("Status: ON · 23/24 rules enabled");
    expect(text).toContain("Nothing protected yet");
    expect(text).toContain("Nothing redacted yet");
    expect(text).toContain("Restored to real values: 0");
  });

  it("humanizes, sorts by count desc and scales bars", () => {
    const s = new PiiStats();
    s.recordRedaction("input", 3, [d("credit-card"), d("api_key"), d("api_key")]);
    const lines = renderStatsLines(
      board(s, { protectedByLabel: { SURNAME: 1, GIVEN_NAME: 4 } })
    );
    expect(humanize("GIVEN_NAME")).toBe("given name");
    const given = lines.findIndex((l) => l.includes("given name"));
    const sur = lines.findIndex((l) => l.includes("surname"));
    expect(given).toBeGreaterThan(-1);
    expect(given).toBeLessThan(sur);
    expect(lines[given]).toMatch(/██████████ 4$/);
    expect(lines[sur]).toMatch(/███ +1$/);
    const text = lines.join("\n");
    expect(text.indexOf("api key")).toBeLessThan(text.indexOf("credit card"));
    expect(text).toContain("Protected values this session: 5");
  });

  it("lists tools, restores and context", () => {
    const s = new PiiStats();
    s.recordRedaction("tool", 18, [], "bash");
    s.recordRedaction("tool", 7, [], "read");
    s.recordToolArgRestore(6);
    s.recordReplyRestore(3);
    s.recordRedaction("context", 4);
    const text = renderStatsLines(board(s)).join("\n");
    expect(text).toContain("bash 18, read 7");
    expect(text).toContain("Restored to real values: 9  (tokens swapped back in replies and tool calls)");
    expect(text).toContain("Context: 1 request re-masked (4 items)");
  });

  it("never includes originals or tokens, and truncates to width", () => {
    const s = new PiiStats();
    s.recordRedaction("input", 1, [d("email")]);
    const lines = renderStatsLines(board(s, { protectedByLabel: { EMAIL: 1 } }), { width: 20 });
    const text = lines.join("\n");
    expect(text).not.toMatch(/@|\[EMAIL_/);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(20);
  });
});
