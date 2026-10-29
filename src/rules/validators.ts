/**
 * Pure checksum / structural validators for the deterministic PII layer.
 *
 * Regex overlay rules propose loose candidates; these functions accept or reject them.
 *
 * Validators ported from swift-masker (Apache-2.0, Copyright 2026 Offchain Studio).
 * The phone, ABA routing, SSN, IMEI and context helpers are original to this package.
 */
import { isIPv6 } from "node:net";

/** Context handed to `PiiRule.validate`. */
export interface MatchContext {
  text: string;
  start: number;
  end: number;
}

/** Extracts decimal digits (drops spaces, dashes, dots and everything else). */
function digitsOf(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") out.push(ch.charCodeAt(0) - 48);
  }
  return out;
}

/** Luhn (mod-10) check for 12-19 digit numbers; separators are ignored. */
export function luhn(candidate: string): boolean {
  const ds = digitsOf(candidate);
  if (ds.length < 12 || ds.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < ds.length; i++) {
    const d = ds[ds.length - 1 - i];
    if (i % 2 === 1) {
      const dd = d * 2;
      sum += dd > 9 ? dd - 9 : dd;
    } else {
      sum += d;
    }
  }
  return sum % 10 === 0;
}

const IBAN_LENGTH_BY_COUNTRY: Readonly<Record<string, number>> = {
  NL: 18, DE: 22, FR: 27, GB: 22, BE: 16, ES: 24,
  IT: 27, CH: 21, AT: 20, IE: 22, PT: 25, LU: 20,
  FI: 18, DK: 18, NO: 15, SE: 24, PL: 28,
};

/** IBAN: structure, per-country length where known (else 15-34), ISO 7064 mod-97-10. */
export function iban(candidate: string): boolean {
  const compact = candidate.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 15 || compact.length > 34) return false;
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(compact)) return false;
  const expected = IBAN_LENGTH_BY_COUNTRY[compact.slice(0, 2)];
  if (expected !== undefined && compact.length !== expected) return false;

  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    if (ch >= "0" && ch <= "9") {
      remainder = (remainder * 10 + (ch.charCodeAt(0) - 48)) % 97;
    } else {
      remainder = (remainder * 100 + (ch.charCodeAt(0) - 55)) % 97;
    }
  }
  return remainder === 1;
}

/** Dutch BSN / RSIN "elfproef" (9 digits; an 8-digit number is zero-padded). */
export function bsn(candidate: string): boolean {
  const ds = digitsOf(candidate);
  if (ds.length === 8) ds.unshift(0);
  if (ds.length !== 9) return false;
  const weights = [9, 8, 7, 6, 5, 4, 3, 2, -1];
  const sum = ds.reduce((acc, d, i) => acc + d * weights[i], 0);
  return sum !== 0 && sum % 11 === 0;
}

/** US ABA routing transit number: 9 digits, 3-7-1 weighted checksum, not all zero. */
export function abaRoutingNumber(candidate: string): boolean {
  const ds = digitsOf(candidate);
  if (ds.length !== 9 || /[^0-9]/.test(candidate)) return false;
  if (ds.every((d) => d === 0)) return false;
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  const sum = ds.reduce((acc, d, i) => acc + d * w[i], 0);
  return sum % 10 === 0;
}

/** US SSN shape: area not 000/666/900-999, group not 00, serial not 0000. */
export function ssn(candidate: string): boolean {
  const ds = digitsOf(candidate).join("");
  if (ds.length !== 9) return false;
  if (/[^0-9-]/.test(candidate)) return false;
  const area = Number(ds.slice(0, 3));
  const group = Number(ds.slice(3, 5));
  const serial = Number(ds.slice(5));
  if (area === 0 || area === 666 || area >= 900) return false;
  return group !== 0 && serial !== 0;
}

/** Dotted-decimal IPv4: four octets 0-255, no leading zeros. */
export function ipv4(candidate: string): boolean {
  const parts = candidate.split(".");
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^[0-9]{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith("0")) return false;
    if (Number(part) > 255) return false;
  }
  return true;
}

/**
 * IPv6 via `node:net`, after stripping a `%zone`. Also requires at least two non-empty hex
 * groups and at least one decimal digit, so `::`, `a::b`, `Add::Dec` and `std::vector` are rejected.
 */
export function ipv6(candidate: string): boolean {
  const bare = candidate.split("%", 1)[0];
  if (!bare.includes(":")) return false;
  const groups = bare.split(":").filter((g) => g.length > 0);
  if (groups.length < 2) return false;
  if (!/[0-9]/.test(bare)) return false;
  return isIPv6(bare);
}

/** IMEI: 15 digits (separators allowed) passing Luhn. */
export function imei(candidate: string): boolean {
  if (/[^0-9 -]/.test(candidate)) return false;
  const ds = digitsOf(candidate);
  return ds.length === 15 && luhn(ds.join(""));
}

/** Light structural email check: one @, local part, dotted domain, alphabetic TLD >= 2, no `..`. */
export function email(candidate: string): boolean {
  const parts = candidate.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.length === 0 || local.includes("..")) return false;
  if (domain.includes("..") || !domain.includes(".")) return false;
  const labels = domain.split(".");
  if (labels.some((l) => l.length === 0)) return false;
  return /^[A-Za-z]{2,}$/.test(labels[labels.length - 1]);
}

/** True when `keywords` matches within the `window` characters before `start`. */
export function hasContext(text: string, start: number, keywords: RegExp, window = 40): boolean {
  const before = text.slice(Math.max(0, start - window), start);
  const flags = keywords.flags.replace(/[gy]/g, "");
  const re = new RegExp(keywords.source, flags.includes("i") ? flags : `${flags}i`);
  return re.test(before);
}

/** True for a number made of one repeated digit (0000 0000 0000 0000). */
export function allSameDigit(candidate: string): boolean {
  const ds = digitsOf(candidate);
  return ds.length > 0 && ds.every((d) => d === ds[0]);
}

/**
 * Written-format phone number check for candidates from the `phone` rule's loose regex.
 *
 * Requires 7-15 digits and a formatting signal (a `+` or `00 ` country prefix, parentheses,
 * or separators between digit groups), and rejects dates, IPv4 addresses, EU thousands
 * grouping, ranges and decimals.
 */
export function phone(candidate: string): boolean {
  const s = candidate;
  const digitCount = digitsOf(s).length;
  if (digitCount < 7 || digitCount > 15) return false;

  const hasParens = s.includes("(");
  const hasSeparator = /[ .-]/.test(s) || hasParens;
  const prefixed = s.startsWith("+") || (s.startsWith("00") && hasSeparator);
  if (!prefixed && !hasSeparator) return false;

  // Dates (yyyy-mm-dd, dd-mm-yyyy with any separator) and IPv4 addresses.
  if (/^\d{4}[ .-]\d{1,2}[ .-]\d{1,2}$/.test(s)) return false;
  if (/^\d{1,2}[ .-]\d{1,2}[ .-]\d{4}$/.test(s)) return false;
  if (ipv4(s)) return false;
  // EU thousands grouping: 1.234.567
  if (/^\d{1,3}(?:\.\d{3}){2,}$/.test(s)) return false;

  if (prefixed || hasParens) return true;

  // Unprefixed, unparenthesised: stricter shape rules.
  const groups = s.split(/[ .-]+/).filter((g) => g.length > 0);
  if (groups.length === 2) {
    const [a, b] = groups;
    if (a.length === 3 && b.length === 4) return true; // 555-0123
    // Trunk-prefixed national numbers: 06-12345678, 030 1234567
    return a.startsWith("0") && digitCount >= 9 && digitCount <= 12;
  }
  if (digitCount < 9 || digitCount > 12) return false;
  return groups.every((g) => g.length >= 2);
}
