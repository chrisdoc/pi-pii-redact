import type { RedactLabel, RedactionItem, Redaction } from "@desert-ant-labs/redact/native";

export type { RedactLabel, RedactionItem, Redaction };

/**
 * Supported PII categories, encompassing all 22 native labels from
 * @desert-ant-labs/redact/native (DEFAULT_LABELS and ALL_LABELS), as well
 * as legacy and extension-specific categories.
 */
export type PiiCategory =
  | RedactLabel
  | "email"
  | "phone"
  | "ip"
  | "credit-card"
  | "api-key"
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
  enabled: boolean;
  description?: string;
  builtin?: boolean;
  nativeLabel?: RedactLabel;
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
   * Restoration helper from native Redaction.
   * Restores redacted placeholders in processed text back to original values.
   */
  restore?: (processed: string) => string;
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
   * Minimum neural confidence threshold (0.0 to 1.0). Default is 0.6.
   */
  minimumConfidence?: number;
  /**
   * Explicit local filesystem directory where model files are stored.
   */
  modelDirectory?: string;
}
