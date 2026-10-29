import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compare = fileURLToPath(new URL("../eval/compare.ts", import.meta.url));
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function result(label: string, count: number) {
  return {
    label,
    meta: { cases: 1 },
    overall: { total: 0, recall: null, strictRecall: null },
    byType: {}, byGroup: {}, byLang: {},
    falsePositives: {
      total: count, inNoPiiCases: count, inPiiCases: 0,
      noPiiCases: 1, noPiiCasesWithRedaction: count > 0 ? 1 : 0, noPiiFpRate: count > 0 ? 1 : 0,
      byRule: { city: { total: count } },
    },
    latency: { loadMs: 0, medianMs: 0, p90Ms: 0, maxMs: 0, totalMs: 0, peakRssMb: 0 },
    cases: [{
      id: "repeated", group: "no-pii", lang: "en", text: "Berlin Berlin Berlin", output: "", pii: [],
      fps: Array.from({ length: count }, () => ({ ruleId: "city", original: "Berlin" })),
    }],
  };
}

describe("eval comparison FP occurrences", () => {
  it.each([
    { a: 1, b: 3, added: 2, removed: 0 },
    { a: 3, b: 1, added: 0, removed: 2 },
    { a: 2, b: 2, added: 0, removed: 0 },
    { a: 0, b: 2, added: 2, removed: 0 },
    { a: 2, b: 0, added: 0, removed: 2 },
  ])("reports every unmatched occurrence: $a -> $b", ({ a, b, added, removed }) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "eval-compare-"));
    directories.push(directory);
    const fa = path.join(directory, "a.json"), fb = path.join(directory, "b.json");
    writeFileSync(fa, JSON.stringify(result("A", a)));
    writeFileSync(fb, JSON.stringify(result("B", b)));
    const output = execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", compare, fa, fb], {
      encoding: "utf8",
    });
    const delta = (b - a >= 0 ? "+" : "") + (b - a);
    expect(output).toContain(`| total FP redactions | ${a} | ${b} | ${delta} |`);
    expect(output).toContain(`new FPs in B: ${added}; FPs removed in B: ${removed}; cases that differ: ${added + removed > 0 ? 1 : 0}`);
    expect(output.match(/^- new FP in B:/gm) ?? []).toHaveLength(added);
    expect(output.match(/^- FP removed in B:/gm) ?? []).toHaveLength(removed);
  });
});
