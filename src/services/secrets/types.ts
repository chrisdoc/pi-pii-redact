export type SecretConfidence = "low" | "medium" | "high";

/** A detected secret: UTF-16 offsets into the scanned text (end exclusive). */
export interface SecretSpan {
  start: number;
  end: number;
  ruleId: string;
  confidence: SecretConfidence;
}

/** The subset of a scanner finding this module relies on. */
export interface RawFinding {
  ruleId: string;
  confidence: SecretConfidence;
  secret: string;
  match?: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  tags?: string[];
}

export type SecretScannerStatus = "unloaded" | "ready" | "unavailable";
