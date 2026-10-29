import type { PiiCategory, PiiRule, RedactionDetail, RedactionResult, RedactorConfig } from "../types.js";
import type { NerEngine } from "./ner-engine.js";
import { PiiVault, type VaultEntry } from "./vault.js";
import { MaskerMini, type MaskerLoadOptions } from "./masker-mini/index.js";
import { defaultRules, findRuleByIdOrLabel, RULE_ID_TO_LABEL } from "../rules/default-rules.js";

/** Configuration options for RedactorService initialization. */
export interface RedactorServiceOptions {
  /** Optional options passed to MaskerMini.load(...) (offline directory or cacheRoot). */
  loadOptions?: MaskerLoadOptions;
  /** Optional pre-instantiated or mock NER engine (useful for unit testing). */
  redactInstance?: NerEngine;
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

/** Maximum number of cached redaction results (LRU). */
const RESULT_CACHE_LIMIT = 500;

interface CachedResult {
  text: string;
  redactions: RedactionDetail[];
}

export class RedactorService {
  private rules: Map<string, PiiRule>;
  private config: RedactorConfig;
  private loadOptions?: MaskerLoadOptions;
  private instance: NerEngine | null = null;
  private initPromise: Promise<NerEngine> | null = null;
  private vault: PiiVault = new PiiVault();
  private cache: Map<string, CachedResult> = new Map();
  private cacheSig = "";

  constructor(
    customRules: PiiRule[] = [],
    initialConfig?: Partial<RedactorConfig>,
    options?: RedactorServiceOptions | MaskerLoadOptions
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
      minimumConfidence: 0.55,
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
        this.loadOptions = options as MaskerLoadOptions;
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
    this.cache.clear();
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
    this.cache.clear();
    return rule.enabled;
  }

  /**
   * Returns the initialized NER engine, loading it on demand if necessary.
   * Concurrent calls await the same initialization promise.
   */
  public async getRedactInstance(): Promise<NerEngine> {
    if (this.instance) {
      return this.instance;
    }
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const loadOpts: MaskerLoadOptions = { ...this.loadOptions };
          if (this.config.modelDirectory && !loadOpts.directory) {
            loadOpts.directory = this.config.modelDirectory;
          }
          const loaded = await MaskerMini.load(loadOpts);
          try {
            await loaded.redaction("warm up", { labels: ["GIVEN_NAME"] });
          } catch (error) {
            loaded.dispose();
            throw error;
          }
          this.instance = loaded;
          return loaded;
        } catch (error) {
          this.initPromise = null;
          throw error;
        }
      })();
    }
    return this.initPromise;
  }

  /** Eagerly initializes the model. */
  public async init(): Promise<void> {
    await this.getRedactInstance();
  }

  /** Releases model resources. Safe to call multiple times. */
  public dispose(): void {
    if (this.instance) {
      this.instance.dispose();
      this.instance = null;
    }
    this.initPromise = null;
    // The vault is intentionally kept: the session still needs it for restore.
    this.cache.clear();
  }

  /** Returns the session vault that owns all token <-> original mappings. */
  public getVault(): PiiVault {
    return this.vault;
  }

  /** Replaces the session vault (e.g. one rebuilt from persisted session entries). */
  public setVault(vault: PiiVault): void {
    this.vault = vault;
    this.cache.clear();
  }

  /**
   * Restores vault tokens in text (e.g. an LLM response) back to their original sensitive values.
   * Tolerant of dropped brackets, case changes, and inner whitespace.
   */
  public restore(processed: string, onHit?: (entry: VaultEntry) => void): string {
    return this.vault.restore(processed, onHit);
  }

  /**
   * Replaces regex matches in `text` while never touching matches that overlap a vault token.
   * `fn` returns the replacement, or null to keep the match unchanged.
   */
  private replaceOutsideTokens(
    text: string,
    regex: RegExp,
    fn: (match: string, start: number, end: number) => string | null
  ): string {
    const spans = this.vault.findTokens(text);
    let out = "";
    let last = 0;
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      if (spans.some((s) => start < s.end && end > s.start)) {
        regex.lastIndex = start + 1;
        continue;
      }
      const rep = fn(m[0], start, end);
      if (rep === null) continue;
      out += text.slice(last, start) + rep;
      last = end;
    }
    return out + text.slice(last);
  }

  private cacheSignature(): string {
    return `${this.config.minimumConfidence ?? ""}|${this.config.modelDirectory ?? ""}`;
  }

  private cacheGet(text: string): CachedResult | undefined {
    if (this.cacheSig !== this.cacheSignature()) {
      this.cache.clear();
      return undefined;
    }
    const hit = this.cache.get(text);
    if (hit) {
      this.cache.delete(text);
      this.cache.set(text, hit); // refresh LRU position
    }
    return hit;
  }

  private cacheSet(text: string, value: CachedResult): void {
    this.cacheSig = this.cacheSignature();
    this.cache.set(text, value);
    if (this.cache.size > RESULT_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  private buildResult(text: string, redactions: RedactionDetail[]): RedactionResult {
    return {
      text,
      hasRedactions: redactions.length > 0,
      count: redactions.length,
      redactions,
      restore: (p: string) => this.vault.restore(p),
    };
  }

  /**
   * Asynchronously redacts sensitive data (PII and API secrets) from the input text.
   * Originals are mapped to stable session-wide vault tokens, so the same value always
   * receives the same token across calls.
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

    const vault = this.vault;
    let currentText = text;
    const allRedactions: RedactionDetail[] = [];

    // 1. Partition active rules into regex overlay rules vs native model labels
    const activeRegexRules: PiiRule[] = [];
    const activeNativeLabels: string[] = [];
    const enabledVaultLabels = new Set<string>();

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      if (rule.pattern) {
        activeRegexRules.push(rule);
        if (!rule.mask) enabledVaultLabels.add(this.overlayLabel(rule));
      } else {
        const label =
          rule.nativeLabel ??
          RULE_ID_TO_LABEL[rule.id] ??
          (rule.id.toUpperCase().replace(/-/g, "_"));
        if (label) {
          activeNativeLabels.push(label);
          enabledVaultLabels.add(label);
        }
      }
    }

    // Cache hit: the cached text may predate originals the vault learned since, so re-apply
    // the (model-free) fast path before returning it.
    const cached = this.cacheGet(text);
    if (cached) {
      const redactions = cached.redactions.map((r) => ({ ...r }));
      const before = redactions.length;
      const refreshed = this.applyKnownOriginals(cached.text, enabledVaultLabels, redactions);
      if (redactions.length > before) {
        this.cacheSet(text, { text: refreshed, redactions: redactions.map((r) => ({ ...r })) });
      }
      return this.buildResult(refreshed, redactions);
    }

    // 2. Fast path: replace already-known originals with their tokens (longest first)
    currentText = this.applyKnownOriginals(currentText, enabledVaultLabels, allRedactions);

    // 3. Overlay regex rules (API keys, IP addresses, emails, custom secrets)
    for (const rule of activeRegexRules) {
      const flags = rule.pattern!.flags.includes("g")
        ? rule.pattern!.flags
        : `${rule.pattern!.flags}g`;
      const regex = new RegExp(rule.pattern!.source, flags);

      const source = currentText;
      currentText = this.replaceOutsideTokens(currentText, regex, (match, start, end) => {
        if (rule.validate && !rule.validate(match, { text: source, start, end })) return null;
        // Rules with a custom mask are one-way and never enter the vault.
        const masked = rule.mask
          ? rule.mask(match)
          : vault.tokenFor(this.overlayLabel(rule), match);
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

    // 4. Model inference for all active model labels in one call.
    // CRITICAL: if activeNativeLabels is empty, do not call the model at all (and never pass
    // an empty label list to an engine, which could be read as "all labels").
    if (activeNativeLabels.length > 0) {
      const redactInstance = await this.getRedactInstance();
      const source = currentText;
      const protectedSpans = vault.findTokens(source);
      const result = await redactInstance.redaction(source, {
        labels: activeNativeLabels,
        minimumConfidence: this.config.minimumConfidence ?? 0.55,
      });

      // Rebuild the text from item offsets so items overlapping existing tokens are dropped.
      let rebuilt = "";
      let cursor = 0;
      const accepted: Array<{ original: string; token: string }> = [];
      const items = [...result.items].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
      for (const item of items) {
        if (!item.original) continue;
        let start = item.start;
        let end = item.end;
        if (
          typeof start !== "number" ||
          typeof end !== "number" ||
          source.slice(start, end) !== item.original
        ) {
          start = source.indexOf(item.original, cursor);
          end = start + item.original.length;
        }
        if (start < cursor) continue; // overlaps a previous item or is unlocatable
        if (protectedSpans.some((s) => start < s.end && end > s.start)) continue;

        const token = vault.tokenFor(item.label, item.original);
        const matchingRule = this.findRuleForNativeLabel(item.label);
        rebuilt += source.slice(cursor, start) + token;
        cursor = end;
        accepted.push({ original: item.original, token });
        allRedactions.push({
          category: matchingRule?.category ?? this.mapNativeLabelToCategory(item.label),
          ruleId: matchingRule?.id ?? item.label.toLowerCase(),
          original: item.original,
          masked: token,
          placeholder: token,
          confidence: item.confidence,
          start,
          end,
        });
      }
      currentText = rebuilt + source.slice(cursor);

      // Sanitize repeated discrete occurrences of detected entities with the same token
      // (no extra RedactionDetail entries: each occurrence is reported once at detection).
      for (const { original, token } of accepted) {
        if (original.trim().length <= 1) continue;
        currentText = this.replaceOutsideTokens(
          currentText,
          createEntityWordBoundaryRegex(original),
          () => token
        );
      }
    }

    this.cacheSet(text, {
      text: currentText,
      redactions: allRedactions.map((r) => ({ ...r })),
    });
    return this.buildResult(currentText, allRedactions);
  }

  /** Replaces already-known vault originals (for enabled labels) with their tokens, longest first. */
  private applyKnownOriginals(
    text: string,
    enabledVaultLabels: ReadonlySet<string>,
    redactions: RedactionDetail[]
  ): string {
    let currentText = text;
    for (const entry of this.vault.knownOriginals()) {
      if (!enabledVaultLabels.has(entry.label)) continue;
      if (entry.original.trim().length <= 1 || !currentText.includes(entry.original)) continue;
      const rule = this.findRuleForNativeLabel(entry.label);
      currentText = this.replaceOutsideTokens(
        currentText,
        createEntityWordBoundaryRegex(entry.original),
        () => {
          redactions.push({
            category: rule?.category ?? this.mapNativeLabelToCategory(entry.label),
            ruleId: rule?.id ?? entry.label.toLowerCase(),
            original: entry.original,
            masked: entry.token,
            placeholder: entry.token,
          });
          return entry.token;
        }
      );
    }
    return currentText;
  }

  private overlayLabel(rule: PiiRule): string {
    return (
      rule.nativeLabel ??
      (rule.category === "api-key"
        ? "API_KEY"
        : rule.category.toUpperCase().replace(/[-\s]/g, "_"))
    );
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
