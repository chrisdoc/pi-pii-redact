import type { Range } from "./tokenize.js";

export interface Prediction {
  range: Range | null;
  classIndex: number;
  /** Softmax probability of the argmax class. */
  confidence: number;
}

export interface Span {
  label: string;
  start: number;
  end: number;
  confidence: number;
}

export type Prefix = "B" | "I" | "E" | "S";
export interface DecodedLabel {
  prefix: Prefix;
  type: string;
}

/** Parses `id2label` ("O", "B-CITY", ...) into a per-index table; "O"/unknown become null. */
export function buildLabelTable(id2label: Record<string, string>): Array<DecodedLabel | null> {
  const table: Array<DecodedLabel | null> = [];
  for (const [key, name] of Object.entries(id2label)) {
    const m = /^([BIES])-(.+)$/.exec(name);
    table[Number(key)] = m ? { prefix: m[1] as Prefix, type: m[2] } : null;
  }
  return table;
}

/** BIOES decode with lenient recovery, per BIOESDecoder.swift. Whitespace is trimmed from span edges. */
export function decodeBioes(
  predictions: readonly Prediction[],
  labels: ReadonlyArray<DecodedLabel | null>,
  original: string
): Span[] {
  const result: Span[] = [];
  let type: string | null = null;
  let tokens: Array<{ range: Range | null; confidence: number }> = [];

  const flush = () => {
    const t = type;
    const toks = tokens;
    type = null;
    tokens = [];
    if (t === null || toks.length === 0) return;
    const ranges = toks.flatMap((x) => (x.range ? [x.range] : []));
    if (ranges.length === 0) return;
    let start = Math.min(...ranges.map((r) => r[0]));
    let end = Math.max(...ranges.map((r) => r[1]));
    while (start < end && /\s/.test(original[start])) start++;
    while (end > start && /\s/.test(original[end - 1])) end--;
    if (start >= end) return;
    const confidence = toks.reduce((a, x) => a + x.confidence, 0) / toks.length;
    result.push({ label: t, start, end, confidence });
  };

  for (const p of predictions) {
    const lab = labels[p.classIndex] ?? null;
    if (!lab) {
      flush();
      continue;
    }
    const continues = type === lab.type && (lab.prefix === "I" || lab.prefix === "E");
    if (continues) {
      tokens.push(p);
      if (lab.prefix === "E") flush();
    } else {
      flush();
      type = lab.type;
      tokens = [p];
      if (lab.prefix === "S" || lab.prefix === "E") flush();
    }
  }
  flush();
  return result;
}
