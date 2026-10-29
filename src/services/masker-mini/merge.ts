import type { Span } from "./decode.js";

/** Keeps spans whose label is requested and whose confidence reaches the threshold. */
export function filterSpans(
  spans: readonly Span[],
  labels: Iterable<string> | undefined,
  minimumConfidence: number
): Span[] {
  if (!labels) return [];
  const wanted = new Set(labels);
  if (wanted.size === 0) return [];
  return spans.filter((s) => wanted.has(s.label) && s.confidence >= minimumConfidence);
}

/**
 * Removes overlapping spans (e.g. the same entity seen in two windows), preferring
 * higher confidence, then longer spans. Returns spans sorted by start.
 */
export function dedupeSpans(spans: readonly Span[]): Span[] {
  const ranked = spans
    .slice()
    .sort((a, b) => b.confidence - a.confidence || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: Span[] = [];
  for (const s of ranked) {
    if (!kept.some((k) => s.start < k.end && k.start < s.end)) kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start || a.end - b.end);
}
