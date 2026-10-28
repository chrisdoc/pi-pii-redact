# pi-pii-redact

A [Pi](https://github.com/earendil-works/pi) extension that intercepts and masks Personally Identifiable Information (PII) and sensitive tokens before they reach the LLM or persist in session transcripts.

## Features

- **Prompt Interception (`input`):** Scans and redacts raw user input before skill or prompt template expansion.
- **Tool Result Sanitization (`tool_result`):** Filters stdout, file content, and API responses (e.g. from `read_file` or `bash`) to prevent secrets or PII from entering conversation history.
- **Context Protection (`context`):** Non-destructively sanitizes message history prior to provider LLM dispatches.
- **Status & Controls:** Provides `/pii` commands (`/pii status`, `/pii toggle`, `/pii rules`) and a TUI status footer indicator.

## Installation

### Local development

Install directly via Pi:

```bash
pi install /path/to/pi-pii-redact
```

Or test for a single run:

```bash
pi -e /path/to/pi-pii-redact
```

### Git / npm package

```bash
pi install git:github.com/your-org/pi-pii-redact
# or
pi install npm:pi-pii-redact
```

## Commands

- `/pii status` — Display active redaction state and enabled rule count.
- `/pii toggle` — Toggle PII redaction on or off.
- `/pii rules` — List available redaction rules and categories.
