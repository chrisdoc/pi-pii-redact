import fs from "node:fs";
import { passesSecretGate } from "./gate.js";
import { lineStartOffsets, locateSecret } from "./offsets.js";
import { isPlausibleSecret, isPrivateKeyRule, selectSpans, widenToToken } from "./select.js";
import type { RawFinding, SecretScannerStatus, SecretSpan } from "./types.js";

export type { SecretSpan, SecretConfidence, SecretScannerStatus } from "./types.js";
export { passesSecretGate } from "./gate.js";

type ScanString = (content: string, file: string, options?: unknown) => Promise<RawFinding[]>;

let status: SecretScannerStatus = "unloaded";
let loadError: string | undefined;
let loading: Promise<ScanString | null> | null = null;

interface Ruleset {
  rules?: Array<{ id?: string; source?: string }>;
  [key: string]: unknown;
}

/**
 * gitleaks rules we keep on top of the kingfisher set. The full bundled set compiles to ~660 MB
 * and takes ~4 s on first scan, almost all of it from the 222 gitleaks rules, while kingfisher
 * has its own rule for most providers. Without them the scanner needs ~170 MB and ~0.8 s; these
 * few close the gaps kingfisher has (GitHub tokens, Hugging Face, npm).
 */
export const EXTRA_GITLEAKS_RULES: ReadonlySet<string> = new Set([
  "github-pat",
  "github-fine-grained-pat",
  "github-oauth",
  "github-app-token",
  "github-refresh-token",
  "huggingface-access-token",
  "huggingface-organization-api-token",
  "npm-access-token",
]);

/** The bundled ruleset without the gitleaks rules (except EXTRA_GITLEAKS_RULES). */
export function trimRuleset(full: Ruleset): Ruleset {
  const rules = (full.rules ?? []).filter((r) => r.source !== "gitleaks" || EXTRA_GITLEAKS_RULES.has(r.id ?? ""));
  return { ...full, rules };
}

function scanOptions(inline: Ruleset) {
  return {
    // NEVER enable validation: it sends the detected secret to provider APIs or connects to
    // databases, i.e. it would send secrets off this machine.
    config: { validate: false, validateAllowedHosts: [], extendBundled: false, inline },
    verbose: false,
  };
}

let options: ReturnType<typeof scanOptions> | null = null;

/** Loads the native scanner once. Any failure marks it unavailable; it never throws. */
function loadScanner(): Promise<ScanString | null> {
  if (!loading) {
    loading = (async () => {
      try {
        const mod = await import("@visulima/secret-scanner");
        if (typeof mod.scanString !== "function") throw new Error("scanString export missing");
        const scan = mod.scanString as unknown as ScanString;
        const full = JSON.parse(fs.readFileSync(String(mod.bundledConfigPath), "utf8")) as Ruleset;
        options = scanOptions(trimRuleset(full));
        // The first scan compiles the ruleset (~0.8 s); pay it here, once, so callers awaiting
        // the load share it instead of each hitting the cold start.
        await scan("warm up", "input.txt", options);
        status = "ready";
        return scan;
      } catch (error) {
        status = "unavailable";
        loadError = error instanceof Error ? error.message : String(error);
        return null;
      }
    })();
  }
  return loading;
}

export function getSecretScannerStatus(): SecretScannerStatus {
  return status;
}

/** Message of the error that made the scanner unavailable, if any. */
export function getSecretScannerError(): string | undefined {
  return loadError;
}

/** Forgets the load state (tests only). */
export function resetSecretScanner(): void {
  status = "unloaded";
  loadError = undefined;
  loading = null;
}

/**
 * Starts loading and warming the scanner in the background (e.g. at session start), so the
 * first text that needs scanning does not wait for the cold start. Never throws.
 */
export function warmUpSecretScanner(): void {
  void loadScanner();
}

/**
 * Finds secrets (API keys, tokens, private keys, credentials in URLs) in `text`.
 * Never throws and never writes to stdout/stderr: if the scanner cannot load or fails, [] is returned.
 */
export async function scanSecrets(text: string): Promise<SecretSpan[]> {
  if (!text || !passesSecretGate(text)) return [];
  const scan = await loadScanner();
  if (!scan) return [];

  let findings: RawFinding[];
  try {
    findings = await scan(text, "input.txt", options!);
  } catch {
    return [];
  }

  const lineStarts = lineStartOffsets(text);
  const candidates: SecretSpan[] = [];
  for (const finding of findings) {
    if (!isPlausibleSecret(finding)) continue;
    const at = locateSecret(text, lineStarts, finding);
    if (!at) continue;
    candidates.push(
      widenToToken(text, { ...at, ruleId: finding.ruleId, confidence: finding.confidence }, isPrivateKeyRule(finding))
    );
  }
  return selectSpans(candidates);
}
