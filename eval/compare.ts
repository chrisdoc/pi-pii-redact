// Side-by-side diff of two result files written by eval/run.ts.
//   node --experimental-strip-types --no-warnings eval/compare.ts a.json b.json
import { readFileSync } from "node:fs";

const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) {
  console.error("usage: compare.ts <a.json> <b.json>");
  process.exit(2);
}
const A = JSON.parse(readFileSync(fa, "utf8"));
const B = JSON.parse(readFileSync(fb, "utf8"));
const pct = (x: number) => (x == null || Number.isNaN(x) ? "-" : (x * 100).toFixed(1) + "%");
const delta = (a: number, b: number) =>
  a == null || b == null || Number.isNaN(a) || Number.isNaN(b) ? "-" : (b - a >= 0 ? "+" : "") + ((b - a) * 100).toFixed(1) + " pp";
const dn = (a: number, b: number) => (b - a >= 0 ? "+" : "") + (b - a);
const fence = (s: string) => "```\n" + s + "\n```";

const out: string[] = [];
out.push(`# Eval comparison: A = ${A.label} vs B = ${B.label}`, "");
out.push(`Cases: A ${A.meta.cases}, B ${B.meta.cases}`, "");

out.push("## Recall (no longer verbatim) and strict recall (no 4+ char chunk left)", "");
out.push("| scope | n | A recall | B recall | delta | A strict | B strict | delta |", "|---|---|---|---|---|---|---|---|");
const rows: Array<[string, any, any]> = [["OVERALL", A.overall, B.overall]];
const types = [...new Set([...Object.keys(A.byType), ...Object.keys(B.byType)])].sort(
  (x, y) => (A.byType[y]?.total ?? B.byType[y]?.total ?? 0) - (A.byType[x]?.total ?? B.byType[x]?.total ?? 0),
);
for (const t of types) rows.push([t, A.byType[t], B.byType[t]]);
for (const [name, a, b] of rows) {
  const ra = a?.recall, rb = b?.recall, sa = a?.strictRecall, sb = b?.strictRecall;
  out.push(`| ${name} | ${a?.total ?? b?.total ?? 0} | ${pct(ra)} | ${pct(rb)} | ${delta(ra, rb)} | ${pct(sa)} | ${pct(sb)} | ${delta(sa, sb)} |`);
}

for (const [title, key] of [["group", "byGroup"], ["lang", "byLang"]] as const) {
  out.push("", `## Per ${title}`, "", `| ${title} | A recall | B recall | delta | A FP | B FP | delta |`, "|---|---|---|---|---|---|---|");
  const ks = [...new Set([...Object.keys(A[key]), ...Object.keys(B[key])])];
  for (const k of ks) {
    const a = A[key][k], b = B[key][k];
    out.push(`| ${k} | ${pct(a?.pii.recall)} | ${pct(b?.pii.recall)} | ${delta(a?.pii.recall, b?.pii.recall)} | ${a?.fpRedactions ?? "-"} | ${b?.fpRedactions ?? "-"} | ${a && b ? dn(a.fpRedactions, b.fpRedactions) : "-"} |`);
  }
}

out.push("", "## False positives", "");
out.push("| | A | B | delta |", "|---|---|---|---|");
const fa_ = A.falsePositives, fb_ = B.falsePositives;
out.push(`| total FP redactions | ${fa_.total} | ${fb_.total} | ${dn(fa_.total, fb_.total)} |`);
out.push(`| in no-pii cases | ${fa_.inNoPiiCases} | ${fb_.inNoPiiCases} | ${dn(fa_.inNoPiiCases, fb_.inNoPiiCases)} |`);
out.push(`| in pii cases | ${fa_.inPiiCases} | ${fb_.inPiiCases} | ${dn(fa_.inPiiCases, fb_.inPiiCases)} |`);
out.push(`| no-pii texts with redaction | ${fa_.noPiiCasesWithRedaction}/${fa_.noPiiCases} (${pct(fa_.noPiiFpRate)}) | ${fb_.noPiiCasesWithRedaction}/${fb_.noPiiCases} (${pct(fb_.noPiiFpRate)}) | ${dn(fa_.noPiiCasesWithRedaction, fb_.noPiiCasesWithRedaction)} |`);
out.push("", "| ruleId | A | B | delta |", "|---|---|---|---|");
const rules = [...new Set([...Object.keys(fa_.byRule), ...Object.keys(fb_.byRule)])];
for (const r of rules) {
  const a = fa_.byRule[r]?.total ?? 0, b = fb_.byRule[r]?.total ?? 0;
  out.push(`| ${r} | ${a} | ${b} | ${dn(a, b)} |`);
}

const la = A.latency, lb = B.latency;
out.push("", "## Latency", "", "| | A | B |", "|---|---|---|");
out.push(`| model load (ms) | ${la.loadMs.toFixed(0)} | ${lb.loadMs.toFixed(0)} |`);
out.push(`| median (ms) | ${la.medianMs.toFixed(1)} | ${lb.medianMs.toFixed(1)} |`);
out.push(`| p90 (ms) | ${la.p90Ms.toFixed(1)} | ${lb.p90Ms.toFixed(1)} |`);
out.push(`| max (ms) | ${la.maxMs.toFixed(1)} | ${lb.maxMs.toFixed(1)} |`);
out.push(`| total (s) | ${(la.totalMs / 1000).toFixed(1)} | ${(lb.totalMs / 1000).toFixed(1)} |`);
out.push(`| peak RSS (MB) | ${la.peakRssMb.toFixed(0)} | ${lb.peakRssMb.toFixed(0)} |`);

// Differing outcomes
const byIdB = new Map<string, any>(B.cases.map((c: any) => [c.id, c]));
const diffs: string[] = [];
const rank: Record<string, number> = { caught: 0, partial: 1, leaked: 2 };
let improved = 0, regressed = 0, newFp = 0, goneFp = 0;
const fpKey = (f: any) => `${f.ruleId}|${f.original}`;
for (const ca of A.cases) {
  const cb = byIdB.get(ca.id);
  if (!cb) continue;
  const lines: string[] = [];
  for (const pa of ca.pii) {
    const pb = cb.pii.find((p: any) => p.value === pa.value);
    if (!pb || pa.status === pb.status) continue;
    if (rank[pb.status] < rank[pa.status]) improved++; else regressed++;
    lines.push(`- ${pa.type} "${pa.value}": A ${pa.status} -> B ${pb.status}`);
  }
  const fa2 = new Set<string>(ca.fps.map(fpKey)), fb2 = new Set<string>(cb.fps.map(fpKey));
  for (const f of cb.fps) if (!fa2.has(fpKey(f))) { newFp++; lines.push(`- new FP in B: ${f.ruleId} "${f.original}"`); }
  for (const f of ca.fps) if (!fb2.has(fpKey(f))) { goneFp++; lines.push(`- FP removed in B: ${f.ruleId} "${f.original}"`); }
  if (!lines.length) continue;
  diffs.push(`### ${ca.id} (${ca.group}/${ca.lang})\n\n${lines.join("\n")}\n\nInput:\n${fence(ca.text)}\nA output:\n${fence(ca.output)}\nB output:\n${fence(cb.output)}`);
}
out.push("", "## Outcome differences", "");
out.push(`PII values improved in B: ${improved}; regressed in B: ${regressed}; new FPs in B: ${newFp}; FPs removed in B: ${goneFp}; cases that differ: ${diffs.length}`, "");
out.push(diffs.join("\n\n"));
console.log(out.join("\n"));
