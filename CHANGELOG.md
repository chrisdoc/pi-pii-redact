# Changelog

## 0.4.0

### Minor Changes

- [#18](https://github.com/chrisdoc/pi-pii-redact/pull/18) [`3b8a1f8`](https://github.com/chrisdoc/pi-pii-redact/commit/3b8a1f8cc9147b83648ba35a77930a09a439a47b) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Replace the `@desert-ant-labs/redact` model with masker-mini, an on-device NER model (about 22 MB, int4) run through ONNX Runtime. This is a breaking change while the package is 0.x.
  
  - Detection is now masker-mini plus deterministic rules. Emails, credit cards (Luhn), IBANs (mod-97), US SSNs, ABA routing numbers, IMEIs, phone numbers, IPv4/IPv6 and Dutch BSNs (new `nl-bsn` rule) are found by checksum- or structure-validated rules that run before the model and no longer depend on it.
  - New `age` rule (on by default) and opt-in `date` rule (off by default, enable with `/pii toggle date`).
  - Removed the `state`, `secondary-address`, `url` and `org` rules, which have no detector any more. `passport`, `drivers-license` and `tax-id` are merged into `government-id`; the old names still work as aliases for toggling. Legacy disabled rule ids in persisted settings are automatically migrated to `government-id`.
  - The default `minimumConfidence` is now 0.55 (was 0.85), calibrated on the bundled evaluation corpus, and the model runs once per text for all active labels.
  - Model spans are cleaned up: edge punctuation is trimmed, numbers glued into larger identifiers (`usr_99812`) are ignored, partially tagged IDs are widened to the whole token (`12345678Z`), and partially tagged names are widened to the whole word.
  - ONNX Runtime telemetry is disabled.
  - The model is downloaded from a pinned Hugging Face revision, SHA-256 verified, and cached in `~/.cache/pi-pii-redact` (previously `~/.cache/desert-ant-models`). Use `PI_PII_REDACT_MODEL_DIR` for offline use.
  - `onnxruntime-node` and `@huggingface/tokenizers` are now regular dependencies; `@desert-ant-labs/redact` and `koffi` are gone.

- [#19](https://github.com/chrisdoc/pi-pii-redact/pull/19) [`a814e81`](https://github.com/chrisdoc/pi-pii-redact/commit/a814e8152d2280a1a96fcec019dc27c8e60fd78d) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add secret and credential detection using `@visulima/secret-scanner`. A new `secrets` rule (on by default, toggle with `/pii toggle secrets`) replaces API keys, tokens, JWTs, private keys and credentials in URLs with `[SECRET_n#xxxx]` tokens that are restored like other tokens. Detection runs offline (credential validation is hard-coded off) behind a regex pre-gate, and falls back to the existing regex rules if the native binding cannot load. `/pii status` shows the scanner state. The minimum supported Node version is now `^22.14.0 || >=24.10.0`.

### Patch Changes

- [#18](https://github.com/chrisdoc/pi-pii-redact/pull/18) [`3b8a1f8`](https://github.com/chrisdoc/pi-pii-redact/commit/3b8a1f8cc9147b83648ba35a77930a09a439a47b) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Merge complete overlap clusters sharing a label before replacing model spans, preserving their full extent and highest confidence. Resolve conflicting labels by rank without widening the winner.

- [#18](https://github.com/chrisdoc/pi-pii-redact/pull/18) [`3b8a1f8`](https://github.com/chrisdoc/pi-pii-redact/commit/3b8a1f8cc9147b83648ba35a77930a09a439a47b) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Ignore malformed persisted disabled-rule entries and disable the merged government-ID rule only when explicitly disabled or all three legacy ID rules were disabled. Merge overlapping model spans with the same label completely, and resolve conflicting labels by confidence without widening the winner.

## 0.3.1

### Patch Changes

- [#15](https://github.com/chrisdoc/pi-pii-redact/pull/15) [`6fc0598`](https://github.com/chrisdoc/pi-pii-redact/commit/6fc05981eb0c36bbcead040269bec2d3dfbda5b7) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Stop LiteRT's native setup logs (`INFO: [gpu_registry.cc...]` and similar) from bleeding into Pi's TUI. The model now loads and warms up with process stderr briefly redirected to `/dev/null`. Set `PI_PII_REDACT_NATIVE_LOGS=1` to keep those logs for debugging.

## 0.3.0

### Minor Changes

- [#12](https://github.com/chrisdoc/pi-pii-redact/pull/12) [`7aa48b6`](https://github.com/chrisdoc/pi-pii-redact/commit/7aa48b64243874bb918b46dc98c0569d4da75cba) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add `/pii stats` usage board showing how much PII was redacted and restored (this run) and how many unique values are protected in the session.

## 0.2.0

### Minor Changes

- Publish to npm as `@chrisdoc/pi-pii-redact` under the MIT license. Install with `pi install npm:@chrisdoc/pi-pii-redact`.

- Add a session vault with reversible PII tokens.
  
  - Stable `[LABEL_N#nonce]` tokens (same value, same token, across calls and turns), persisted as `pii-vault` session entries and rebuilt on `session_start`. They replace the per-call `[EMAIL_1]` placeholders; `[REDACTED:API_KEY]` is no longer special-cased.
  - Tolerant restore of tokens in assistant replies (`message_end`) and tool-call arguments (`tool_call`).
  - Context redaction now covers assistant text and tool-call arguments, bash executions, compaction and branch summaries, and `structuredContent` of tool results.
  - Compaction and branch summaries are generated from redacted input, and cancelled instead of falling back to plaintext on failure.
  - `/pii enable`, `/pii disable` and `/pii toggle` persist across reloads.
  - The redactor is disposed on `session_shutdown`.
  - Repeat occurrences of an entity no longer inflate the redaction count.
  - Context messages are processed sequentially for deterministic token numbering.

## [0.1.0] - 2026-10-28

### Added
- Initial release of `pi-pii-redact`.
- Automatic redaction of sensitive patterns across user input (`input`), tool outputs (`tool_result`), and conversation context (`context`).
- Built-in redaction rules for emails, API keys/tokens, phone numbers, IP addresses, and credit card numbers.
- `/pii` command for inspection, toggling redaction status, and listing active rules.
