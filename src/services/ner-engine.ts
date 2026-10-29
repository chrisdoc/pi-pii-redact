/** Labels emitted by the masker-mini model. */
export type NerLabel =
  | "GIVEN_NAME"
  | "SURNAME"
  | "STREET_NAME"
  | "BUILDING_NUMBER"
  | "CITY"
  | "ZIP_CODE"
  | "EMAIL"
  | "PHONE"
  | "CREDIT_CARD"
  | "GOVERNMENT_ID"
  | "DATE"
  | "AGE";

/** One detection returned by an NER backend. Offsets index into the input text. */
export interface NerItem {
  label: string;
  original: string;
  start: number;
  end: number;
  confidence: number;
}

/**
 * The minimal engine surface RedactorService consumes (implemented by `MaskerMini`;
 * tests inject fakes).
 */
export interface NerEngine {
  redaction(
    text: string,
    options?: { labels?: Iterable<string>; minimumConfidence?: number }
  ): Promise<{ items: NerItem[] }>;
  dispose(): void;
}
