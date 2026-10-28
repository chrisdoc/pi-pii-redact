# pi-pii-redact

A [Pi](https://github.com/earendil-works/pi) extension that intercepts and masks Personally Identifiable Information (PII) and sensitive tokens before they reach the LLM or persist in session transcripts.

## Features

- **Prompt Interception (`input`):** Scans and redacts raw user input before skill or prompt template expansion.
- **Tool Result Sanitization (`tool_result`):** Filters stdout, file content, API responses and `structuredContent` before they enter conversation history.
- **Context Protection (`context`):** Re-redacts the full message history (user, assistant text and tool-call arguments, tool results, bash executions, compaction and branch summaries) before every provider request. Input messages are never mutated; assistant `thinking` blocks are left byte-identical because providers sign them.
- **Restore for tools and replies (`tool_call`, `message_end`):** Tokens in tool-call arguments are restored to the real values so tools operate on real data, and assistant replies are stored as plaintext.
- **Compaction and branch summaries:** Both call the model directly, so the extension takes them over and feeds the summarizer redacted input. If that is impossible (no model, auth failure, error) the summary is cancelled rather than falling back to plaintext.
- **Status & Controls:** Provides `/pii` commands (`/pii status`, `/pii toggle`, `/pii enable`, `/pii disable`, `/pii rules`) and a TUI status footer indicator. Enabled state and disabled rules persist in the session.

## How it works: the vault

Each session has a vault mapping every sensitive original to a stable token such as `[EMAIL_3#k7q2]`:

- The same value always gets the same token, and numbers per label only go up, so the model sees consistent identities across turns.
- `k7q2` is a random per-session nonce. Text from files that merely looks like `[EMAIL_1]` is never restored.
- Restore is tolerant of how models mangle tokens: missing brackets, lower case and extra spaces (`email_3#k7q2`, `[ EMAIL_3 # k7q2 ]`). Tokens that are not in the vault are left unchanged.
- Rules with a custom `mask` are one-way and are not restorable.

### What is stored where

| Data | In the session file | Sent to the LLM |
| --- | --- | --- |
| User input, tool output | redacted (tokens) | tokens |
| Assistant replies, tool-call arguments, compaction and branch summaries | **plaintext** (restored) | re-redacted to tokens by `context` |
| Vault mapping | `pii-vault` custom entries holding token and original | never |

**The session file therefore contains the originals** (in the `pii-vault` entries and in assistant replies). Protect session files accordingly; this extension protects what reaches the model, not what is on disk.

While a reply is streaming, partial output shows tokens; they are replaced by the real values at `message_end`.

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
- `/pii enable` / `/pii disable` — Turn PII redaction on or off explicitly.
- `/pii rules` — List available redaction rules and categories.
