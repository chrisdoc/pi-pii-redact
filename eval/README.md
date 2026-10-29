# PII redaction eval

A labelled synthetic corpus plus a scorer, for before/after comparison of detection backends.
Everything is fictional or a well-known public test value (Luhn test cards, documentation IBANs, RFC 5737 IPs).
Nothing was downloaded; no public PII dataset was used (so no train/test contamination).

The scorer only uses the public `RedactorService` API (`new`, `init`, `redact`, `setVault`, `dispose`) and
`PiiVault`, so it runs unchanged against older checkouts.

## Corpus (`corpus.json`, 370 cases)

Case shape: `{ id, group, lang, text, pii: [{ value, type }] }`; every `value` occurs verbatim in `text`.

| group | cases | content |
|---|---|---|
| names-en | 60 | names in English dev prose: commit authors, TODO(name), reviews, tickets, chat, display names, handles; common-word names (Dan, Rob, Will, Grace, Hope, Mark) |
| names-intl | 41 | Chinese, Japanese, Korean, Indian, Arabic, Turkish, Nigerian, Vietnamese, Latin American names in English text |
| euro | 51 | de, nl, fr, es, it, pl, pt, sv, da, cs sentences: names, addresses, phones, IBANs, national ids, emails, DOB |
| structured | 53 | phones, cards, IBANs, SSN, routing/bank, passport, DL, tax id, BSN, IPs, IMEI, emails, API keys |
| mixed | 40 | JSON/YAML/CSV records, git log, SQL tables, access logs, tickets, .env, forms |
| no-pii | 125 | dev text with nothing personal: stack traces, compiler/test/package output, docker/k8s, SQL, configs, git, versions, timestamps, ids, hashes, code identifiers, infra regions, math, near-misses |

Types: GIVEN_NAME, SURNAME, STREET_NAME, BUILDING_NUMBER, CITY, ZIP_CODE, STATE, EMAIL, PHONE, CREDIT_CARD, IBAN,
BANK_ACCOUNT (non-IBAN), ROUTING_NUMBER, SSN, PASSPORT, DRIVERS_LICENSE, TAX_ID, NATIONAL_ID, IP_ADDRESS, IMEI,
DATE_OF_BIRTH, AGE, URL_WITH_PII, API_KEY. (URL_WITH_PII is defined but currently unused.)

### Labelling conventions

- Street name and building number are labelled separately (`Lindenstraße` / `14`).
- First and last names are separate values; a multi-part surname (`Rojas Gómez`, `van den Berg`) is one SURNAME. Vietnamese/CJK names follow their native order (family name = SURNAME).
- Lowercase handles that are a person's name (`@rob`, `TODO(ananya)`) are GIVEN_NAME.
- Cities only count when they are a person's location (home or delivery city). Cloud regions and "Frankfurt region" style infra mentions are no-pii.
- Dutch BSN, French NIR, Spanish DNI, Polish PESEL, Swedish personnummer, Danish CPR, Czech rodne cislo, Aadhaar and UK NINO are NATIONAL_ID. German Steuer-ID, Italian codice fiscale, Brazilian CPF, US EIN-style ids are TAX_ID.
- Sort code + UK account number are BANK_ACCOUNT.
- Private/loopback IPs (`10.0.0.1`, `127.0.0.1`, `192.168.x.x`), URLs on localhost, bot noreply addresses (dependabot), and crypto placeholder names (Alice/Bob/Eve) are NOT labelled. A backend that redacts them is scored as a false positive; this is a judgment call.
- Public figures are not used.
- Passwords embedded in connection strings were avoided, so credentials are only labelled when API_KEY-shaped.

Corpus source lives in `src/*.mjs` as annotated text (`⟦CODE|value⟧`); `node eval/build-corpus.mjs` regenerates
`corpus.json`, validates it (values present, ids unique, no PII in no-pii cases, warns when a labelled value also occurs unlabelled) and prints stats.

## Running

From the repo root of any checkout (Node 22.15+/24):

```bash
node --import ./eval/ts-resolve.mjs --experimental-strip-types --no-warnings eval/run.ts \
  [--out results.json] [--label NAME] [--limit N] [--group GROUP]
```

To evaluate an older checkout, copy the `eval/` directory into it (or `git worktree add` the ref and copy `eval/` in) and run from that root.
Only `src/services/redactor.ts` and `src/services/vault.ts` are imported; `ts-resolve.mjs` retries `./x.js` imports as `./x.ts`.

Model: the pinned masker-mini files are downloaded into the cache on first use. For offline runs point `PI_PII_REDACT_MODEL_DIR` at a directory with the same layout (SHA-256 is still verified).

```bash
PI_PII_REDACT_MODEL_DIR=/tmp/mm-spike/model \
  node --import ./eval/ts-resolve.mjs --experimental-strip-types --no-warnings eval/run.ts --out /tmp/eval-new.json --label new
# compare two result files
node --experimental-strip-types --no-warnings eval/compare.ts /tmp/eval-old.json /tmp/eval-new.json
```

`--limit N` samples N cases spread across the corpus (smoke test).

## Metrics

- A fresh `PiiVault` is installed per case (`setVault` also clears the result cache) so the vault fast path never leaks detections between cases. One model is loaded and reused; one warm-up call is excluded from timings.
- Per PII value: `leaked` = value still appears verbatim outside placeholders; `partial` = not verbatim, but an alphanumeric chunk of >= 4 chars still appears outside placeholders (chunks that also occur in unlabelled input, e.g. `example` from an email whose domain appears elsewhere, are ignored); otherwise `caught`.
  Matches are Unicode-boundary aware (so a building number `7` is not found inside `1007`).
- `recall` = (caught + partial) / total (what the task spec calls "no longer verbatim"); `strict recall` = caught / total.
- False positive = a redaction whose `original` does not overlap any labelled value of that case. Reported per ruleId, split into no-pii cases and PII cases, plus the share of no-pii texts with >= 1 redaction. Placeholders are bracketed upper-case tokens such as `[EMAIL_3#k7q2]`.
- Latency: per-case median/p90/max, total, model load time, peak RSS (process-wide).
- JSON output has per-case input, output, per-value status/leaked chunks/rule ids, and FP lists.
