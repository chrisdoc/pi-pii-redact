# Changelog

## [0.1.0] - 2026-10-28

### Added
- Initial release of `pi-pii-redact`.
- Automatic redaction of sensitive patterns across user input (`input`), tool outputs (`tool_result`), and conversation context (`context`).
- Built-in redaction rules for emails, API keys/tokens, phone numbers, IP addresses, and credit card numbers.
- `/pii` command for inspection, toggling redaction status, and listing active rules.
