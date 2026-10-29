---
"@chrisdoc/pi-pii-redact": minor
---

Replace the `@desert-ant-labs/redact` model with masker-mini, an on-device NER model (about 22 MB, int4) run through ONNX Runtime. This is a breaking change while the package is 0.x.

- Detection is now masker-mini plus deterministic rules. Emails, credit cards (Luhn), IBANs (mod-97), US SSNs, ABA routing numbers, IMEIs, phone numbers, IPv4/IPv6 and Dutch BSNs (new `nl-bsn` rule) are found by checksum- or structure-validated rules that run before the model and no longer depend on it.
- New `age` rule (on by default) and opt-in `date` rule (off by default, enable with `/pii toggle date`).
- Removed the `state`, `secondary-address`, `url` and `org` rules, which have no detector any more. `passport`, `drivers-license` and `tax-id` are merged into `government-id`; the old names still work as aliases for toggling. Unknown ids in persisted settings are ignored.
- The default `minimumConfidence` is now 0.55 (was 0.85), calibrated on the bundled evaluation corpus, and the model runs once per text for all active labels.
- Model spans are cleaned up: edge punctuation is trimmed, numbers glued into larger identifiers (`usr_99812`) are ignored, partially tagged IDs are widened to the whole token (`12345678Z`), and partially tagged names are widened to the whole word.
- ONNX Runtime telemetry is disabled.
- The model is downloaded from a pinned Hugging Face revision, SHA-256 verified, and cached in `~/.cache/pi-pii-redact` (previously `~/.cache/desert-ant-models`). Use `PI_PII_REDACT_MODEL_DIR` for offline use.
- `onnxruntime-node` and `@huggingface/tokenizers` are now regular dependencies; `@desert-ant-labs/redact` and `koffi` are gone.
