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
 * Unions overlapping spans of the same label, retaining the highest confidence.
 * Resolves other overlaps by confidence, then length, without widening the winner.
 * Returns non-overlapping spans sorted by start.
 */
export function dedupeSpans(spans: readonly Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of spans) {
    const combined = { ...span };
    for (let i = 0; i < merged.length;) {
      const existing = merged[i];
      if (combined.label === existing.label && combined.start < existing.end && existing.start < combined.end) {
        combined.start = Math.min(combined.start, existing.start);
        combined.end = Math.max(combined.end, existing.end);
        combined.confidence = Math.max(combined.confidence, existing.confidence);
        merged.splice(i, 1);
        i = 0; // Expansion may reach a span we already checked.
      } else {
        i++;
      }
    }
    merged.push(combined);
  }
  const ranked = merged
    .sort((a, b) => b.confidence - a.confidence || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: Span[] = [];
  for (const s of ranked) {
    if (!kept.some((k) => s.start < k.end && k.start < s.end)) kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start || a.end - b.end);
}
