---
"@chrisdoc/pi-pii-redact": minor
---

Add secret and credential detection using `@visulima/secret-scanner`. A new `secrets` rule (on by default, toggle with `/pii toggle secrets`) replaces API keys, tokens, JWTs, private keys and credentials in URLs with `[SECRET_n#xxxx]` tokens that are restored like other tokens. Detection runs offline (credential validation is hard-coded off) behind a regex pre-gate, and falls back to the existing regex rules if the native binding cannot load. `/pii status` shows the scanner state. The minimum supported Node version is now `^22.14.0 || >=24.10.0`.
