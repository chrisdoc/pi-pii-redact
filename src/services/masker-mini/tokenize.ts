/** Half-open character range [start, end) in the original text. */
export type Range = [number, number];

export interface ContentToken {
  id: number;
  /** Range in the original text, or null when the piece could not be aligned. */
  range: Range | null;
}

export interface Piece {
  id: number;
  piece: string;
}

/** Ids that never map to text: [PAD] [CLS] [SEP] [UNK] and [MASK]. */
export const SPECIAL_IDS: ReadonlySet<number> = new Set([0, 1, 2, 3, 63895]);
/** Whitespace, control and format characters the tokenizer's normalizer drops or turns into spaces. */
const SKIPPABLE = /[\s\p{Cc}\p{Cf}]/u;
/** How far past the cursor a piece may be searched after an unknown token. */

export interface Normalized {
  text: string;
  /** For each UTF-16 unit of `text`, the [start,end) range it came from in the original. */
  map: Range[];
}

/**
 * NFKC-normalizes `text` per cluster (a code point plus any following combining marks),
 * recording the origin range of every normalized UTF-16 unit.
 */
export function normalizeWithMap(text: string): Normalized {
  const map: Range[] = [];
  let out = "";
  let pos = 0;
  const flush = (cluster: string, start: number, end: number) => {
    const n = cluster.normalize("NFKC");
    out += n;
    for (let i = 0; i < n.length; i++) map.push([start, end]);
  };
  let cluster = "";
  let clusterStart = 0;
  for (const ch of Array.from(text)) {
    const isMark = /^\p{M}$/u.test(ch);
    if (cluster && !isMark) {
      flush(cluster, clusterStart, pos);
      cluster = "";
    }
    if (!cluster) clusterStart = pos;
    cluster += ch;
    pos += ch.length;
  }
  if (cluster) flush(cluster, clusterStart, pos);
  return { text: out, map };
}

/**
 * Greedily aligns tokenizer pieces to the normalized string. Returns one range
 * (in normalized coordinates) or null per piece. Special/unknown/empty pieces and
 * pieces not found at the cursor get null and do not advance it. After an unknown
 * token (which swallows an unknown number of characters) the next piece may be
 * found a short distance ahead.
 */
export function alignPieces(
  normalized: string,
  pieces: Piece[],
  specialIds: ReadonlySet<number> = SPECIAL_IDS
): Array<Range | null> {
  const out: Array<Range | null> = [];
  let cursor = 0;
  let gap = false;
  const skip = () => {
    while (cursor < normalized.length) {
      const cp = normalized.codePointAt(cursor)!;
      const ch = String.fromCodePoint(cp);
      if (!SKIPPABLE.test(ch)) break;
      cursor += ch.length;
    }
  };
  for (const { id, piece: raw } of pieces) {
    if (specialIds.has(id)) {
      out.push(null);
      if (id === 3) gap = true;
      continue;
    }
    const piece = raw.replace(/^▁/, "");
    if (!piece) {
      out.push(null);
      continue;
    }
    skip();
    let at = -1;
    if (normalized.startsWith(piece, cursor)) at = cursor;
    else if (gap) {
      const found = normalized.indexOf(piece, cursor);
      if (found >= 0) at = found;
    }
    if (at < 0) {
      out.push(null);
      continue;
    }
    out.push([at, at + piece.length]);
    cursor = at + piece.length;
    gap = false;
  }
  return out;
}

export interface TokenizerLike {
  encode(text: string, options?: { add_special_tokens?: boolean }): { ids: number[]; tokens: string[] };
}

/** Encodes `text` into content tokens (no [CLS]/[SEP]) with ranges in the original text. */
export function tokenizeWithOffsets(tokenizer: TokenizerLike, text: string): ContentToken[] {
  const { text: normalized, map } = normalizeWithMap(text);
  if (!normalized.trim()) return [];
  const enc = tokenizer.encode(normalized, { add_special_tokens: false });
  const pieces = enc.ids.map((id, i) => ({ id, piece: enc.tokens[i] ?? "" }));
  const aligned = alignPieces(normalized, pieces);
  return pieces.map((p, i) => {
    const r = aligned[i];
    if (!r) return { id: p.id, range: null };
    return { id: p.id, range: [map[r[0]][0], map[r[1] - 1][1]] as Range };
  });
}
