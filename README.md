# pi-pii-redact

[![npm version](https://img.shields.io/npm/v/@chrisdoc/pi-pii-redact?logo=npm)](https://www.npmjs.com/package/@chrisdoc/pi-pii-redact)
[![npm downloads](https://img.shields.io/npm/dm/@chrisdoc/pi-pii-redact?logo=npm)](https://www.npmjs.com/package/@chrisdoc/pi-pii-redact)
[![CI](https://github.com/chrisdoc/pi-pii-redact/actions/workflows/ci.yml/badge.svg)](https://github.com/chrisdoc/pi-pii-redact/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Pi](https://github.com/earendil-works/pi) extension that keeps personally identifiable information (PII) and secrets away from the LLM.

Names, addresses, emails, phone numbers, card numbers, government IDs, API keys and more are replaced with stable tokens such as `[EMAIL_3#k7q2]` before anything is sent to the model. When the model uses those tokens in a tool call or a reply, the extension swaps the real values back in, so your tools still work on real data and you still read real values.

Detection runs locally with the [masker-mini](https://huggingface.co/divergentlabs/masker-mini) multilingual NER model (run through ONNX Runtime) plus deterministic rules using structural, context, and checksum validation as appropriate. Nothing is sent to a third-party service for redaction.

## Installation

Requires [Pi](https://github.com/earendil-works/pi) and Node.js 22 or later.

```bash
pi install npm:@chrisdoc/pi-pii-redact
```

This adds the package to your personal Pi settings (`~/.pi/agent/settings.json`), so it loads in every session. Start Pi as usual; the footer shows `PII: On` and redaction is active from the first prompt. Run `/pii status` to confirm.

> On first use the redaction model (about 22 MB) is downloaded from Hugging Face and cached in `~/.cache/pi-pii-redact`, so the first session takes a moment longer to start. See [The model](#the-model).
>
> Install size: `onnxruntime-node` bundles native binaries for all platforms, so the install is larger than the model alone.

### Other ways to install

| Goal | Command |
| --- | --- |
| Try it for one session without installing | `pi -e npm:@chrisdoc/pi-pii-redact` |
| Install for the current project only (`.pi/settings.json`) | `pi install -l npm:@chrisdoc/pi-pii-redact` |
| Pin a specific version | `pi install npm:@chrisdoc/pi-pii-redact@0.2.0` |
| Install from GitHub | `pi install git:github.com/chrisdoc/pi-pii-redact` |
| Install a local checkout | `pi install /path/to/pi-pii-redact` |

Project installs load only after you grant the project trust in Pi.

### Update and remove

```bash
pi update npm:@chrisdoc/pi-pii-redact   # update this package (pinned versions stay pinned)
pi update --extensions                  # update all installed packages
pi remove npm:@chrisdoc/pi-pii-redact   # uninstall
pi list                                 # show installed packages
```

## Example

You type:

```text
Email jane.doe@example.com that her card 4111 1111 1111 1111 was charged.
```

The model sees:

```text
Email [EMAIL_1#k7q2] that her card [CREDIT_CARD_1#k7q2] was charged.
```

If the model then calls a tool with `[EMAIL_1#k7q2]` as an argument, the tool receives `jane.doe@example.com`. Its reply is shown and stored with the real values.

## Commands

| Command | Description |
| --- | --- |
| `/pii` or `/pii status` | Show whether redaction is active and how many rules are enabled. |
| `/pii toggle` | Turn redaction on or off. |
| `/pii enable` / `/pii disable` | Turn redaction on or off explicitly. |
| `/pii rules` | List all rules and whether each is enabled. |
| `/pii stats` | Show a usage board of redacted and restored items. "This run" counters reset when Pi restarts; protected-value counts come from the session vault. |

The enabled state and disabled rules are stored in the session and survive reloads.

## What gets redacted

Rules marked "model" use the masker-mini NER model; "rules" are deterministic regex rules whose candidates must pass a checksum or structural check (the model's own email, phone and card labels are not used).

| Group | Rules | Source |
| --- | --- | --- |
| People | given names, surnames, ages (`age`) | model |
| Addresses | street names, building numbers, cities, ZIP/postal codes | model |
| Contact | email addresses, phone numbers, IPv4/IPv6 addresses | rules |
| Financial | credit card numbers (Luhn), IBANs (mod-97), ABA routing numbers | rules |
| Government IDs | `government-id` (national IDs, passports, tax IDs, driver's licenses) | model |
|  | US SSNs, Dutch BSNs (`nl-bsn`, needs a BSN keyword nearby) | rules |
| Devices | IMEI numbers (needs an "IMEI" keyword nearby) | rules |
| Secrets | API keys and tokens (`sk-…`, GitHub `ghp_…`/`gho_…`/…, GitLab `glpat-…`, AWS `AKIA…`) | rules |
| Dates | `date` (**disabled by default**: dates in logs and changelogs are noisy; enable it with `/pii toggle date`) | model |

`passport`, `drivers-license` and `tax-id` are aliases of `government-id`, so toggling them toggles that rule. The `state`, `secondary-address`, `url` and `org` rules were removed because no detector backs them any more.

## The model

- masker-mini (int4, about 22 MB, Apache-2.0) from [divergentlabs/masker-mini](https://huggingface.co/divergentlabs/masker-mini), derived from Microsoft mDeBERTa-v3 / Multilingual-MiniLM (MIT). See [NOTICE](NOTICE).
- It is downloaded on first use from a pinned Hugging Face revision, verified against pinned SHA-256 hashes and cached in `$XDG_CACHE_HOME/pi-pii-redact/masker-mini/<revision>/` (default `~/.cache/pi-pii-redact/...`).
- Offline use: set `PI_PII_REDACT_MODEL_DIR` to a directory with the same file layout (`config.json`, `tokenizer.json`, `tokenizer_config.json`, `onnx/model_int4.onnx`). Nothing is downloaded and the hashes are still verified.
- The default `minimumConfidence` is 0.55.
- ONNX Runtime's telemetry is disabled (`ORT_DISABLE_TELEMETRY=1` is set before the runtime loads).

## Where redaction happens

| Pi event | What the extension does |
| --- | --- |
| `input` | Redacts your prompt before skill or prompt-template expansion. |
| `tool_result` | Redacts tool output (stdout, file contents, API responses, `structuredContent`) before it enters the conversation. |
| `context` | Re-redacts the whole history before every provider request: user and assistant text, tool-call arguments, tool results, bash executions, compaction and branch summaries. Messages are copied, never mutated. Assistant `thinking` blocks are left byte-identical because providers sign them. |
| `tool_call` | Restores tokens in tool arguments to the real values. |
| `message_end` | Restores tokens in the assistant reply so it is stored as plaintext. |
| compaction / branch summary | Both call the model directly, so the extension runs them itself with redacted input. If that is impossible (no model, auth failure, error) the summary is cancelled rather than falling back to plaintext. |

While a reply is streaming you may briefly see tokens; they are replaced with the real values when the message ends.

## How tokens work: the session vault

Each session has a vault that maps every sensitive value to a token such as `[EMAIL_3#k7q2]`:

- The same value always gets the same token, and the number per label only goes up, so the model sees consistent identities across turns.
- `k7q2` is a random per-session nonce. Text that merely looks like a token (for example `[EMAIL_1]` in a file) is never restored.
- Restore tolerates the ways models mangle tokens: missing brackets, lower case and extra spaces (`email_3#k7q2`, `[ EMAIL_3 # k7q2 ]`). Tokens not in the vault are left unchanged.
- Rules with a custom `mask` are one-way and are not restored.

## Security model

This extension protects **what reaches the model**, not what is on disk.

| Data | In the session file | Sent to the LLM |
| --- | --- | --- |
| Your input, tool output | redacted (tokens) | tokens |
| Assistant replies, tool-call arguments, compaction and branch summaries | **plaintext** (restored) | re-redacted to tokens by `context` |
| Vault mapping | `pii-vault` custom entries with token and original | never |

**Session files contain the original values**, both in the `pii-vault` entries and in assistant replies. Protect them like any other file holding sensitive data.

Detection is model- and pattern-based and can miss things or over-redact. Treat it as a strong safety net, not a guarantee.

## Development

Requires Node.js 22 or later.

```bash
npm install
npm run typecheck
npm test
```

Load your working copy into Pi with `pi -e .`, or install it with `pi install .` to keep it loaded.

## Releasing

Versioning, the changelog and npm publishing are handled by [Changesets](https://changesets.dev) and [`.github/workflows/publish.yml`](.github/workflows/publish.yml).

1. In any PR that changes behavior, run `npx changeset`, pick the bump type (patch, minor or major), describe the change for users, and commit the generated file in `.changeset/`.
2. When the PR is merged, the workflow opens or updates a **Version Packages** PR that bumps `package.json` and writes `CHANGELOG.md`.
3. Merging the Version Packages PR publishes `@chrisdoc/pi-pii-redact` to npm with provenance and creates a git tag and GitHub release.

Publishing uses npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC): npm trusts the `publish.yml` workflow in `chrisdoc/pi-pii-redact`, so there is no npm token in the repository. The workflow needs "Allow GitHub Actions to create and approve pull requests" enabled under **Settings → Actions → General** to open the Version Packages PR.

## License

[MIT](LICENSE)
