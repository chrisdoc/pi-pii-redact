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
 * Merges overlapping spans (retaining their full extent), preferring
 * higher confidence, then longer spans for metadata. Returns spans sorted by start.
 */
export function dedupeSpans(spans: readonly Span[]): Span[] {
  const ranked = spans
    .slice()
    .sort((a, b) => b.confidence - a.confidence || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: Span[] = [];
  for (const s of ranked) {
    const overlaps = kept.filter((k) => s.start < k.end && k.start < s.end);
    if (!overlaps.length) {
      kept.push({ ...s });
    } else {
      const existing = overlaps[0];
      existing.start = Math.min(existing.start, s.start);
      existing.end = Math.max(existing.end, s.end);
      for (const other of overlaps.slice(1)) {
        existing.start = Math.min(existing.start, other.start);
        existing.end = Math.max(existing.end, other.end);
        kept.splice(kept.indexOf(other), 1);
      }
    }
  }
  return kept.sort((a, b) => a.start - b.start || a.end - b.end);
}
