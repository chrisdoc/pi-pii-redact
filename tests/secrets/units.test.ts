import { trimRuleset, EXTRA_GITLEAKS_RULES } from "../../src/services/secrets/index.js";
import { describe, it, expect } from "vitest";
import { lineStartOffsets, locateSecret } from "../../src/services/secrets/offsets.js";
import { isPlausibleSecret, selectSpans, widenToToken, MIN_SECRET_LENGTH } from "../../src/services/secrets/select.js";
import { passesSecretGate } from "../../src/services/secrets/gate.js";
import type { SecretSpan } from "../../src/services/secrets/types.js";

const SECRET = "Zq8vXk2LmN4pRt7W";

function locate(text: string, secret: string, startLine: number, startColumn: number, endLine = startLine) {
  return locateSecret(text, lineStartOffsets(text), { secret, startLine, startColumn, endLine });
}

describe("lineStartOffsets", () => {
  it("handles \\n and \\r\\n", () => {
    expect(lineStartOffsets("a\nbb\nc")).toEqual([0, 2, 5]);
    expect(lineStartOffsets("a\r\nbb\r\nc")).toEqual([0, 3, 7]);
    expect(lineStartOffsets("")).toEqual([0]);
  });
});

describe("locateSecret", () => {
  it("finds a secret on a later line of a multi-line text", () => {
    const text = `first line\nsecond\nkey=${SECRET} end`;
    const at = locate(text, SECRET, 3, 5)!;
    expect(text.slice(at.start, at.end)).toBe(SECRET);
    expect(at.start).toBe(text.indexOf(SECRET));
  });

  it("handles CRLF line endings", () => {
    const text = `a\r\nb\r\nkey=${SECRET}\r\nz`;
    const at = locate(text, SECRET, 3, 5)!;
    expect(text.slice(at.start, at.end)).toBe(SECRET);
  });

  it("tolerates non-ASCII before the secret on the same line (byte-based columns)", () => {
    const text = `Grüße 😀 — key=${SECRET}`;
    const utf16 = text.indexOf(SECRET);
    const byteColumn = Buffer.byteLength(text.slice(0, utf16)) + 1;
    const at = locate(text, SECRET, 1, byteColumn)!;
    expect(at.start).toBe(utf16);
    expect(text.slice(at.start, at.end)).toBe(SECRET);
  });

  it("picks the occurrence closest to the reported column when the secret appears twice", () => {
    const text = `${SECRET} and again ${SECRET}`;
    const second = text.lastIndexOf(SECRET);
    expect(locate(text, SECRET, 1, second + 1)!.start).toBe(second);
    expect(locate(text, SECRET, 1, 1)!.start).toBe(0);
  });

  it("prefers the reported line over an earlier identical occurrence", () => {
    const text = `${SECRET}\nother\n${SECRET}`;
    expect(locate(text, SECRET, 3, 1)!.start).toBe(text.lastIndexOf(SECRET));
  });

  it("falls back to a global search when the line is wrong", () => {
    const text = `x\ny ${SECRET}`;
    expect(locate(text, SECRET, 1, 1)!.start).toBe(text.indexOf(SECRET));
  });

  it("returns null when the secret is not in the text", () => {
    expect(locate("nothing here", SECRET, 1, 1)).toBeNull();
    expect(locate("nothing here", "", 1, 1)).toBeNull();
  });

  it("locates multi-line secrets", () => {
    const pem = "-----BEGIN KEY-----\nabcdefgh\n-----END KEY-----";
    const text = `intro\n${pem}\noutro`;
    const at = locate(text, pem, 2, 1, 4)!;
    expect(text.slice(at.start, at.end)).toBe(pem);
  });
});

describe("isPlausibleSecret", () => {
  it("drops short secrets", () => {
    expect(isPlausibleSecret({ ruleId: "x", secret: "a".repeat(MIN_SECRET_LENGTH - 1) })).toBe(false);
    expect(isPlausibleSecret({ ruleId: "x", secret: "a".repeat(MIN_SECRET_LENGTH) })).toBe(true);
  });

  it("drops secrets containing whitespace", () => {
    expect(isPlausibleSecret({ ruleId: "curl-auth-header", secret: "curl -X POST https://example.com -H" })).toBe(false);
  });

  it("keeps whitespace in private keys (by rule id or tag)", () => {
    const secret = "-----BEGIN PRIVATE KEY-----\nabcdefgh\n-----END PRIVATE KEY-----";
    expect(isPlausibleSecret({ ruleId: "private-key", secret })).toBe(true);
    expect(isPlausibleSecret({ ruleId: "kingfisher.pem.1", secret })).toBe(true);
    expect(isPlausibleSecret({ ruleId: "other", tags: ["private-key"], secret })).toBe(true);
    expect(isPlausibleSecret({ ruleId: "other", secret })).toBe(false);
  });
});

describe("widenToToken", () => {
  const at = (text: string, part: string): SecretSpan => {
    const start = text.indexOf(part);
    return { start, end: start + part.length, ruleId: "generic", confidence: "low" };
  };
  const slice = (text: string, s: SecretSpan) => text.slice(s.start, s.end);

  it("widens a span that captured only the tail of a key to the whole token", () => {
    const text = "STRIPE_SECRET_KEY=sk_fake_51HxxFAKEFAKE1234567890abcdef\nPORT=3000";
    expect(slice(text, widenToToken(text, at(text, "FAKEFAKE1234567890abcdef")))).toBe("sk_fake_51HxxFAKEFAKE1234567890abcdef");
  });

  it("does not cross '=', quotes, '@', ':' or whitespace", () => {
    const text = 'password = "hunter2-correct-horse" url=postgres://admin:S3cr3t@db:5432';
    expect(slice(text, widenToToken(text, at(text, "hunter2-correct-horse")))).toBe("hunter2-correct-horse");
    expect(slice(text, widenToToken(text, at(text, "postgres://admin:S3cr3t@")))).toBe("postgres://admin:S3cr3t@");
  });

  it("leaves private-key spans alone", () => {
    const text = "xx-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----yy";
    const s = at(text, "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");
    expect(widenToToken(text, s, true)).toBe(s);
  });
});

describe("selectSpans", () => {
  const span = (start: number, end: number, ruleId: string, confidence: SecretSpan["confidence"] = "high"): SecretSpan => ({
    start,
    end,
    ruleId,
    confidence,
  });

  it("keeps the narrowest of overlapping spans with equal confidence", () => {
    const out = selectSpans([span(0, 50, "wrapper"), span(10, 40, "specific")]);
    expect(out.map((s) => s.ruleId)).toEqual(["specific"]);
  });

  it("prefers higher confidence over narrower width (a low-confidence fragment must not leak the rest of a key)", () => {
    const out = selectSpans([span(0, 48, "generic-fragment", "low"), span(0, 108, "anthropic", "high")]);
    expect(out.map((s) => s.ruleId)).toEqual(["anthropic"]);
  });

  it("picks the highest confidence for identical spans", () => {
    const out = selectSpans([span(0, 20, "a", "low"), span(0, 20, "b", "high"), span(0, 20, "c", "medium")]);
    expect(out.map((s) => s.ruleId)).toEqual(["b"]);
  });

  it("keeps disjoint spans sorted by start", () => {
    const out = selectSpans([span(30, 40, "b"), span(0, 10, "a")]);
    expect(out.map((s) => s.ruleId)).toEqual(["a", "b"]);
  });

  it("treats touching spans as disjoint", () => {
    expect(selectSpans([span(0, 10, "a"), span(10, 20, "b")])).toHaveLength(2);
  });
});

describe("passesSecretGate", () => {
  it("lets through long token-like runs, PEM headers, URL credentials and assignments", () => {
    expect(passesSecretGate("x ".repeat(3) + "A".repeat(20))).toBe(true);
    expect(passesSecretGate("-----BEGIN PRIVATE KEY-----")).toBe(true);
    expect(passesSecretGate("db at postgres://user:pw@host/x")).toBe(true);
    expect(passesSecretGate("Password: x")).toBe(true);
    expect(passesSecretGate("api_key = 1")).toBe(true);
  });

  it("blocks ordinary prose", () => {
    expect(passesSecretGate("Hello, my name is Jane and I live in Berlin.")).toBe(false);
    expect(passesSecretGate("")).toBe(false);
  });
});

describe("trimRuleset", () => {
  it("drops gitleaks rules except the kept extras and keeps everything else", () => {
    const full = {
      allowlists: [{ paths: ["x"] }],
      rules: [
        { id: "kingfisher.anthropic.1", source: "kingfisher" },
        { id: "github-pat", source: "gitleaks" },
        { id: "okta-access-token", source: "gitleaks" },
        { id: "custom" },
      ],
    };
    const trimmed = trimRuleset(full);
    expect(trimmed.rules?.map((r) => r.id)).toEqual(["kingfisher.anthropic.1", "github-pat", "custom"]);
    expect(trimmed.allowlists).toBe(full.allowlists);
    expect(EXTRA_GITLEAKS_RULES.has("huggingface-access-token")).toBe(true);
  });
});
