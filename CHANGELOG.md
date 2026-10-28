# Changelog

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
