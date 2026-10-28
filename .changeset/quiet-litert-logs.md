---
"@chrisdoc/pi-pii-redact": patch
---

Stop LiteRT's native setup logs (`INFO: [gpu_registry.cc...]` and similar) from bleeding into Pi's TUI. The model now loads and warms up with process stderr briefly redirected to `/dev/null`. Set `PI_PII_REDACT_NATIVE_LOGS=1` to keep those logs for debugging.
