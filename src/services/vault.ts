import { randomInt } from "node:crypto";

/** A single persisted vault mapping. */
export interface VaultEntry {
  token: string;
  label: string;
  original: string;
}

/** JSON-serializable, versioned snapshot (or delta) of a vault, suitable for session persistence. */
export interface VaultPayload {
  v: 1;
  nonce: string;
  entries: VaultEntry[];
}

/** A located token inside a text. */
export interface TokenSpan {
  start: number;
  end: number;
  token: string;
}

const NONCE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const NONCE_LENGTH = 4;
const STRICT_TOKEN_SHAPE = /^\[([A-Z][A-Z0-9_]*)_(\d+)#([a-z0-9]{4})\]$/;

function generateNonce(): string {
  let out = "";
  for (let i = 0; i < NONCE_LENGTH; i++) {
    out += NONCE_ALPHABET[randomInt(NONCE_ALPHABET.length)];
  }
  return out;
}

function normalizeLabel(label: string): string {
  const cleaned = label.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return /^[A-Z]/.test(cleaned) ? cleaned : `X_${cleaned}`;
}

/**
 * Session-scoped two-way map between sensitive original values and stable tokens
 * of the form `[LABEL_N#nonce]`.
 *
 * - The same original always maps to the same token.
 * - Per-label counters only ever increase.
 * - The random nonce (created once per vault and persisted with it) makes tokens
 *   unforgeable by file contents: text that merely looks like `[EMAIL_1]` is never restored.
 */
export class PiiVault {
  private readonly nonce: string;
  private readonly byOriginal = new Map<string, VaultEntry>();
  private readonly byToken = new Map<string, VaultEntry>();
  private readonly byKey = new Map<string, VaultEntry>(); // "LABEL_N" -> entry
  private readonly counters = new Map<string, number>();
  private pending: VaultEntry[] = [];
  private readonly strictRegex: RegExp;
  private readonly tolerantRegex: RegExp;

  constructor(nonce?: string) {
    this.nonce = nonce && /^[a-z0-9]{4}$/.test(nonce) ? nonce : generateNonce();
    this.strictRegex = new RegExp(`\\[([A-Z][A-Z0-9_]*)_(\\d+)#${this.nonce}\\]`, "g");
    const label = "([A-Za-z][A-Za-z0-9_]*)_(\\d+)";
    this.tolerantRegex = new RegExp(
      `\\[\\s*${label}\\s*#\\s*${this.nonce}\\s*\\]|(?<![A-Za-z0-9_])${label}\\s*#\\s*${this.nonce}(?![A-Za-z0-9])`,
      "gi"
    );
  }

  /** Rebuilds a vault from persisted payloads: union of entries, first nonce wins, counters = max N per label. */
  public static fromPayloads(payloads: ReadonlyArray<VaultPayload | null | undefined>): PiiVault {
    const valid = payloads.filter(
      (p): p is VaultPayload =>
        !!p && typeof p === "object" && p.v === 1 && typeof p.nonce === "string" && Array.isArray(p.entries)
    );
    const firstNonce = valid.find((p) => /^[a-z0-9]{4}$/.test(p.nonce))?.nonce;
    const vault = new PiiVault(firstNonce);
    for (const payload of valid) {
      for (const e of payload.entries) {
        if (!e || typeof e.token !== "string" || typeof e.label !== "string" || typeof e.original !== "string") {
          continue;
        }
        const m = STRICT_TOKEN_SHAPE.exec(e.token);
        if (!m || m[3] !== vault.nonce) continue; // foreign nonce: could never be restored by this vault
        vault.insert({ token: e.token, label: m[1], original: e.original }, parseInt(m[2], 10));
      }
    }
    vault.pending = [];
    return vault;
  }

  private insert(entry: VaultEntry, n: number): boolean {
    if (this.byToken.has(entry.token) || this.byOriginal.has(entry.original)) return false;
    this.byOriginal.set(entry.original, entry);
    this.byToken.set(entry.token, entry);
    this.byKey.set(`${entry.label}_${n}`, entry);
    this.counters.set(entry.label, Math.max(this.counters.get(entry.label) ?? 0, n));
    this.pending.push(entry);
    return true;
  }

  /** Returns the existing token for `original`, or mints a new one under `label`. */
  public tokenFor(label: string, original: string): string {
    const existing = this.byOriginal.get(original);
    if (existing) return existing.token;
    const norm = normalizeLabel(label);
    const n = (this.counters.get(norm) ?? 0) + 1;
    const token = `[${norm}_${n}#${this.nonce}]`;
    this.insert({ token, label: norm, original }, n);
    return token;
  }

  /** Replaces this vault's tokens (tolerant matching) with their originals. Unknown tokens are left unchanged. */
  public restore(text: string): string {
    if (!text || typeof text !== "string") return text ?? "";
    if (this.byToken.size === 0) return text;
    return text.replace(this.tolerantRegex, (match, l1, n1, l2, n2) => {
      const label = String(l1 ?? l2).toUpperCase();
      const n = parseInt(String(n1 ?? n2), 10);
      const entry = this.byKey.get(`${label}_${n}`);
      return entry ? entry.original : match;
    });
  }

  /** True if `str` is exactly a canonical token of this vault. */
  public isKnownToken(str: string): boolean {
    return this.byToken.has(str);
  }

  /** Locates canonical tokens of this vault inside `text`. */
  public findTokens(text: string): TokenSpan[] {
    const spans: TokenSpan[] = [];
    if (!text || this.byToken.size === 0) return spans;
    this.strictRegex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = this.strictRegex.exec(text)) !== null) {
      if (this.byToken.has(m[0])) {
        spans.push({ start: m.index, end: m.index + m[0].length, token: m[0] });
      }
    }
    return spans;
  }

  /** Known originals with their labels and tokens, longest first. */
  public knownOriginals(): VaultEntry[] {
    return Array.from(this.byOriginal.values()).sort((a, b) => b.original.length - a.original.length);
  }

  public get size(): number {
    return this.byToken.size;
  }

  /** Returns entries added since the previous call as a payload, or null if there are none. */
  public takePendingDelta(): VaultPayload | null {
    if (this.pending.length === 0) return null;
    const entries = this.pending;
    this.pending = [];
    return { v: 1, nonce: this.nonce, entries: entries.map((e) => ({ ...e })) };
  }

  /** Full JSON-serializable snapshot of the vault. */
  public toPayload(): VaultPayload {
    return {
      v: 1,
      nonce: this.nonce,
      entries: Array.from(this.byToken.values()).map((e) => ({ ...e })),
    };
  }
}
