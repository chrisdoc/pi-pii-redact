import type { RawFinding } from "./types.js";

/** Start offset (UTF-16) of every line; lines end at \n, so \r\n is handled too. */
export function lineStartOffsets(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
    starts.push(i + 1);
  }
  return starts;
}

/**
 * Locates `finding.secret` in `text`. Columns may be byte based, so they are only used as an
 * estimate: among the occurrences inside the reported line range, the one closest to the
 * estimated position wins. Falls back to the first global occurrence; returns null if the
 * secret is not in the text.
 */
export function locateSecret(
  text: string,
  lineStarts: readonly number[],
  finding: Pick<RawFinding, "secret" | "startLine" | "startColumn" | "endLine">
): { start: number; end: number } | null {
  const secret = finding.secret;
  if (!secret) return null;

  const firstLine = Math.min(Math.max(finding.startLine, 1), lineStarts.length);
  const lastLine = Math.min(Math.max(finding.endLine, firstLine), lineStarts.length);
  const rangeStart = lineStarts[firstLine - 1];
  const rangeEnd = lastLine < lineStarts.length ? lineStarts[lastLine] : text.length;
  const estimate = rangeStart + Math.max(0, finding.startColumn - 1);

  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = text.indexOf(secret, rangeStart); i !== -1 && i < rangeEnd; i = text.indexOf(secret, i + 1)) {
    const distance = Math.abs(i - estimate);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  if (best === -1) best = text.indexOf(secret);
  if (best === -1) return null;
  return { start: best, end: best + secret.length };
}
