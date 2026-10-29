import type { NerLabel } from "../services/ner-engine.js";
import type { PiiCategory, PiiRule } from "../types.js";
import * as v from "./validators.js";

/**
 * Metadata definition for mapping between masker-mini labels (or overlay vault labels)
 * and extension PiiRule records.
 */
export interface ModelRuleDefinition {
  id: string;
  name: string;
  category: PiiCategory;
  nativeLabel: NerLabel | (string & {});
  enabled: boolean;
  description: string;
  pattern?: RegExp;
  mask?: (match: string) => string;
  validate?: PiiRule["validate"];
  aliases?: string[];
}

const IBAN_PATTERN =
  /(?<![A-Za-z0-9])(?:[A-Za-z]{2}[0-9]{2}(?: [A-Za-z0-9]{4})+(?: [A-Za-z0-9]{1,3})?|[A-Za-z]{2}[0-9]{2}[A-Za-z0-9]{11,30})(?![A-Za-z0-9])/g;

/** Dotted-decimal IPv4 (not part of a longer dotted sequence) or colon-hex IPv6 candidates. */
const IP_PATTERN =
  /(?<![0-9]|[0-9]\.)(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![0-9]|\.[0-9])|(?<![0-9A-Fa-f:])[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}(?:%[A-Za-z0-9]+)?(?![0-9A-Fa-f:])/g;

/**
 * Loose phone candidates: optional `+`/`00` prefix, then digit groups (or parenthesised groups)
 * joined by a single space, dot or hyphen. `validators.phone` makes the final decision.
 */
const PHONE_PATTERN =
  /(?<![\w+.\-/:@$\u20ac\u00a3])(?:\+|00)?(?:\([0-9]{1,5}\)|[0-9]{1,15})(?:(?:[ .-]|(?<=\))|(?=\())(?:\([0-9]{1,5}\)|[0-9]{1,15})){0,7}(?![\w@]|[.,\-:/][0-9])/g;

/**
 * Canonical rule definitions. Rules without a `pattern` are model-backed (masker-mini labels
 * GIVEN_NAME, SURNAME, STREET_NAME, BUILDING_NUMBER, CITY, ZIP_CODE, GOVERNMENT_ID, AGE, DATE);
 * rules with a `pattern` are deterministic overlays. The model's own EMAIL, PHONE and
 * CREDIT_CARD labels are never requested because the deterministic rules own those.
 * "date" is disabled by default (dates in logs and changelogs would be noisy).
 */
export const MODEL_RULE_DEFINITIONS: readonly ModelRuleDefinition[] = [
  // --- Personal Identification ---
  {
    id: "given-name",
    name: "Given Names",
    category: "GIVEN_NAME",
    nativeLabel: "GIVEN_NAME",
    enabled: true,
    description: "Personal first or given names detected by multilingual NER",
  },
  {
    id: "surname",
    name: "Surnames",
    category: "SURNAME",
    nativeLabel: "SURNAME",
    enabled: true,
    description: "Family names or surnames detected by multilingual NER",
  },

  // --- Address & Location ---
  {
    id: "street-name",
    name: "Street Names",
    category: "STREET_NAME",
    nativeLabel: "STREET_NAME",
    enabled: true,
    description: "Street, road, and thoroughfare names",
  },
  {
    id: "building-number",
    name: "Building Numbers",
    category: "BUILDING_NUMBER",
    nativeLabel: "BUILDING_NUMBER",
    enabled: true,
    description: "Building, house, or street numbers",
  },
  {
    id: "city",
    name: "Cities",
    category: "CITY",
    nativeLabel: "CITY",
    enabled: true,
    description: "City, municipality, or town names",
  },
  {
    id: "zip-code",
    name: "Postal / ZIP Codes",
    category: "ZIP_CODE",
    nativeLabel: "ZIP_CODE",
    enabled: true,
    description: "Postal codes and ZIP codes across international formats",
  },

  // --- Deterministic overlay rules (order matters: earlier rules win on overlapping text) ---
  {
    id: "email",
    name: "Email Addresses",
    category: "email",
    nativeLabel: "EMAIL",
    enabled: true,
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}\b/g,
    validate: (m) => v.email(m),
    description: "Electronic mail addresses",
  },
  {
    id: "bank-account",
    name: "Bank Account Numbers",
    category: "BANK_ACCOUNT",
    nativeLabel: "BANK_ACCOUNT",
    enabled: true,
    pattern: IBAN_PATTERN,
    validate: (m) => v.iban(m),
    description: "International bank account numbers (IBAN)",
  },
  {
    id: "imei",
    name: "IMEI Identifiers",
    category: "IMEI",
    nativeLabel: "IMEI",
    enabled: true,
    pattern: /(?<![0-9])[0-9](?:[ -]?[0-9]){14}(?![0-9])/g,
    validate: (m, c) => v.imei(m) && v.hasContext(c.text, c.start, /imei/i),
    description: "International Mobile Equipment Identity 15-digit hardware numbers",
  },
  {
    id: "credit-card",
    name: "Credit Card Numbers",
    category: "credit-card",
    nativeLabel: "CREDIT_CARD",
    enabled: true,
    pattern: /(?<![0-9])[0-9](?:[ -]?[0-9]){12,18}(?![0-9])/g,
    validate: (m) => v.luhn(m) && !v.allSameDigit(m),
    description: "Payment card numbers validated by Luhn algorithm and IIN patterns",
  },
  {
    id: "ssn",
    name: "Social Security Numbers",
    category: "SSN",
    nativeLabel: "SSN",
    enabled: true,
    pattern: /(?<![0-9])(?:[0-9]{3}-[0-9]{2}-[0-9]{4}|[0-9]{9})(?![0-9])/g,
    validate: (m, c) => v.ssn(m) && (m.includes("-") || v.hasContext(c.text, c.start, /ssn|social security/i)),
    description: "US Social Security Numbers and national insurance numbers",
  },
  {
    id: "routing-number",
    name: "Bank Routing Numbers",
    category: "ROUTING_NUMBER",
    nativeLabel: "ROUTING_NUMBER",
    enabled: true,
    pattern: /(?<![0-9])[0-9]{9}(?![0-9])/g,
    validate: (m, c) => v.abaRoutingNumber(m) && v.hasContext(c.text, c.start, /routing|\baba\b|\brtn\b/i),
    description: "Financial routing transit numbers (ABA, transit codes)",
  },
  {
    id: "ip-address",
    name: "IP Addresses",
    category: "ip",
    nativeLabel: "IP_ADDRESS",
    enabled: true,
    pattern: IP_PATTERN,
    validate: (m) => (m.includes(":") ? v.ipv6(m) : v.ipv4(m)),
    description: "IPv4 and IPv6 network addresses",
    aliases: ["ipv4", "ip"],
  },
  {
    id: "phone",
    name: "Phone Numbers",
    category: "phone",
    nativeLabel: "PHONE",
    enabled: true,
    pattern: PHONE_PATTERN,
    validate: (m) => v.phone(m),
    description: "Telephone and mobile phone numbers (international and local)",
  },


  // --- Government identifiers, age and dates (model-backed) ---
  {
    id: "government-id",
    name: "Government IDs",
    category: "GOVERNMENT_ID",
    nativeLabel: "GOVERNMENT_ID",
    enabled: true,
    description: "Government-issued IDs: national ID, passport, tax ID, driver's license and SSN-like numbers",
    aliases: [
      "passport",
      "drivers-license",
      "driver-license",
      "drivers_license",
      "driver_license",
      "tax-id",
      "tax_id",
      "government_id",
    ],
  },
  {
    id: "age",
    name: "Ages",
    category: "AGE",
    nativeLabel: "AGE",
    enabled: true,
    description: "Ages of people (e.g. \"34 years old\")",
  },
  {
    id: "date",
    name: "Dates",
    category: "DATE",
    nativeLabel: "DATE",
    enabled: false,
    description: "Dates, including dates of birth (disabled by default: noisy in logs and changelogs)",
  },

  // --- Organization / Corporate (Disabled by default) ---
];

/**
 * Secret token and API key regex overlay rules.
 * Preserves deterministic masking for secrets not handled by neural NER models.
 */
export const SECRET_RULES: readonly PiiRule[] = [
  {
    id: "secrets",
    name: "Secrets & credentials",
    category: "secret",
    nativeLabel: "SECRET",
    detector: "secret-scanner",
    aliases: ["secret", "credentials"],
    enabled: true,
    builtin: true,
    description: "API keys, tokens, private keys and credentials in URLs, found by an offline secret scanner",
  },
  {
    id: "api-key-generic",
    name: "Common API Keys & Tokens",
    category: "api-key",
    pattern: /\b(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{36,}|glpat-[a-zA-Z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/g,
    enabled: true,
    builtin: true,
    description: "High-entropy API keys for OpenAI, Anthropic, GitHub, GitLab, and AWS",
  },
];

/**
 * Deterministic rules with no native model label (the model is not consulted for them).
 */
export const DETERMINISTIC_RULES: readonly PiiRule[] = [
  {
    id: "nl-bsn",
    name: "Dutch BSN",
    category: "GOVERNMENT_ID",
    pattern: /(?<![0-9])[0-9]{9}(?![0-9])/g,
    validate: (m, c) =>
      v.bsn(m) && v.hasContext(c.text, c.start, /\bbsn\b|burgerservicenummer|\brsin\b|sofi/i),
    enabled: true,
    builtin: true,
    description: "Dutch citizen service numbers (9 digits, elfproef) next to a BSN keyword",
  },
];

/**
 * Fast lookup map from label to canonical rule ID.
 */
export const LABEL_TO_RULE_ID: Readonly<Record<string, string>> = Object.freeze(
  MODEL_RULE_DEFINITIONS.reduce<Record<string, string>>((acc, def) => {
    acc[def.nativeLabel] = def.id;
    return acc;
  }, {})
);

/**
 * Fast lookup map from rule ID (and legacy aliases) to label.
 */
export const RULE_ID_TO_LABEL: Readonly<Record<string, string>> = Object.freeze(
  MODEL_RULE_DEFINITIONS.reduce<Record<string, string>>((acc, def) => {
    acc[def.id] = def.nativeLabel;
    if (def.aliases) {
      for (const alias of def.aliases) {
        acc[alias] = def.nativeLabel;
      }
    }
    return acc;
  }, {})
);

/**
 * Default rule set: the model-backed rules, the deterministic overlay rules and the secret
 * token overlay rule. Only "date" is disabled by default.
 */
export const defaultRules: PiiRule[] = [
  ...MODEL_RULE_DEFINITIONS.map((def): PiiRule => ({
    id: def.id,
    name: def.name,
    category: def.category,
    enabled: def.enabled,
    builtin: true,
    description: def.description,
    nativeLabel: def.nativeLabel,
    ...(def.pattern ? { pattern: def.pattern } : {}),
    ...(def.mask ? { mask: def.mask } : {}),
    ...(def.validate ? { validate: def.validate } : {}),
  })),
  ...DETERMINISTIC_RULES.map((rule): PiiRule => ({ ...rule })),
  ...SECRET_RULES.map((rule): PiiRule => ({ ...rule })),
];

/**
 * Returns all active model labels from an iterable of PiiRules.
 * If all native rules are disabled, returns an empty array.
 */
export function getActiveModelLabels(rules: Iterable<PiiRule>): string[] {
  const labels: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.detector) continue;
    const label = rule.nativeLabel ?? RULE_ID_TO_LABEL[rule.id];
    if (label) {
      labels.push(label);
    }
  }
  return labels;
}

/**
 * Resolves a PiiRule from a rule collection by ID, native label, or alias.
 */
export function findRuleByIdOrLabel(
  rules: Iterable<PiiRule>,
  query: string
): PiiRule | undefined {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  const targetLabel = RULE_ID_TO_LABEL[lower] ?? RULE_ID_TO_LABEL[lower.replace(/_/g, "-")] ?? upper;

  for (const rule of rules) {
    if (rule.id === trimmed || rule.id === lower) return rule;
    if (rule.aliases?.includes(lower)) return rule;
    const ruleLabel = rule.nativeLabel;
    if (ruleLabel && (ruleLabel === upper || ruleLabel === targetLabel)) return rule;
  }
  return undefined;
}
