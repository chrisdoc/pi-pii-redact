import type { RawFinding, SecretSpan } from "./types.js";

/** Secrets shorter than this are never redacted (too many false positives). */
export const MIN_SECRET_LENGTH = 8;

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

export function isPrivateKeyRule(finding: Pick<RawFinding, "ruleId" | "tags">): boolean {
  const haystack = [finding.ruleId, ...(finding.tags ?? [])].join(" ").toLowerCase();
  return haystack.includes("private-key") || haystack.includes("pem");
}

/** Whether a finding's secret is worth redacting at all (length and whitespace checks). */
export function isPlausibleSecret(finding: Pick<RawFinding, "ruleId" | "tags" | "secret">): boolean {
  if (!finding.secret || finding.secret.length < MIN_SECRET_LENGTH) return false;
  // Whitespace means the rule captured a whole command or sentence (e.g. curl-auth-header),
  // except for multi-line private keys.
  if (/\s/.test(finding.secret) && !isPrivateKeyRule(finding)) return false;
  return true;
}

/** Characters that make up an API-key-like token. */
const KEY_CHAR = /[A-Za-z0-9_-]/;

/**
 * Widens a span that starts or ends inside a key-like token to the whole token, so a rule that
 * captured only part of a key (e.g. the tail after a prefix) does not leave the rest in plaintext.
 * Private-key blocks are left alone.
 */
export function widenToToken(text: string, span: SecretSpan, privateKey = false): SecretSpan {
  if (privateKey) return span;
  let { start, end } = span;
  if (KEY_CHAR.test(text[start] ?? "")) while (start > 0 && KEY_CHAR.test(text[start - 1])) start--;
  if (KEY_CHAR.test(text[end - 1] ?? "")) while (end < text.length && KEY_CHAR.test(text[end])) end++;
  return start === span.start && end === span.end ? span : { ...span, start, end };
}

/**
 * Resolves overlapping spans. Higher confidence wins; among equal confidence the narrowest
 * wins (a specific match beats a wrapper). Confidence goes first because low-confidence
 * generic rules often capture only a fragment of a real key (for example up to the first
 * "-"), and letting such a narrow fragment win would leave the rest of the key in the text.
 * Result is sorted by start offset.
 */
export function selectSpans(candidates: readonly SecretSpan[]): SecretSpan[] {
  const ordered = [...candidates].sort(
    (a, b) =>
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
      a.end - a.start - (b.end - b.start) ||
      a.start - b.start
  );
  const kept: SecretSpan[] = [];
  for (const span of ordered) {
    if (kept.some((k) => span.start < k.end && span.end > k.start)) continue;
    kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}
