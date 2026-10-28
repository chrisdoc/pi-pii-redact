import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RedactorService } from "../services/redactor.js";
import { PiiVault, type VaultPayload } from "../services/vault.js";

export const VAULT_ENTRY = "pii-vault";
export const CONFIG_ENTRY = "pii-config";

/** Persisted /pii settings. */
export interface PiiConfigEntry {
  enabled: boolean;
  /** Ids of rules that are disabled (snapshot of the full rule set). */
  disabledRules?: string[];
}

interface CustomEntryLike {
  type?: string;
  customType?: string;
  data?: unknown;
}

/** Appends newly minted vault entries to the session, if there are any. */
export function persistVaultDelta(pi: ExtensionAPI, redactor: RedactorService): void {
  const delta = redactor.getVault().takePendingDelta();
  if (delta) pi.appendEntry(VAULT_ENTRY, delta);
}

/** Appends the current /pii settings to the session. */
export function persistConfig(pi: ExtensionAPI, redactor: RedactorService): void {
  const data: PiiConfigEntry = {
    enabled: redactor.isEnabled(),
    disabledRules: redactor.getRules().filter((r) => !r.enabled).map((r) => r.id),
  };
  pi.appendEntry(CONFIG_ENTRY, data);
}

/** Rebuilds the vault from ALL pii-vault entries (every branch, so numbers are never reused). */
export function loadVault(entries: readonly CustomEntryLike[], redactor: RedactorService): void {
  const payloads = entries
    .filter((e) => e?.type === "custom" && e.customType === VAULT_ENTRY)
    .map((e) => e.data as VaultPayload);
  redactor.setVault(PiiVault.fromPayloads(payloads));
}

/** Applies the most recent pii-config entry, if any. */
export function loadConfig(entries: readonly CustomEntryLike[], redactor: RedactorService): void {
  const configs = entries.filter((e) => e?.type === "custom" && e.customType === CONFIG_ENTRY);
  const latest = configs[configs.length - 1]?.data as PiiConfigEntry | undefined;
  if (!latest || typeof latest.enabled !== "boolean") return;
  redactor.setEnabled(latest.enabled);
  if (Array.isArray(latest.disabledRules)) {
    const disabled = new Set(latest.disabledRules);
    for (const rule of redactor.getRules()) {
      redactor.toggleRule(rule.id, !disabled.has(rule.id));
    }
  }
}
