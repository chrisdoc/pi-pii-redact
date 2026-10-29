// PII redaction evaluation. Only uses the public RedactorService API:
//   new RedactorService(), init(), redact(text), setVault(), dispose().
// Run from the repo root:
//   node --import ./eval/ts-resolve.mjs --experimental-strip-types --no-warnings eval/run.ts [--out r.json] [--label NAME] [--limit N]
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { RedactorService } from "../src/services/redactor.js";
import { PiiVault } from "../src/services/vault.js";

type PiiLabel = { value: string; type: string };
type Case = { id: string; group: string; lang: string; text: string; pii: PiiLabel[] };
type Status = "caught" | "partial" | "leaked";
type PiiResult = { value: string; type: string; status: Status; leakedChunks: string[]; caughtBy: string[] };
type Redaction = { ruleId: string; category?: string; original: string; start?: number; end?: number; confidence?: number };
type RedactionOut = { ruleId: string; category?: string; original: string; overlapsPii: boolean };
type CaseResult = {
  id: string; group: string; lang: string; text: string; output: string; ms: number;
  pii: PiiResult[]; redactions: RedactionOut[]; fps: RedactionOut[];
};

function parseArgs(argv: string[]) {
  const a: { out?: string; label?: string; limit?: number; group?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") a.out = argv[++i];
    else if (argv[i] === "--label") a.label = argv[++i];
    else if (argv[i] === "--limit") a.limit = Number(argv[++i]);
    else if (argv[i] === "--group") a.group = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return a;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Placeholders: [EMAIL_3#k7q2], [EMAIL_3], [REDACTED], [CREDIT_CARD] and similar bracketed upper-case masks.
const PLACEHOLDER = /\[[A-Z][A-Z0-9_ ]*(?:#[A-Za-z0-9]+)?\]/g;

function boundaryRegex(value: string, flags: string): RegExp {
  const lead = /^[\p{L}\p{N}]/u.test(value) ? "(?<![\\p{L}\\p{N}])" : "";
  const trail = /[\p{L}\p{N}]$/u.test(value) ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`${lead}${escapeRe(value)}${trail}`, flags + "u");
}
const occursIn = (hay: string, needle: string) => boundaryRegex(needle, "").test(hay);
function occurrences(hay: string, needle: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of hay.matchAll(boundaryRegex(needle, "g"))) out.push([m.index, m.index + m[0].length]);
  return out;
}
const stripPlaceholders = (s: string) => s.replace(PLACEHOLDER, "\u0000");

function classify(value: string, outsidePlaceholders: string, unlabelledInput: string): { status: Status; chunks: string[] } {
  if (occursIn(outsidePlaceholders, value)) return { status: "leaked", chunks: [value] };
  if (value.length >= 4) {
    // Ignore chunks that also occur in unlabelled input text (e.g. "example" from an email also in "api.example.com").
    const chunks = (value.match(/[\p{L}\p{N}]+/gu) ?? []).filter((c) => c.length >= 4 && !occursIn(unlabelledInput, c));
    const left = chunks.filter((c) => occursIn(outsidePlaceholders, c));
    if (left.length) return { status: "partial", chunks: left };
  }
  return { status: "caught", chunks: [] };
}

function evalCase(c: Case, output: string, redactions: Redaction[], ms: number): CaseResult {
  const outside = stripPlaceholders(output);
  const piiSpans = c.pii.map((p) => ({ p, spans: occurrences(c.text, p.value) }));
  let unlabelledInput = c.text;
  for (const { spans } of piiSpans) for (const [s, e] of spans) unlabelledInput = unlabelledInput.slice(0, s) + "\u0000".repeat(e - s) + unlabelledInput.slice(e);
  const redOut: RedactionOut[] = redactions.map((r) => {
    let spans = r.original ? occurrences(c.text, r.original.trim() || r.original) : [];
    if (!spans.length && r.original) {
      const i = c.text.indexOf(r.original); // non-boundary fallback
      if (i >= 0) spans = [[i, i + r.original.length]];
    }
    if (!spans.length && typeof r.start === "number" && typeof r.end === "number") spans = [[r.start, r.end]];
    const overlapsPii = spans.some(([s, e]) => piiSpans.some(({ spans: ps }) => ps.some(([ps0, pe]) => s < pe && ps0 < e)));
    return { ruleId: r.ruleId, category: r.category, original: r.original, overlapsPii };
  });
  const pii: PiiResult[] = c.pii.map((p) => {
    const { status, chunks } = classify(p.value, outside, unlabelledInput);
    const mine = piiSpans.find((x) => x.p === p)!.spans;
    const caughtBy = [...new Set(
      redactions.filter((r) => {
        const rs = occurrences(c.text, r.original.trim() || r.original);
        return rs.some(([s, e]) => mine.some(([ps, pe]) => s < pe && ps < e));
      }).map((r) => r.ruleId),
    )];
    return { value: p.value, type: p.type, status, leakedChunks: status === "caught" ? [] : chunks, caughtBy };
  });
  return {
    id: c.id, group: c.group, lang: c.lang, text: c.text, output, ms, pii,
    redactions: redOut, fps: redOut.filter((r) => !r.overlapsPii),
  };
}

type Agg = { total: number; caught: number; partial: number; leaked: number; recall: number; strictRecall: number };
function aggPii(items: PiiResult[]): Agg {
  const total = items.length;
  const partial = items.filter((i) => i.status === "partial").length;
  const leaked = items.filter((i) => i.status === "leaked").length;
  const caught = total - partial - leaked;
  return {
    total, caught, partial, leaked,
    recall: total ? (caught + partial) / total : NaN, // no longer verbatim in output
    strictRecall: total ? caught / total : NaN, // no chunk of it remains either
  };
}
type FpAgg = { cases: number; piiValues: number; fpRedactions: number; casesWithFp: number };
function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const it of items) (out[key(it)] ??= []).push(it);
  return out;
}
function aggCases(rs: CaseResult[]): FpAgg & { pii: Agg } {
  return {
    cases: rs.length,
    piiValues: rs.reduce((n, r) => n + r.pii.length, 0),
    fpRedactions: rs.reduce((n, r) => n + r.fps.length, 0),
    casesWithFp: rs.filter((r) => r.fps.length).length,
    pii: aggPii(rs.flatMap((r) => r.pii)),
  };
}
const pct = (x: number) => (Number.isNaN(x) ? "-" : (x * 100).toFixed(1) + "%");
function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let corpus: Case[] = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8"));
  if (args.group) corpus = corpus.filter((c) => c.group === args.group);
  if (args.limit) {
    // Spread the limit across the corpus so a small self-check still touches every group.
    const step = Math.max(1, Math.floor(corpus.length / args.limit));
    corpus = corpus.filter((_, i) => i % step === 0).slice(0, args.limit);
  }

  const svc = new RedactorService();
  const tLoad = performance.now();
  await svc.init();
  const loadMs = performance.now() - tLoad;

  // Warm up (first inference is slower), then discard its vault.
  svc.setVault(new PiiVault());
  await svc.redact("Warm-up: contact John Smith at john@example.com.");

  const results: CaseResult[] = [];
  const t0 = performance.now();
  for (const c of corpus) {
    svc.setVault(new PiiVault()); // fresh vault (also clears the result cache) per case
    const t = performance.now();
    const res = await svc.redact(c.text);
    const ms = performance.now() - t;
    results.push(evalCase(c, res.text, res.redactions as Redaction[], ms));
  }
  const totalMs = performance.now() - t0;
  svc.dispose();

  const piiCases = results.filter((r) => r.group !== "no-pii");
  const noPii = results.filter((r) => r.group === "no-pii");
  const allPii = results.flatMap((r) => r.pii);
  const fpByRule: Record<string, { total: number; inNoPiiCases: number; inPiiCases: number }> = {};
  for (const r of results) {
    for (const f of r.fps) {
      const e = (fpByRule[f.ruleId] ??= { total: 0, inNoPiiCases: 0, inPiiCases: 0 });
      e.total++;
      if (r.group === "no-pii") e.inNoPiiCases++; else e.inPiiCases++;
    }
  }
  const msSorted = results.map((r) => r.ms).sort((a, b) => a - b);
  const summary = {
    label: args.label ?? "masker-mini",
    meta: {
      date: new Date().toISOString(),
      node: process.version,
      env: {
        PI_PII_REDACT_MODEL_DIR: process.env.PI_PII_REDACT_MODEL_DIR ?? null,
      },
      cases: results.length,
    },
    overall: aggPii(allPii),
    byType: Object.fromEntries(Object.entries(groupBy(allPii, (p) => p.type)).map(([k, v]) => [k, aggPii(v)])),
    byGroup: Object.fromEntries(Object.entries(groupBy(results, (r) => r.group)).map(([k, v]) => [k, aggCases(v)])),
    byLang: Object.fromEntries(Object.entries(groupBy(results, (r) => r.lang)).map(([k, v]) => [k, aggCases(v)])),
    falsePositives: {
      total: results.reduce((n, r) => n + r.fps.length, 0),
      inNoPiiCases: noPii.reduce((n, r) => n + r.fps.length, 0),
      inPiiCases: piiCases.reduce((n, r) => n + r.fps.length, 0),
      byRule: fpByRule,
      noPiiCases: noPii.length,
      noPiiCasesWithRedaction: noPii.filter((r) => r.redactions.length > 0).length,
      noPiiFpRate: noPii.length ? noPii.filter((r) => r.redactions.length > 0).length / noPii.length : NaN,
    },
    latency: {
      loadMs, totalMs,
      medianMs: quantile(msSorted, 0.5), p90Ms: quantile(msSorted, 0.9), maxMs: msSorted[msSorted.length - 1] ?? 0,
      peakRssMb: process.resourceUsage().maxRSS / 1024,
    },
  };
  const full = { ...summary, cases: results };
  if (args.out) writeFileSync(args.out, JSON.stringify(full, null, 1) + "\n");

  // Markdown summary
  const L: string[] = [];
  const row = (name: string, a: Agg) =>
    `| ${name} | ${a.total} | ${a.caught} | ${a.partial} | ${a.leaked} | ${pct(a.recall)} | ${pct(a.strictRecall)} |`;
  L.push(`# PII eval: ${summary.label}`, "");
  L.push(`Cases: ${results.length} (${piiCases.length} with PII, ${noPii.length} no-pii), PII values: ${allPii.length}`, "");
  L.push("## Overall recall", "", "| | values | caught | partial leak | full leak | recall | strict recall |", "|---|---|---|---|---|---|---|");
  L.push(row("overall", summary.overall), "");
  L.push("## Recall per type", "", "| type | values | caught | partial leak | full leak | recall | strict recall |", "|---|---|---|---|---|---|---|");
  for (const [k, v] of Object.entries(summary.byType).sort((a, b) => b[1].total - a[1].total)) L.push(row(k, v));
  for (const [title, data] of [["group", summary.byGroup], ["lang", summary.byLang]] as const) {
    L.push("", `## Per ${title}`, "", `| ${title} | cases | pii values | recall | strict recall | FP redactions | cases with FP |`, "|---|---|---|---|---|---|---|");
    for (const [k, v] of Object.entries(data)) L.push(`| ${k} | ${v.cases} | ${v.piiValues} | ${pct(v.pii.recall)} | ${pct(v.pii.strictRecall)} | ${v.fpRedactions} | ${v.casesWithFp} |`);
  }
  const fp = summary.falsePositives;
  L.push("", "## False positives", "", `Total FP redactions: ${fp.total} (no-pii cases: ${fp.inNoPiiCases}, pii cases: ${fp.inPiiCases})`);
  L.push(`No-pii texts with >=1 redaction: ${fp.noPiiCasesWithRedaction}/${fp.noPiiCases} (${pct(fp.noPiiFpRate)})`, "");
  L.push("| ruleId | total | in no-pii cases | in pii cases |", "|---|---|---|---|");
  for (const [k, v] of Object.entries(fpByRule).sort((a, b) => b[1].total - a[1].total)) L.push(`| ${k} | ${v.total} | ${v.inNoPiiCases} | ${v.inPiiCases} |`);
  const l = summary.latency;
  L.push("", "## Latency", "", `Model load: ${l.loadMs.toFixed(0)} ms; per-case median ${l.medianMs.toFixed(1)} ms, p90 ${l.p90Ms.toFixed(1)} ms, max ${l.maxMs.toFixed(1)} ms; total ${(l.totalMs / 1000).toFixed(1)} s; peak RSS ${l.peakRssMb.toFixed(0)} MB`);
  console.log(L.join("\n"));
}

main().then(
  () => process.exit(0), // native model handles can keep the loop alive
  (e) => { console.error(e); process.exit(1); },
);
