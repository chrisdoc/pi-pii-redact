import type { LoadOptions, Redact, RedactLabel } from "@desert-ant-labs/redact/native";
import { Redact as NativeRedact } from "@desert-ant-labs/redact/native";
import type { PiiCategory, PiiRule, RedactionDetail, RedactionResult, RedactorConfig } from "../types.js";
import { defaultRules, findRuleByIdOrLabel, RULE_ID_TO_LABEL } from "../rules/default-rules.js";

/** Configuration options for RedactorService initialization. */
export interface RedactorServiceOptions {
  /** Optional options passed to Redact.load(...) (e.g. offline directory or cacheRoot). */
  loadOptions?: LoadOptions;
  /** Optional pre-instantiated or mock Redact engine (useful for unit testing). */
  redactInstance?: Redact;
}

/** Escapes special regular expression characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Constructs a safe regex matching discrete word occurrences of an entity,
 * respecting Unicode word boundaries to prevent substring mutilation of regular words
 * (e.g. preventing 'Dan' from matching inside 'Danger' or 'Rob' inside 'problem').
 */
function createEntityWordBoundaryRegex(original: string): RegExp {
  const escaped = escapeRegex(original);
  const leading = /^\w/.test(original)
    ? "\\b"
    : /^[\p{L}\p{N}_]/u.test(original)
      ? "(?<![\\p{L}\\p{N}_])"
      : "(?<!\\S)";
  const trailing = /\w$/.test(original)
    ? "\\b"
    : /[\p{L}\p{N}_]$/u.test(original)
      ? "(?![\\p{L}\\p{N}_])"
      : "(?!\\S)";
  const flags =
    /[\p{L}\p{N}]/u.test(original) && !/^[\x00-\x7F]+$/.test(original)
      ? "gu"
      : "g";
  return new RegExp(`${leading}${escaped}${trailing}`, flags);
}

/**
 * Open-vocabulary linguistic labels susceptible to false-positive classification on common English words.
 * Calibrated with a higher confidence threshold (default 0.85) to eliminate non-PII false positives.
 */
const OPEN_VOCABULARY_LABELS = new Set<string>([
  "GIVEN_NAME",
  "SURNAME",
  "STREET_NAME",
  "CITY",
  "STATE",
  "BUILDING_NUMBER",
  "SECONDARY_ADDRESS",
  "ORG",
]);

export class RedactorService {
  private rules: Map<string, PiiRule>;
  private config: RedactorConfig;
  private loadOptions?: LoadOptions;
  private instance: Redact | null = null;
  private initPromise: Promise<Redact> | null = null;
  private lastRestoreHelper?: (processed: string) => string;
  private lastRestoreMap: Map<string, string> = new Map();

  constructor(
    customRules: PiiRule[] = [],
    initialConfig?: Partial<RedactorConfig>,
    options?: RedactorServiceOptions | LoadOptions
  ) {
    this.rules = new Map();
    for (const rule of [...defaultRules, ...customRules]) {
      this.rules.set(rule.id, { ...rule });
    }

    this.config = {
      enabled: true,
      maskUserInputs: true,
      maskToolResults: true,
      maskContextMessages: true,
      notifyOnRedact: true,
      minimumConfidence: 0.85,
      ...initialConfig,
    };

    if (options) {
      if ("redactInstance" in options || "loadOptions" in options) {
        const svcOpts = options as RedactorServiceOptions;
        this.loadOptions = svcOpts.loadOptions;
        if (svcOpts.redactInstance) {
          this.instance = svcOpts.redactInstance;
        }
      } else {
        this.loadOptions = options as LoadOptions;
      }
    }
  }

  /** Returns whether redaction is globally enabled. */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Globally enable or disable redaction. */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /** Returns read-only view of redactor configuration. */
  public getConfig(): Readonly<RedactorConfig> {
    return this.config;
  }

  /** Returns all registered rules (both native model labels and overlay rules). */
  public getRules(): PiiRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Toggles an individual rule by id (case, format, and alias insensitive).
   * Returns the new enabled state, or false if the rule was not found.
   */
  public toggleRule(ruleId: string, enabled?: boolean): boolean {
    const rule =
      this.rules.get(ruleId) ??
      findRuleByIdOrLabel(this.rules.values(), ruleId);

    if (!rule) return false;
    rule.enabled = enabled ?? !rule.enabled;
    return rule.enabled;
  }

  /**
   * Returns the initialized native Redact instance, loading it on demand if necessary.
   * Concurrent calls await the same initialization promise.
   */
  public async getRedactInstance(): Promise<Redact> {
    if (this.instance) {
      return this.instance;
    }
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const loadOpts = {
            ...this.loadOptions,
            ...(this.config.modelDirectory && !this.loadOptions?.directory
              ? { directory: this.config.modelDirectory }
              : {}),
          };
          const inst = await NativeRedact.load(
            Object.keys(loadOpts).length > 0 ? loadOpts : undefined
          );
          this.instance = inst;
          return inst;
        } catch (error) {
          this.initPromise = null;
          throw error;
        }
      })();
    }
    return this.initPromise;
  }

  /** Eagerly initializes the native model. */
  public async init(): Promise<void> {
    await this.getRedactInstance();
  }

  /** Releases native engine resources. Safe to call multiple times. */
  public dispose(): void {
    if (this.instance) {
      this.instance.dispose();
      this.instance = null;
    }
    this.initPromise = null;
    this.lastRestoreHelper = undefined;
    this.lastRestoreMap.clear();
  }

  /**
   * Restores placeholders in text (e.g. an LLM response) back to their original sensitive values
   * using mappings from the most recent redaction. Handles both native redact-node placeholders
   * and secret overlay placeholders.
   */
  public restore(processed: string): string {
    if (!processed || typeof processed !== "string") {
      return processed ?? "";
    }
    let restored = processed;
    if (this.lastRestoreHelper) {
      restored = this.lastRestoreHelper(restored);
    }
    for (const [placeholder, original] of this.lastRestoreMap) {
      if (restored.includes(placeholder)) {
        restored = restored.replaceAll(placeholder, () => original);
      }
    }
    return restored;
  }

  /**
   * Asynchronously redacts sensitive data (PII and API secrets) from the input text.
   */
  public async redact(text: string): Promise<RedactionResult> {
    if (!this.config.enabled || !text || typeof text !== "string") {
      return {
        text: text ?? "",
        hasRedactions: false,
        count: 0,
        redactions: [],
        restore: (p: string) => p ?? "",
      };
    }

    let currentText = text;
    const allRedactions: RedactionDetail[] = [];

    // 1. Partition active rules into regex overlay rules vs native model labels
    const activeRegexRules: PiiRule[] = [];
    const activeNativeLabels: RedactLabel[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      if (rule.pattern) {
        activeRegexRules.push(rule);
      } else {
        const label =
          rule.nativeLabel ??
          RULE_ID_TO_LABEL[rule.id] ??
          (rule.id.toUpperCase().replace(/-/g, "_") as RedactLabel);
        if (label) {
          activeNativeLabels.push(label);
        }
      }
    }

    // 2. Phase 1: Apply regex overlay rules (API keys, IP addresses, custom secrets)
    const labelCounters: Record<string, number> = {};

    for (const rule of activeRegexRules) {
      const flags = rule.pattern!.flags.includes("g")
        ? rule.pattern!.flags
        : `${rule.pattern!.flags}g`;
      const regex = new RegExp(rule.pattern!.source, flags);

      currentText = currentText.replace(regex, (match) => {
        let masked: string;
        if (rule.mask) {
          masked = rule.mask(match);
        } else {
          const labelPrefix =
            rule.nativeLabel ??
            (rule.category === "api-key"
              ? "API_KEY"
              : rule.category.toUpperCase().replace(/[-\s]/g, "_"));
          labelCounters[labelPrefix] = (labelCounters[labelPrefix] || 0) + 1;
          masked = `[${labelPrefix}_${labelCounters[labelPrefix]}]`;
        }

        allRedactions.push({
          category: rule.category,
          ruleId: rule.id,
          original: match,
          masked,
          placeholder: masked,
        });
        return masked;
      });
    }

    // 3. Phase 2: Apply native ML inference if any native labels are active
    // CRITICAL: If activeNativeLabels is empty, do NOT pass { labels: [] }, as
    // @desert-ant-labs/redact treats an empty array as ALL labels enabled.
    let nativeRestoreHelper: ((processed: string) => string) | undefined;

    if (activeNativeLabels.length > 0) {
      const redactInstance = await this.getRedactInstance();
      const openLabels = activeNativeLabels.filter((l) => OPEN_VOCABULARY_LABELS.has(l));
      const structLabels = activeNativeLabels.filter((l) => !OPEN_VOCABULARY_LABELS.has(l));

      const nativePasses: Array<{
        labels: RedactLabel[];
        confidence: number;
      }> = [];

      // Only run structured pass if text contains digit patterns that could form numbers
      const hasDigitSequences = /\d{2,}/.test(currentText.replace(/\[[A-Z0-9_]+\]/g, ""));
      if (structLabels.length > 0 && hasDigitSequences) {
        nativePasses.push({
          labels: structLabels,
          confidence: Math.min(this.config.minimumConfidence ?? 0.85, 0.60),
        });
      }
      if (openLabels.length > 0) {
        nativePasses.push({
          labels: openLabels,
          confidence: this.config.minimumConfidence ?? 0.85,
        });
      }

      for (const pass of nativePasses) {
        const passResult = await redactInstance.redaction(currentText, {
          labels: pass.labels,
          minimumConfidence: pass.confidence,
        });
        currentText = passResult.redactedText;
        const prevHelper = nativeRestoreHelper;
        nativeRestoreHelper = prevHelper
          ? (p: string) => prevHelper(passResult.restore(p))
          : (p: string) => passResult.restore(p);

        // Pre-seed labelCounters with existing native placeholders to avoid number reuse
        for (const item of passResult.items) {
          const matchNum = item.placeholder.match(/_(\d+)\]$/);
          if (matchNum) {
            labelCounters[item.label] = Math.max(
              labelCounters[item.label] || 0,
              parseInt(matchNum[1], 10)
            );
          }
        }

        for (const item of passResult.items) {
          const matchingRule = this.findRuleForNativeLabel(item.label);
          allRedactions.push({
            category: matchingRule?.category ?? this.mapNativeLabelToCategory(item.label),
            ruleId: matchingRule?.id ?? item.label.toLowerCase(),
            original: item.original,
            masked: item.placeholder,
            placeholder: item.placeholder,
            confidence: item.confidence,
            start: item.start,
            end: item.end,
          });

          // Ensure repeated discrete occurrences of this detected PII entity are sanitized safely
          if (item.original && item.original.trim().length > 1) {
            const regex = createEntityWordBoundaryRegex(item.original);
            currentText = currentText.replace(regex, () => {
              labelCounters[item.label] = (labelCounters[item.label] || 0) + 1;
              const placeholder = `[${item.label}_${labelCounters[item.label]}]`;
              allRedactions.push({
                category: matchingRule?.category ?? this.mapNativeLabelToCategory(item.label),
                ruleId: matchingRule?.id ?? item.label.toLowerCase(),
                original: item.original,
                masked: placeholder,
                placeholder,
                confidence: item.confidence,
              });
              return placeholder;
            });
          }
        }
      }
    }

    // Build composite restoration map for this specific redaction result
    const currentRestoreMap = new Map<string, string>();
    for (const r of allRedactions) {
      if (r.masked && r.original) {
        currentRestoreMap.set(r.masked, r.original);
      }
      if (r.placeholder && r.original) {
        currentRestoreMap.set(r.placeholder, r.original);
      }
    }

    // For backwards compatibility when exactly one API key was redacted,
    // also map [REDACTED:API_KEY] to support legacy tests and LLM completions.
    if (labelCounters["API_KEY"] === 1) {
      const singleApiKey = allRedactions.find(
        (r) => r.category === "api-key" || r.ruleId === "api-key-generic"
      )?.original;
      if (singleApiKey) {
        currentRestoreMap.set("[REDACTED:API_KEY]", singleApiKey);
      }
    }

    const restoreFn = (processed: string): string => {
      if (!processed || typeof processed !== "string") {
        return processed ?? "";
      }
      let restored = processed;
      // 1. Restore native engine placeholders via redact-node restore helper
      if (nativeRestoreHelper) {
        restored = nativeRestoreHelper(restored);
      }
      // 2. Restore overlay, repeated, and custom placeholders
      for (const [placeholder, original] of currentRestoreMap) {
        if (restored.includes(placeholder)) {
          restored = restored.replaceAll(placeholder, () => original);
        }
      }
      return restored;
    };

    // Merge into service-level restore state to preserve mappings across rapid concurrent turns
    if (nativeRestoreHelper) {
      const prevHelper = this.lastRestoreHelper;
      this.lastRestoreHelper = prevHelper
        ? (p: string) => nativeRestoreHelper!(prevHelper(p))
        : nativeRestoreHelper;
    }
    for (const [ph, orig] of currentRestoreMap) {
      this.lastRestoreMap.set(ph, orig);
    }

    return {
      text: currentText,
      hasRedactions: allRedactions.length > 0,
      count: allRedactions.length,
      redactions: allRedactions,
      restore: restoreFn,
    };
  }

  private findRuleForNativeLabel(label: string): PiiRule | undefined {
    return findRuleByIdOrLabel(this.rules.values(), label);
  }

  private mapNativeLabelToCategory(label: string): PiiCategory {
    const upper = label.toUpperCase();
    switch (upper) {
      case "EMAIL":
        return "email";
      case "PHONE":
        return "phone";
      case "IP_ADDRESS":
        return "ip";
      case "CREDIT_CARD":
        return "credit-card";
      default:
        return upper as PiiCategory;
    }
  }
}
