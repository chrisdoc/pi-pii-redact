# Changelog

## [Unreleased]

### Added
- Session vault: stable `[LABEL_N#nonce]` tokens (same value, same token, across calls and turns), persisted as `pii-vault` session entries and rebuilt on `session_start`.
- Tolerant restore of tokens in assistant replies (`message_end`) and tool-call arguments (`tool_call`).
- Context redaction now covers assistant text and tool-call arguments, bash executions, compaction and branch summaries, and `structuredContent` of tool results.
- Redacted compaction and branch summaries (cancelled instead of falling back to plaintext on failure).
- `/pii enable`, `/pii disable` and `/pii toggle` persist across reloads.
- The redactor is disposed on `session_shutdown`.

### Changed
- Placeholders changed from per-call `[EMAIL_1]` to vault tokens such as `[EMAIL_1#k7q2]`; `[REDACTED:API_KEY]` is no longer special-cased.
- Repeat occurrences of an entity no longer inflate the redaction count.
- Context messages are processed sequentially for deterministic token numbering.

## [0.1.0] - 2026-10-28

### Added
- Initial release of `pi-pii-redact`.
- Automatic redaction of sensitive patterns across user input (`input`), tool outputs (`tool_result`), and conversation context (`context`).
- Built-in redaction rules for emails, API keys/tokens, phone numbers, IP addresses, and credit card numbers.
- `/pii` command for inspection, toggling redaction status, and listing active rules.
