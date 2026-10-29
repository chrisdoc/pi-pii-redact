import type { Span } from "./decode.js";

const NUMERIC_LABELS = new Set(["ZIP_CODE", "BUILDING_NUMBER", "AGE", "DATE"]);
const WORD_LABELS = new Set(["GIVEN_NAME", "SURNAME", "STREET_NAME", "CITY"]);

const EDGE_PUNCTUATION = new Set([",", ";", ":", "!", "?", "(", ")", "[", "]", "{", "}", '"']);
const JOINERS = new Set(["'", "’", "-"]);

/** An AGE span directly followed by one of these is a measurement ("72 degrees", "50%"), not an age. */
const NON_AGE_UNIT = /^\s*(?:°|%|percent\b|degrees?\b|celsius\b|fahrenheit\b)/i;

const isSpace = (c: string) => /\s/.test(c);
const isLetter = (c: string | undefined) => c !== undefined && /[\p{L}\p{M}]/u.test(c);
const isGlue = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);
const isAlnum = (c: string | undefined) => c !== undefined && /[\p{L}\p{M}\p{N}]/u.test(c);

/** Trims edge punctuation and whitespace; returns null when nothing is left. */
function trimEdges(text: string, start: number, end: number): [number, number] | null {
  let changed = true;
  while (changed && start < end) {
    changed = false;
    const first = text[start];
    if (isSpace(first) || EDGE_PUNCTUATION.has(first)) {
      start++;
      changed = true;
      continue;
    }
    const last = text[end - 1];
    if (isSpace(last) || EDGE_PUNCTUATION.has(last)) {
      end--;
      changed = true;
      continue;
    }
    // A trailing "." goes, except for a single-letter abbreviation such as "J.".
    if (last === "." && !(end - start === 2 && isLetter(first))) {
      end--;
      changed = true;
    }
  }
  return start < end ? [start, end] : null;
}

/** Extends a span that begins or ends inside a word to cover the whole letter run. */
function extendToWord(text: string, start: number, end: number): [number, number] {
  if (isLetter(text[start - 1]) && isLetter(text[start])) {
    while (start > 0) {
      const prev = text[start - 1];
      if (isLetter(prev) || (JOINERS.has(prev) && isLetter(text[start - 2]) && isLetter(text[start]))) start--;
      else break;
    }
  }
  if (isLetter(text[end]) && isLetter(text[end - 1])) {
    while (end < text.length) {
      const next = text[end];
      if (isLetter(next) || (JOINERS.has(next) && isLetter(text[end + 1]) && isLetter(text[end - 1]))) end++;
      else break;
    }
  }
  return [start, end];
}

/**
 * Extends an ID span that the model tagged only partly (`12345678` in `12345678Z`) to the
 * whole alphanumeric token, so the rest of the ID is not left in plaintext.
 */
function extendToToken(text: string, start: number, end: number): [number, number] {
  while (start > 0 && isAlnum(text[start - 1])) start--;
  while (end < text.length && isAlnum(text[end])) end++;
  return [start, end];
}

/**
 * Cleans raw model spans before label and confidence filtering:
 * - trims edge punctuation (`5,` becomes `5`);
 * - drops numeric spans glued into a larger token (`usr_99812`, `v2`), and AGE spans that are
 *   really temperatures or percentages (`72 degrees`);
 * - widens ID spans glued into a larger token to the whole alphanumeric token (`12345678Z`);
 * - widens name and place spans that start or end mid-word to the whole word.
 */
export function refineSpans(spans: readonly Span[], text: string): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    const trimmed = trimEdges(text, span.start, span.end);
    if (!trimmed) continue;
    let [start, end] = trimmed;
    if (NUMERIC_LABELS.has(span.label)) {
      if (isGlue(text[start - 1]) || isGlue(text[end])) continue;
      if (span.label === "AGE" && NON_AGE_UNIT.test(text.slice(end, end + 12))) continue;
    } else if (span.label === "GOVERNMENT_ID") {
      [start, end] = extendToToken(text, start, end);
    } else if (WORD_LABELS.has(span.label)) {
      [start, end] = extendToWord(text, start, end);
    }
    out.push({ ...span, start, end });
  }
  return out;
}
