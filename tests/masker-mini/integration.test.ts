import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { Tokenizer } from "@huggingface/tokenizers";
import { MaskerMini } from "../../src/services/masker-mini/index.js";
import { resolveMaskerFiles } from "../../src/services/masker-mini/model-files.js";
import { tokenizeWithOffsets } from "../../src/services/masker-mini/tokenize.js";

describe("masker-mini (real model)", () => {
  let tokenizer: Tokenizer;
  let model: MaskerMini;
  const labels = ["GIVEN_NAME", "SURNAME", "CITY", "STREET_NAME", "EMAIL", "PHONE", "DATE", "AGE"];

  beforeAll(async () => {
    const directory = process.env.PI_PII_REDACT_MODEL_DIR || undefined;
    const files = await resolveMaskerFiles({ directory });
    const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
    tokenizer = new Tokenizer(read(files.tokenizerPath), read(files.tokenizerConfigPath));
    model = await MaskerMini.load({ directory });
  });

  const inputs: Record<string, string> = {
    ascii: "Hello world, this is a plain sentence.",
    umlauts: "Mein Name ist Jürgen Müller aus Köln.",
    fullwidth: "Code ＡＢＣ and ＸＹＺ９ here",
    ligature: "Open the ﬁle named ﬁnal.txt please",
    emoji: "Great job 😀 see you at Anna Schmidt's place 🎉 tomorrow",
    cjk: "我叫王小明，住在北京市。 Hello 世界",
    whitespace: "a\tb\n\nc    d \r\n e",
    leadTrail: "   padded text with spaces   \n",
    combining: "Café Muller is at the café",
  };

  for (const [name, text] of Object.entries(inputs)) {
    it(`aligns ranges to the original text: ${name}`, () => {
      const enc = tokenizer.encode(text.normalize("NFKC"), { add_special_tokens: false });
      const toks = tokenizeWithOffsets(tokenizer, text);
      expect(toks.map((t) => t.id)).toEqual(enc.ids);
      let aligned = 0;
      toks.forEach((t, i) => {
        if (!t.range) return;
        aligned++;
        const piece = enc.tokens[i].replace(/^▁/, "");
        const [s, e] = t.range;
        expect(s).toBeGreaterThanOrEqual(0);
        expect(e).toBeLessThanOrEqual(text.length);
        expect(text.slice(s, e).normalize("NFKC")).toBe(piece);
      });
      expect(aligned).toBeGreaterThan(0);
      const ranges = toks.flatMap((t) => (t.range ? [t.range] : []));
      for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBeGreaterThanOrEqual(ranges[i - 1][0]);
    });
  }

  it("keeps alignment after emoji (unknown tokens)", () => {
    const text = "😀 Anna";
    const toks = tokenizeWithOffsets(tokenizer, text);
    const last = toks.filter((t) => t.range).at(-1)!;
    expect(text.slice(...last.range!)).toMatch(/a$/);
  });

  it("detects a German name with correct offsets", async () => {
    const text = "Mein Name ist Jürgen Müller";
    const { items } = await model.redaction(text, { labels, minimumConfidence: 0.5 });
    expect(items.map((i) => [i.label, i.original])).toEqual([
      ["GIVEN_NAME", "Jürgen"],
      ["SURNAME", "Müller"],
    ]);
    for (const i of items) expect(text.slice(i.start, i.end)).toBe(i.original);
  });

  it("returns nothing for empty labels, missing labels or blank text", async () => {
    expect((await model.redaction("Jürgen Müller", { labels: [] })).items).toEqual([]);
    expect((await model.redaction("Jürgen Müller")).items).toEqual([]);
    expect((await model.redaction("  \n", { labels })).items).toEqual([]);
  });

  it("detects names in a long text, including one straddling a window boundary", async () => {
    const filler = "The quarterly report covers many topics including budgets and schedules. ";
    const len = (s: string) => tokenizeWithOffsets(tokenizer, s).length;
    const per = len(filler);
    // Place a name so it straddles the first window boundary (254 content tokens).
    const before = Math.floor(252 / per);
    let head = filler.repeat(before);
    while (len(head) < 252) head += "word ";
    const name = "Jürgen Müller";
    const text = `${head}${name} lives here. ${filler.repeat(Math.ceil(600 / per))}Contact Anna Schmidt today.`;
    expect(len(text)).toBeGreaterThan(600);
    const nameStart = text.indexOf(name);
    const endTok = len(text.slice(0, nameStart + name.length));
    expect(endTok).toBeGreaterThan(254); // name reaches past the first window
    const { items } = await model.redaction(text, { labels, minimumConfidence: 0.5 });
    for (const i of items) expect(text.slice(i.start, i.end)).toBe(i.original);
    const found = items.map((i) => i.original);
    expect(found).toContain("Jürgen");
    expect(found).toContain("Müller");
    const tail = text.lastIndexOf("Anna Schmidt");
    expect(items.some((i) => i.original === "Anna" && i.start === tail)).toBe(true);
    expect(items.some((i) => i.original === "Schmidt" && i.start === tail + 5)).toBe(true);
    const starts = items.map((i) => i.start);
    expect(new Set(starts).size).toBe(starts.length);
  });
});
