import type { NerLabel } from "./services/ner-engine.js";

export type { NerLabel };

/**
 * Supported PII categories: the labels emitted by the masker-mini model, the
 * categories of the deterministic rules, and extension-specific categories.
 */
export type PiiCategory =
  | NerLabel
  | "BANK_ACCOUNT"
  | "IMEI"
  | "SSN"
  | "ROUTING_NUMBER"
  | "email"
  | "phone"
  | "ip"
  | "credit-card"
  | "api-key"
  | "secret"
  | "custom";

/**
 * Representation of a PII detection or redaction rule.
 * For native model-backed rules, pattern and mask are optional.
 * For regex-based overlay rules (e.g. api-key-generic), pattern and mask are provided.
 */
export interface PiiRule {
  id: string;
  name: string;
  category: PiiCategory;
  pattern?: RegExp;
  mask?: (match: string) => string;
  /**
   * Optional acceptance check for overlay rules. A regex match for which this returns false
   * is left untouched (no token, no redaction detail).
   */
  validate?: (match: string, context: { text: string; start: number; end: number }) => boolean;
  enabled: boolean;
  description?: string;
  builtin?: boolean;
  /** Model label requested for model-backed rules, or the vault label of an overlay rule. */
  nativeLabel?: NerLabel | (string & {});
  /**
   * Marks a rule backed by an external detector instead of a pattern or a model label.
   * Such rules are never sent to the NER model as labels.
   */
  detector?: "secret-scanner";
  /** Additional names accepted by `toggleRule`. */
  aliases?: string[];
}

/**
 * Detailed metadata for an individual redaction item.
 * Preserves backwards compatibility with existing consumers (ruleId, category, original, masked)
 * while exposing native engine metadata (placeholder, confidence, character offsets).
 */
export interface RedactionDetail {
  category: PiiCategory;
  ruleId: string;
  original: string;
  masked: string;
  placeholder?: string;
  confidence?: number;
  start?: number;
  end?: number;
}

/**
 * Result returned by RedactorService.redact().
 */
export interface RedactionResult {
  text: string;
  hasRedactions: boolean;
  count: number;
  redactions: RedactionDetail[];
  /**
   * Restoration helper backed by the session vault.
   * Restores vault tokens (tolerantly matched) in processed text back to original values.
   */
  restore: (processed: string) => string;
}

/**
 * Configuration options governing PII detection and redaction behavior.
 */
export interface RedactorConfig {
  enabled: boolean;
  maskUserInputs: boolean;
  maskToolResults: boolean;
  maskContextMessages: boolean;
  notifyOnRedact: boolean;
  /**
   * Minimum neural confidence threshold (0.0 to 1.0). Default is 0.55 (calibrated on the eval/ corpus).
   */
  minimumConfidence?: number;
  /**
   * Explicit local filesystem directory where model files are stored.
   */
  modelDirectory?: string;
}
