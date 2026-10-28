import { describe, it, expect } from "vitest";
import { PiiVault } from "../src/services/vault.js";

const TOKEN = /^\[([A-Z_]+)_(\d+)#([a-z0-9]{4})\]$/;

describe("PiiVault", () => {
  it("mints tokens of the form [LABEL_N#nonce]", () => {
    const v = new PiiVault();
    const t = v.tokenFor("EMAIL", "alice@example.com");
    const m = TOKEN.exec(t);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("EMAIL");
    expect(m![2]).toBe("1");
    expect(v.isKnownToken(t)).toBe(true);
    expect(v.isKnownToken("[EMAIL_1]")).toBe(false);
  });

  it("is stable per original and numbers per label monotonically", () => {
    const v = new PiiVault();
    const a = v.tokenFor("EMAIL", "alice@example.com");
    const b = v.tokenFor("EMAIL", "bob@example.com");
    const p = v.tokenFor("PHONE", "555-123-4567");
    expect(v.tokenFor("EMAIL", "alice@example.com")).toBe(a);
    expect(a).not.toBe(b);
    expect(b).toMatch(/^\[EMAIL_2#/);
    expect(p).toMatch(/^\[PHONE_1#/);
  });

  it("uses a different random nonce per new vault", () => {
    const nonces = new Set(
      Array.from({ length: 20 }, () => TOKEN.exec(new PiiVault().tokenFor("EMAIL", "x@y.zz"))![3])
    );
    expect(nonces.size).toBeGreaterThan(1);
  });

  describe("restore", () => {
    it("restores canonical and tolerant variants", () => {
      const v = new PiiVault();
      const t = v.tokenFor("EMAIL", "alice@example.com");
      const [, label, n, nonce] = /^\[(\w+?)_(\d+)#(\w+)\]$/.exec(t)!;
      expect(v.restore(`Hi ${t}!`)).toBe("Hi alice@example.com!");
      expect(v.restore(`Hi ${label}_${n}#${nonce}!`)).toBe("Hi alice@example.com!");
      expect(v.restore(`Hi [ ${label.toLowerCase()}_${n} # ${nonce} ]!`)).toBe("Hi alice@example.com!");
      expect(v.restore(`Hi ${label.toLowerCase()}_${n}#${nonce.toUpperCase()}`)).toBe("Hi alice@example.com");
      expect(v.restore(`${t} and ${t}`)).toBe("alice@example.com and alice@example.com");
    });

    it("leaves wrong nonce, unknown numbers, legacy and unbounded forms untouched", () => {
      const v = new PiiVault();
      const t = v.tokenFor("EMAIL", "alice@example.com");
      const nonce = TOKEN.exec(t)![3];
      const other = nonce === "zzzz" ? "yyyy" : "zzzz";
      for (const s of [
        `[EMAIL_1#${other}]`,
        `[EMAIL_9#${nonce}]`,
        `[PHONE_1#${nonce}]`,
        "[EMAIL_1]",
        "[REDACTED:API_KEY]",
        `xEMAIL_1#${nonce}`,
        `EMAIL_1#${nonce}x`,
      ]) {
        expect(v.restore(s)).toBe(s);
      }
    });

    it("does not interpret $ sequences in originals and does not rescan inserted originals", () => {
      const v = new PiiVault();
      const secret = "pa$$word$&$1$`$'";
      const t = v.tokenFor("API_KEY", secret);
      expect(v.restore(`k=${t}`)).toBe(`k=${secret}`);

      const v2 = new PiiVault();
      const a = v2.tokenFor("EMAIL", "a@b.co");
      const b = v2.tokenFor("API_KEY", `wraps ${a}`);
      expect(v2.restore(b)).toBe(`wraps ${a}`);
    });

    it("handles empty and nullish input", () => {
      const v = new PiiVault();
      expect(v.restore("")).toBe("");
      expect((v.restore as any)(null)).toBe("");
      expect(v.restore("plain")).toBe("plain");
    });
  });

  describe("persistence", () => {
    it("takePendingDelta returns only new entries, then null", () => {
      const v = new PiiVault();
      expect(v.takePendingDelta()).toBeNull();
      v.tokenFor("EMAIL", "a@b.co");
      v.tokenFor("EMAIL", "c@d.co");
      const d1 = v.takePendingDelta()!;
      expect(d1.v).toBe(1);
      expect(d1.entries.map((e) => e.original)).toEqual(["a@b.co", "c@d.co"]);
      expect(v.takePendingDelta()).toBeNull();
      v.tokenFor("EMAIL", "a@b.co"); // existing: nothing new
      expect(v.takePendingDelta()).toBeNull();
      v.tokenFor("PHONE", "555-000-1111");
      expect(v.takePendingDelta()!.entries).toHaveLength(1);
    });

    it("payloads survive JSON round-trip and rebuild a working vault", () => {
      const v = new PiiVault();
      const a = v.tokenFor("EMAIL", "a@b.co");
      const d1 = v.takePendingDelta()!;
      const b = v.tokenFor("EMAIL", "c@d.co");
      const d2 = v.takePendingDelta()!;

      const rebuilt = PiiVault.fromPayloads(JSON.parse(JSON.stringify([d1, d2])));
      expect(rebuilt.tokenFor("EMAIL", "a@b.co")).toBe(a);
      expect(rebuilt.tokenFor("EMAIL", "c@d.co")).toBe(b);
      expect(rebuilt.restore(`${a} ${b}`)).toBe("a@b.co c@d.co");
      expect(rebuilt.takePendingDelta()).toBeNull();
    });

    it("keeps numbering monotonic after a rebuild (counters = max N per label)", () => {
      const v = new PiiVault();
      v.tokenFor("EMAIL", "a@b.co");
      v.tokenFor("EMAIL", "c@d.co");
      v.tokenFor("EMAIL", "e@f.co");
      const rebuilt = PiiVault.fromPayloads([v.takePendingDelta()!]);
      expect(rebuilt.tokenFor("EMAIL", "new@x.yy")).toMatch(/^\[EMAIL_4#/);
      expect(rebuilt.tokenFor("PHONE", "555-000-1111")).toMatch(/^\[PHONE_1#/);
    });

    it("takes the first nonce, unions payloads, and ignores foreign-nonce and malformed entries", () => {
      const v = new PiiVault();
      const a = v.tokenFor("EMAIL", "a@b.co");
      const nonce = TOKEN.exec(a)![3];
      const other = nonce === "zzzz" ? "yyyy" : "zzzz";
      const rebuilt = PiiVault.fromPayloads([
        null,
        { v: 2 } as any,
        v.takePendingDelta()!,
        {
          v: 1,
          nonce: other,
          entries: [
            { token: `[EMAIL_7#${other}]`, label: "EMAIL", original: "foreign@x.yy" },
            { token: `[PHONE_2#${nonce}]`, label: "PHONE", original: "555-000-2222" },
            { token: 5, label: "X", original: "bad" } as any,
          ],
        },
      ]);
      expect(rebuilt.restore(a)).toBe("a@b.co");
      expect(rebuilt.restore(`[PHONE_2#${nonce}]`)).toBe("555-000-2222");
      expect(rebuilt.restore(`[EMAIL_7#${other}]`)).toBe(`[EMAIL_7#${other}]`);
      expect(rebuilt.tokenFor("PHONE", "555-999-9999")).toMatch(/^\[PHONE_3#/);
    });

    it("fromPayloads([]) yields a fresh working vault", () => {
      const v = PiiVault.fromPayloads([]);
      expect(v.tokenFor("EMAIL", "a@b.co")).toMatch(/^\[EMAIL_1#/);
    });
  });

  it("findTokens only reports canonical tokens of this vault", () => {
    const v = new PiiVault();
    const t = v.tokenFor("EMAIL", "a@b.co");
    const text = `x ${t} [EMAIL_5#abcd] [EMAIL_1] ${t}`;
    expect(v.findTokens(text).map((s) => s.token)).toEqual([t, t]);
  });

  it("knownOriginals lists longest first", () => {
    const v = new PiiVault();
    v.tokenFor("GIVEN_NAME", "Alice");
    v.tokenFor("SURNAME", "Alice Smith");
    expect(v.knownOriginals().map((e) => e.original)).toEqual(["Alice Smith", "Alice"]);
  });
});
