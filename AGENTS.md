# AGENTS.md

This file provides guidance to coding agents working with code in this repository.

## What this is

A [Pi](https://github.com/earendil-works/pi) extension (published as `@chrisdoc/pi-pii-redact`) that replaces PII and secrets with stable per-session tokens like `[EMAIL_3#k7q2]` before anything reaches the LLM, and restores real values in tool-call arguments and assistant replies. Detection runs locally: the masker-mini NER model (ONNX Runtime) plus deterministic, validator-backed regex overlay rules.

The package ships TypeScript source directly (`main` and `pi.extensions` point at `src/index.ts`); there is no build step.

## Commands

```bash
npm install
npm run typecheck                         # tsc --noEmit (covers src/ only)
npm test                                  # vitest run, all suites
npx vitest run tests/vault.test.ts        # one file
npx vitest run tests/e2e                  # e2e tiers only
npx vitest run -t "restores tokens"       # tests matching a name
pi -e .                                   # load the working copy into Pi
```

Most tests run the real on-device model on CPU. `tests/setup-shared-model.ts` loads it once per test file and shares it across services (`dispose()` is a no-op there), so tests that assert model-disposal behavior see the shared instance. On first run it downloads the pinned model (~22 MB) into `~/.cache/pi-pii-redact` (or set `PI_PII_REDACT_MODEL_DIR` to use a local copy). `vitest.config.ts` sets a 30 s timeout and `fileParallelism: false` on purpose, because parallel files each load a model and oversubscribe the CPU. Don't change those to speed things up.

CI (`.github/workflows/ci.yml`) runs typecheck and tests on Node 22 and 24.

## Architecture

`src/index.ts` creates one `RedactorService` and one `PiiStats` and passes both to `registerHooks` (`src/hooks/index.ts`) and `registerPiiCommands` (`src/commands/pii.ts`).

**`RedactorService` (`src/services/redactor.ts`)** owns the rules, the config, the lazily loaded masker-mini model, an LRU result cache and the session vault. `redact()` runs in this order:
1. Splits enabled rules into regex overlay rules (those with a `pattern`), the secret-scanner rule (`detector: "secret-scanner"`, never sent to the model) and model labels.
2. Fast path: replaces originals already in the vault with their tokens.
3. Secrets: `scanSecrets` (`src/services/secrets/`) replaces keys/tokens/private keys with `[SECRET_n#...]` tokens, before the overlays so a key wins over phone/IBAN/email rules.
4. Applies the regex overlays. `replaceOutsideTokens` never touches text overlapping an existing vault token.
5. Runs ONE model call for all active model labels, filtered by `minimumConfidence` (default 0.55). No call is made when no model label is active.

**Secret scanner (`src/services/secrets/`)** wraps `@visulima/secret-scanner` (native, loaded lazily with dynamic import; a load failure only marks it `unavailable`, see `getSecretScannerStatus()`). Never enable its `validate` option (it would send secrets to provider APIs) and never write to stdout/stderr from it (Pi's TUI). Only the kingfisher rules plus `EXTRA_GITLEAKS_RULES` are compiled (the full bundled set costs ~660 MB and ~4 s cold start); the first scan is paid once during load and warmed at `session_start`. A regex pre-gate skips the ~25 ms per-call cost for text that cannot hold a secret. Spans that cover only part of a key-like token are widened to the whole token. Findings are mapped to offsets by searching for `finding.secret` near the reported line/column, then filtered (min length 8, no whitespace except private keys); overlaps resolve by confidence, then narrowest. Tests must generate realistic provider keys at runtime (`tests/secrets/fake-keys.ts`) because GitHub push protection rejects committed ones.

Anything that changes rules, the enabled state or the vault must clear the cache, as the existing setters do.

**`PiiVault` (`src/services/vault.ts`)** is the two-way map between originals and tokens. The same original always gets the same token. Per-label counters only increase. A random per-vault nonce means text that merely looks like a token is never restored. Restore tolerates mangled tokens (lower case, missing brackets, extra spaces). Rules with a custom `mask` are one-way and never enter the vault.

**Rules (`src/rules/default-rules.ts`)**: `MODEL_RULE_DEFINITIONS` holds the model-backed rules (given-name, surname, street-name, building-number, city, zip-code, government-id, age, and `date`, which is disabled by default) and the deterministic overlays with `validate` functions from `src/rules/validators.ts` (email, bank-account/IBAN, imei, credit-card, ssn, routing-number, ip-address, phone). `DETERMINISTIC_RULES` adds `nl-bsn`; `SECRET_RULES` adds API keys. The model's EMAIL/PHONE/CREDIT_CARD labels are never requested. `passport`, `drivers-license` and `tax-id` are aliases of `government-id`. `toggleRule` accepts ids, labels and aliases.

**Model engine (`src/services/masker-mini/`)**: `MaskerMini` implements the minimal `NerEngine` interface (`src/services/ner-engine.ts`, which also defines `NerLabel`); tests inject fakes through `RedactorServiceOptions.redactInstance`. `model-files.ts` pins the Hugging Face revision and SHA-256 of the int4 files, downloads into `$XDG_CACHE_HOME/pi-pii-redact/masker-mini/<rev>/` (default `~/.cache`), or uses `RedactorConfig.modelDirectory` / `PI_PII_REDACT_MODEL_DIR` (hashes still verified, never downloads). `tokenize.ts` aligns tokens to original offsets, `chunk.ts` windows long texts, `decode.ts` does BIOES decoding, `postprocess.ts` cleans spans (edge punctuation, numeric spans glued into identifiers, partial-word names), `merge.ts` filters and de-duplicates. `onnxruntime-node` and `@huggingface/tokenizers` are loaded with a dynamic import; `ORT_DISABLE_TELEMETRY=1` is set right before it (ORT's Linux telemetry writes under `~/.cache/Microsoft`), and `tests/masker-mini/telemetry.test.ts` checks that in a child process. Source must stay Node strip-only TypeScript compatible (no enums, namespaces or parameter properties). `eval/` holds a labelled corpus and scorer (see `eval/README.md`).

**Hooks (`src/hooks/index.ts`)** handle the Pi events:
- Redaction: `input`, `tool_result` (including `structuredContent`) and `context`. `context` re-redacts the whole history before every provider request.
- Restore: `tool_call` restores arguments in place, and `message_end` restores the assistant reply. Both run even while redaction is off, as long as the vault has entries.
- `session_before_compact` / `session_before_tree`: these call the model directly and bypass `context`, so the extension runs `compact` / `generateBranchSummary` itself on redacted input. **On any failure they return `{ cancel: true }`** and never fall back to plaintext.
- `session_start` rebuilds the vault and config from session entries. `session_shutdown` disposes the model.

**Message walkers (`src/hooks/messages.ts`)** deep-map strings through messages and content blocks. Invariants: never mutate the input, return the *same reference* when nothing changed (hooks use reference equality to decide whether to return a result), and leave assistant `thinking` blocks byte-identical because providers sign them.

**Usage stats (`src/services/stats.ts`, `src/commands/stats-board.ts`)**: `PiiStats` holds in-memory counters for the current run, recorded by the hooks. `context` re-masking is counted separately and never added to totals, because it re-redacts the whole history each turn. `/pii stats` combines them with per-label counts from the vault and renders a board (a scrollable overlay in TUI mode, plain `notify` text otherwise). It shows counts only, never originals or tokens.

**Persistence (`src/hooks/persist.ts`)**: state lives in session custom entries. `pii-vault` entries are append-only deltas from `vault.takePendingDelta()`. Call `persistVaultDelta` after any redaction that may have minted tokens. The vault is rebuilt from *all* entries across branches so numbers are never reused. `pii-config` holds the latest enabled state plus disabled rule ids. Session files therefore contain plaintext originals by design; the extension protects what reaches the model, not what is on disk.

## Tests

- `tests/mock-pi.ts` provides `createMockExtensionAPI` (captures handlers and `appendEntry` as session entries), `createMockContext` and `createMockRedactor` (no model) for unit tests.
- `tests/e2e/harness.ts` provides `PiTestHarness` for opaque-box tests through the public entry points, plus `assertRedacted*` matchers. The tiers cover features, boundaries, combinations, workflows and adversarial cases (`tier1` to `tier5`). The core assertion is that the original value is absent from the output and a placeholder is present.
- `TEST_INFRA.md` / `TEST_READY.md` describe the e2e methodology. They reference `ORIGINAL_REQUEST.md` / `PROJECT.md`, which are not in the repo.

## Releasing

Use Changesets. Any PR that changes behavior needs a changeset (`npx changeset`, committed in `.changeset/`). Merging to `main` opens a "Version Packages" PR, and merging that publishes to npm via OIDC trusted publishing and creates a GitHub release (`.github/workflows/publish.yml`). Don't hand-edit the `version` in `package.json` or `CHANGELOG.md`.
