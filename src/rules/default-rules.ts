import type { RedactLabel } from "@desert-ant-labs/redact/native";
import type { PiiCategory, PiiRule } from "../types.js";

/**
 * Metadata definition for mapping between native @desert-ant-labs/redact labels
 * and extension PiiRule records.
 */
export interface ModelRuleDefinition {
  id: string;
  name: string;
  category: PiiCategory;
  nativeLabel: RedactLabel;
  enabled: boolean;
  description: string;
  pattern?: RegExp;
  mask?: (match: string) => string;
  aliases?: string[];
}

/**
 * Canonical definitions for all 22 native labels in @desert-ant-labs/redact.
 * Exactly 21 labels are enabled by default (matching DEFAULT_LABELS).
 * "ORG" is disabled by default to avoid over-redacting company and project names.
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
    id: "secondary-address",
    name: "Secondary Addresses",
    category: "SECONDARY_ADDRESS",
    nativeLabel: "SECONDARY_ADDRESS",
    enabled: true,
    description: "Apartment, suite, unit, or floor numbers",
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
    id: "state",
    name: "States / Provinces",
    category: "STATE",
    nativeLabel: "STATE",
    enabled: true,
    description: "State, province, or region names",
  },
  {
    id: "zip-code",
    name: "Postal / ZIP Codes",
    category: "ZIP_CODE",
    nativeLabel: "ZIP_CODE",
    enabled: true,
    description: "Postal codes and ZIP codes across international formats",
  },

  // --- Contact & Communications ---
  {
    id: "email",
    name: "Email Addresses",
    category: "email",
    nativeLabel: "EMAIL",
    enabled: true,
    description: "Electronic mail addresses",
  },
  {
    id: "phone",
    name: "Phone Numbers",
    category: "phone",
    nativeLabel: "PHONE",
    enabled: true,
    description: "Telephone and mobile phone numbers (international and local)",
  },

  // --- Financial Identifiers ---
  {
    id: "credit-card",
    name: "Credit Card Numbers",
    category: "credit-card",
    nativeLabel: "CREDIT_CARD",
    enabled: true,
    description: "Payment card numbers validated by Luhn algorithm and IIN patterns",
  },
  {
    id: "bank-account",
    name: "Bank Account Numbers",
    category: "BANK_ACCOUNT",
    nativeLabel: "BANK_ACCOUNT",
    enabled: true,
    description: "International and domestic bank account numbers (including IBAN)",
  },
  {
    id: "routing-number",
    name: "Bank Routing Numbers",
    category: "ROUTING_NUMBER",
    nativeLabel: "ROUTING_NUMBER",
    enabled: true,
    description: "Financial routing transit numbers (ABA, transit codes)",
  },

  // --- Network & Digital Identifiers ---
  {
    id: "ip-address",
    name: "IP Addresses",
    category: "ip",
    nativeLabel: "IP_ADDRESS",
    enabled: true,
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    description: "IPv4 and IPv6 network addresses",
    aliases: ["ipv4", "ip"],
  },
  {
    id: "url",
    name: "URLs & Web Addresses",
    category: "URL",
    nativeLabel: "URL",
    enabled: true,
    description: "HTTP/HTTPS URLs, domains, and web addresses",
  },

  // --- Government & National Identifiers ---
  {
    id: "government-id",
    name: "Government IDs",
    category: "GOVERNMENT_ID",
    nativeLabel: "GOVERNMENT_ID",
    enabled: true,
    description: "National identification numbers and civil registry IDs",
  },
  {
    id: "passport",
    name: "Passport Numbers",
    category: "PASSPORT",
    nativeLabel: "PASSPORT",
    enabled: true,
    description: "International passport numbers",
  },
  {
    id: "drivers-license",
    name: "Driver's License Numbers",
    category: "DRIVERS_LICENSE",
    nativeLabel: "DRIVERS_LICENSE",
    enabled: true,
    description: "Driver's license and motor vehicle permit identifiers",
  },
  {
    id: "tax-id",
    name: "Tax ID Numbers",
    category: "TAX_ID",
    nativeLabel: "TAX_ID",
    enabled: true,
    description: "Taxpayer identification numbers (EIN, ITIN, international TIN)",
  },
  {
    id: "ssn",
    name: "Social Security Numbers",
    category: "SSN",
    nativeLabel: "SSN",
    enabled: true,
    description: "US Social Security Numbers and national insurance numbers",
  },
  {
    id: "imei",
    name: "IMEI Identifiers",
    category: "IMEI",
    nativeLabel: "IMEI",
    enabled: true,
    description: "International Mobile Equipment Identity 15-digit hardware numbers",
  },

  // --- Organization / Corporate (Disabled by default) ---
  {
    id: "org",
    name: "Organizations & Companies",
    category: "ORG",
    nativeLabel: "ORG",
    enabled: false,
    description: "Commercial and institutional organization names (disabled by default in DEFAULT_LABELS)",
  },
];

/**
 * Secret token and API key regex overlay rules.
 * Preserves deterministic masking for secrets not handled by neural NER models.
 */
export const SECRET_RULES: readonly PiiRule[] = [
  {
    id: "api-key-generic",
    name: "Common API Keys & Tokens",
    category: "api-key",
    pattern: /\b(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{36,}|glpat-[a-zA-Z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/g,
    mask: () => "[REDACTED:API_KEY]",
    enabled: true,
    builtin: true,
    description: "High-entropy API keys for OpenAI, Anthropic, GitHub, GitLab, and AWS",
  },
];

/**
 * Fast lookup map from RedactLabel to canonical rule ID.
 */
export const LABEL_TO_RULE_ID: Readonly<Record<RedactLabel, string>> = Object.freeze(
  MODEL_RULE_DEFINITIONS.reduce<Record<string, string>>((acc, def) => {
    acc[def.nativeLabel] = def.id;
    return acc;
  }, {}) as Record<RedactLabel, string>
);

/**
 * Fast lookup map from rule ID (and legacy aliases) to RedactLabel.
 */
export const RULE_ID_TO_LABEL: Readonly<Record<string, RedactLabel>> = Object.freeze(
  MODEL_RULE_DEFINITIONS.reduce<Record<string, RedactLabel>>((acc, def) => {
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
 * Default rule set containing all 22 native model rules plus the secret token overlay rule.
 * 22 rules are enabled by default (21 native labels + api-key-generic).
 * 1 rule ("org") is disabled by default.
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
  })),
  ...SECRET_RULES.map((rule): PiiRule => ({ ...rule })),
];

/**
 * Returns all active RedactLabel instances from an iterable of PiiRules.
 * If all native rules are disabled, returns an empty array.
 */
export function getActiveModelLabels(rules: Iterable<PiiRule>): RedactLabel[] {
  const labels: RedactLabel[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
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
  const targetLabel = RULE_ID_TO_LABEL[lower] ?? (upper as RedactLabel);

  for (const rule of rules) {
    if (rule.id === trimmed || rule.id === lower) return rule;
    const ruleLabel = rule.nativeLabel;
    if (ruleLabel && (ruleLabel === upper || ruleLabel === targetLabel)) return rule;
  }
  return undefined;
}
