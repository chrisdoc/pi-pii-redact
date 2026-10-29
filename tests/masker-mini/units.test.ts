import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildLabelTable, decodeBioes, type Prediction } from "../../src/services/masker-mini/decode.js";
import { chunkWindows } from "../../src/services/masker-mini/chunk.js";
import { alignPieces, normalizeWithMap, tokenizeWithOffsets } from "../../src/services/masker-mini/tokenize.js";
import { dedupeSpans, filterSpans } from "../../src/services/masker-mini/merge.js";
import { argmaxSoftmax } from "../../src/services/masker-mini/index.js";
import { resolveMaskerFiles } from "../../src/services/masker-mini/model-files.js";
import { refineSpans } from "../../src/services/masker-mini/postprocess.js";

const table = buildLabelTable({
  "0": "O", "1": "B-CITY", "2": "I-CITY", "3": "E-CITY", "4": "S-CITY",
  "5": "B-EMAIL", "6": "I-EMAIL", "7": "E-EMAIL", "8": "S-EMAIL",
});
const O = 0, B_CITY = 1, I_CITY = 2, E_CITY = 3, S_CITY = 4, B_EMAIL = 5, I_EMAIL = 6, E_EMAIL = 7;
const p = (classIndex: number, range: [number, number] | null, confidence = 1): Prediction => ({
  classIndex, range, confidence,
});

describe("decodeBioes", () => {
  const text = "aaa bbb ccc ddd eee fff";
  it("decodes B I E", () => {
    const spans = decodeBioes([p(B_CITY, [0, 3]), p(I_CITY, [4, 7]), p(E_CITY, [8, 11])], table, text);
    expect(spans).toEqual([{ label: "CITY", start: 0, end: 11, confidence: 1 }]);
  });
  it("decodes S as a single-token span", () => {
    expect(decodeBioes([p(S_CITY, [4, 7]), p(S_CITY, [8, 11])], table, text).map((s) => [s.start, s.end])).toEqual([
      [4, 7], [8, 11],
    ]);
  });
  it("O closes an open span", () => {
    const spans = decodeBioes([p(B_CITY, [0, 3]), p(O, [4, 7]), p(I_CITY, [8, 11])], table, text);
    expect(spans.map((s) => [s.start, s.end])).toEqual([[0, 3], [8, 11]]);
  });
  it("a stray I or E opens a span", () => {
    expect(decodeBioes([p(I_CITY, [0, 3]), p(E_CITY, [4, 7])], table, text)).toEqual([
      { label: "CITY", start: 0, end: 7, confidence: 1 },
    ]);
    expect(decodeBioes([p(E_CITY, [4, 7])], table, text)).toHaveLength(1);
  });
  it("a type switch closes the span; I of another type opens a new one", () => {
    const spans = decodeBioes([p(B_CITY, [0, 3]), p(I_EMAIL, [4, 7]), p(E_EMAIL, [8, 11])], table, text);
    expect(spans.map((s) => [s.label, s.start, s.end])).toEqual([["CITY", 0, 3], ["EMAIL", 4, 11]]);
  });
  it("B inside an open span starts a new span", () => {
    const spans = decodeBioes([p(B_CITY, [0, 3]), p(B_CITY, [4, 7]), p(E_CITY, [8, 11])], table, text);
    expect(spans.map((s) => [s.start, s.end])).toEqual([[0, 3], [4, 11]]);
  });
  it("ignores null ranges for bounds but keeps their confidence", () => {
    const spans = decodeBioes([p(B_CITY, null, 0.5), p(E_CITY, [4, 7], 1)], table, text);
    expect(spans).toEqual([{ label: "CITY", start: 4, end: 7, confidence: 0.75 }]);
  });
  it("drops spans with only null ranges", () => {
    expect(decodeBioes([p(S_CITY, null)], table, text)).toEqual([]);
  });
  it("uses the mean confidence", () => {
    const [s] = decodeBioes([p(B_CITY, [0, 3], 0.6), p(I_CITY, [4, 7], 0.9), p(E_CITY, [8, 11], 0.9)], table, text);
    expect(s.confidence).toBeCloseTo(0.8);
  });
  it("trims whitespace at span edges and drops empty spans", () => {
    const t = "  ab  ";
    expect(decodeBioes([p(S_CITY, [0, 6])], table, t)).toEqual([{ label: "CITY", start: 2, end: 4, confidence: 1 }]);
    expect(decodeBioes([p(S_CITY, [0, 2])], table, t)).toEqual([]);
  });
  it("treats unknown class indices as O", () => {
    expect(decodeBioes([p(99, [0, 3])], table, text)).toEqual([]);
  });
});

describe("chunkWindows", () => {
  const seq = (n: number) => Array.from({ length: n }, (_, i) => i);
  it("returns nothing for empty input and one window for short input", () => {
    expect(chunkWindows([])).toEqual([]);
    expect(chunkWindows(seq(254))).toEqual([seq(254)]);
  });
  it("splits long input into 254-token windows with 32 overlap and covers everything", () => {
    const w = chunkWindows(seq(600));
    expect(w.every((x) => x.length <= 254)).toBe(true);
    expect(w[0]).toHaveLength(254);
    expect(w[1][0]).toBe(254 - 32);
    expect(w.at(-1)!.at(-1)).toBe(599);
    expect(new Set(w.flat()).size).toBe(600);
  });
  it("always makes progress with excessive overlap", () => {
    const w = chunkWindows(seq(50), 10, 100);
    expect(w.length).toBeGreaterThan(1);
    expect(w.at(-1)!.at(-1)).toBe(49);
  });
});

describe("alignPieces", () => {
  const pieces = (...ps: string[]) => ps.map((piece, i) => ({ id: 100 + i, piece }));
  it("aligns pieces skipping whitespace and the metaspace marker", () => {
    expect(alignPieces("ab  cd", pieces("▁ab", "▁c", "d"))).toEqual([[0, 2], [4, 5], [5, 6]]);
  });
  it("gives null to unfound, empty and special pieces without advancing", () => {
    const ps = [{ id: 1, piece: "[CLS]" }, { id: 5, piece: "▁" }, { id: 6, piece: "zz" }, { id: 7, piece: "ab" }];
    expect(alignPieces("ab", ps)).toEqual([null, null, null, [0, 2]]);
  });
  it("resyncs after an unknown token", () => {
    const ps = [{ id: 5, piece: "▁a" }, { id: 3, piece: "[UNK]" }, { id: 6, piece: "▁b" }];
    expect(alignPieces("a😀 b", ps)).toEqual([[0, 1], null, [4, 5]]);
  });
  it("does not resync without a preceding unknown token", () => {
    expect(alignPieces("xx b", pieces("▁b"))).toEqual([null]);
  });
});

describe("normalizeWithMap / tokenizeWithOffsets", () => {
  it("maps NFKC expansions back to the original characters", () => {
    const { text, map } = normalizeWithMap("ﬁle");
    expect(text).toBe("file");
    expect(map).toEqual([[0, 1], [0, 1], [1, 2], [2, 3]]);
  });
  it("keeps combining marks with their base", () => {
    const { text, map } = normalizeWithMap("éx");
    expect(text).toBe("éx");
    expect(map).toEqual([[0, 2], [2, 3]]);
  });
  it("maps astral characters by UTF-16 range", () => {
    expect(normalizeWithMap("😀a").map).toEqual([[0, 2], [0, 2], [2, 3]]);
  });
  it("maps encoder output back to original offsets", () => {
    // The encoder sees the normalized text, so its tokens are in normalized form.
    const fake2 = { encode: () => ({ ids: [10, 11], tokens: ["▁A", "▁B"] }) };
    expect(tokenizeWithOffsets(fake2, "Ａ  B")).toEqual([
      { id: 10, range: [0, 1] },
      { id: 11, range: [3, 4] },
    ]);
    expect(tokenizeWithOffsets(fake2, "   ")).toEqual([]);
  });
});

describe("filterSpans / dedupeSpans / argmaxSoftmax", () => {
  const s = (label: string, start: number, end: number, confidence: number) => ({ label, start, end, confidence });
  it("filters by label and confidence; empty or missing labels yield nothing", () => {
    const spans = [s("CITY", 0, 1, 0.9), s("EMAIL", 2, 3, 0.9), s("CITY", 4, 5, 0.5)];
    expect(filterSpans(spans, ["CITY"], 0.85)).toEqual([spans[0]]);
    expect(filterSpans(spans, [], 0)).toEqual([]);
    expect(filterSpans(spans, undefined, 0)).toEqual([]);
  });
  it("dedupes overlaps preferring confidence, then length, and sorts by start", () => {
    expect(dedupeSpans([s("A", 0, 5, 0.8), s("A", 3, 8, 0.9), s("A", 10, 12, 0.7)])).toEqual([
      s("A", 3, 8, 0.9), s("A", 10, 12, 0.7),
    ]);
    expect(dedupeSpans([s("A", 0, 5, 0.9), s("A", 0, 8, 0.9)])).toEqual([s("A", 0, 8, 0.9)]);
  });
  it("computes softmax of the argmax class", () => {
    const [k, prob] = argmaxSoftmax([0, 0, 5, 0, 99, 99], 0, 4);
    expect(k).toBe(2);
    expect(prob).toBeCloseTo(Math.exp(5) / (Math.exp(5) + 3), 6);
  });
});

describe("model files", () => {
  const sha = (b: string) => createHash("sha256").update(b).digest("hex");
  const names = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_int4.onnx"];
  const hashes = Object.fromEntries(names.map((n) => [n, sha(`good-${n}`)]));
  const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), "mm-test-"));
  const fill = (dir: string, bad?: string) => {
    for (const n of names) {
      fs.mkdirSync(path.dirname(path.join(dir, n)), { recursive: true });
      fs.writeFileSync(path.join(dir, n), n === bad ? "tampered" : `good-${n}`);
    }
  };

  it("accepts a directory whose files match", async () => {
    const dir = mk();
    fill(dir);
    const files = await resolveMaskerFiles({ directory: dir, hashes });
    expect(files.modelPath).toBe(path.join(dir, "onnx/model_int4.onnx"));
  });
  it("rejects a bad file in a user directory and leaves it alone", async () => {
    const dir = mk();
    fill(dir, "tokenizer.json");
    await expect(resolveMaskerFiles({ directory: dir, hashes })).rejects.toThrow(/SHA-256 mismatch/);
    expect(fs.existsSync(path.join(dir, "tokenizer.json"))).toBe(true);
  });
  it("rejects a missing file in a user directory", async () => {
    const dir = mk();
    await expect(resolveMaskerFiles({ directory: dir, hashes })).rejects.toThrow(/missing/);
  });
  it("downloads missing cache files, verifies, and reuses them", async () => {
    const root = mk();
    let calls = 0;
    const fetchImpl = (async (url: string) => {
      calls++;
      const rel = names.find((n) => url.endsWith(`/${n}`))!;
      return new Response(`good-${rel}`);
    }) as unknown as typeof fetch;
    const files = await resolveMaskerFiles({ cacheRoot: root, fetchImpl, hashes });
    expect(calls).toBe(4);
    expect(fs.readFileSync(files.modelPath, "utf8")).toBe("good-onnx/model_int4.onnx");
    await resolveMaskerFiles({ cacheRoot: root, fetchImpl, hashes });
    expect(calls).toBe(4);
  });
  it("deletes and throws on a downloaded file with the wrong hash", async () => {
    const root = mk();
    const fetchImpl = (async () => new Response("tampered")) as unknown as typeof fetch;
    await expect(resolveMaskerFiles({ cacheRoot: root, fetchImpl, hashes })).rejects.toThrow(/SHA-256 mismatch/);
    const leftovers = fs.readdirSync(root, { recursive: true, encoding: "utf8" });
    expect(leftovers.filter((f) => f.endsWith(".tmp") || f.endsWith(".json"))).toEqual([]);
  });
});

describe("refineSpans", () => {
  const span = (text: string, needle: string, label: string, nth = 0) => {
    let start = -1;
    for (let k = 0; k <= nth; k++) start = text.indexOf(needle, start + 1);
    return { label, start, end: start + needle.length, confidence: 0.9 };
  };
  const apply = (text: string, spans: ReturnType<typeof span>[]) =>
    refineSpans(spans, text).map((s) => text.slice(s.start, s.end));

  it("trims edge punctuation and whitespace but keeps internal punctuation", () => {
    const text = "Call (O'Brien), Jean-Luc; at 5, Main";
    expect(apply(text, [span(text, "(O'Brien),", "SURNAME")])).toEqual(["O'Brien"]);
    expect(apply(text, [span(text, "Jean-Luc;", "GIVEN_NAME")])).toEqual(["Jean-Luc"]);
    expect(apply(text, [span(text, "5,", "BUILDING_NUMBER")])).toEqual(["5"]);
  });

  it("trims a trailing dot except for a single-letter abbreviation", () => {
    const text = "Dr. Smith lives on St. and J. Smith";
    expect(apply(text, [span(text, "St.", "STREET_NAME")])).toEqual(["St"]);
    expect(apply(text, [span(text, "J.", "GIVEN_NAME")])).toEqual(["J."]);
  });

  it("drops spans that become empty", () => {
    const text = "a , b";
    expect(apply(text, [span(text, ",", "CITY")])).toEqual([]);
  });

  it("drops numeric spans glued into a larger token", () => {
    const text = "usr_99812 v2 abc123 and 10115 Berlin, age 34";
    expect(apply(text, [span(text, "9981", "ZIP_CODE")])).toEqual([]);
    expect(apply(text, [span(text, "2", "BUILDING_NUMBER")])).toEqual([]);
    expect(apply(text, [span(text, "10115", "ZIP_CODE"), span(text, "34", "AGE")])).toEqual(["10115", "34"]);
  });

  it("widens a partly tagged ID to the whole alphanumeric token instead of dropping it", () => {
    const text = "Mi DNI es 12345678Z, ref usr_4821";
    expect(apply(text, [span(text, "12345678", "GOVERNMENT_ID")])).toEqual(["12345678Z"]);
    expect(apply(text, [span(text, "4821", "GOVERNMENT_ID")])).toEqual(["4821"]);
  });

  it("drops AGE spans that are temperatures or percentages", () => {
    const text = "It was 72 degrees, 50% done, 30 years old, 21°C";
    expect(apply(text, [span(text, "72", "AGE"), span(text, "50", "AGE"), span(text, "21", "AGE")])).toEqual([]);
    expect(apply(text, [span(text, "30", "AGE")])).toEqual(["30"]);
  });

  it("keeps non-numeric labels that touch digits or underscores", () => {
    const text = "user_Anna1";
    expect(apply(text, [span(text, "Anna", "GIVEN_NAME")])).toEqual(["Anna"]);
  });

  it("extends name and place spans that start or end inside a word", () => {
    const text = "Mr Müller-Lüdenscheid and O'Brien in Zürich";
    expect(apply(text, [span(text, "üll", "SURNAME")])).toEqual(["Müller-Lüdenscheid"]);
    expect(apply(text, [span(text, "Brie", "SURNAME")])).toEqual(["Brien"]);
    expect(apply(text, [span(text, "Züri", "CITY")])).toEqual(["Zürich"]);
  });

  it("does not extend across a space or a standalone joiner", () => {
    const text = "Anna Maria - Luc";
    expect(apply(text, [span(text, "Anna", "GIVEN_NAME")])).toEqual(["Anna"]);
    expect(apply(text, [span(text, "Maria", "GIVEN_NAME")])).toEqual(["Maria"]);
  });

  it("extends over combining marks", () => {
    const text = "Jose\u0301 Garcia";
    expect(apply(text, [span(text, "Jos", "GIVEN_NAME")])).toEqual(["Jose\u0301"]);
  });
});
