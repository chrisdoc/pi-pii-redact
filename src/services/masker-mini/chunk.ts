export const MAX_WINDOW_TOKENS = 256;
export const WINDOW_OVERLAP = 32;

/**
 * Splits content tokens into windows of at most `maxLength - 2` tokens (room for
 * [CLS]/[SEP]); adjacent windows share `overlap` tokens. Mirrors Chunker.swift.
 */
export function chunkWindows<T>(
  tokens: readonly T[],
  maxLength: number = MAX_WINDOW_TOKENS,
  overlap: number = WINDOW_OVERLAP
): T[][] {
  const ov = Math.max(0, Math.min(overlap, maxLength - 3));
  const capacity = maxLength - 2;
  if (tokens.length <= capacity) return tokens.length === 0 ? [] : [tokens.slice()];
  const stride = Math.max(1, capacity - ov);
  const windows: T[][] = [];
  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(start + capacity, tokens.length);
    windows.push(tokens.slice(start, end));
    if (end === tokens.length) break;
    start += stride;
  }
  return windows;
}
