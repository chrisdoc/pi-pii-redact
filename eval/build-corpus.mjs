// Builds eval/corpus.json from the annotated sources in eval/src/.
// Usage: node eval/build-corpus.mjs   (regenerates corpus.json and prints stats)
import { writeFileSync } from "node:fs";
import { namesEn, namesIntl } from "./src/names.mjs";
import { euro } from "./src/euro.mjs";
import { structured } from "./src/structured.mjs";
import { mixed } from "./src/mixed.mjs";
import { nopii1 } from "./src/nopii1.mjs";
import { nopii2 } from "./src/nopii2.mjs";

const CODES = {
  G: "GIVEN_NAME", S: "SURNAME", ST: "STREET_NAME", BN: "BUILDING_NUMBER", C: "CITY", Z: "ZIP_CODE",
  STATE: "STATE", E: "EMAIL", P: "PHONE", CC: "CREDIT_CARD", IBAN: "IBAN", BA: "BANK_ACCOUNT",
  RN: "ROUTING_NUMBER", SSN: "SSN", PP: "PASSPORT", DL: "DRIVERS_LICENSE", TAX: "TAX_ID",
  NID: "NATIONAL_ID", IP: "IP_ADDRESS", IMEI: "IMEI", DOB: "DATE_OF_BIRTH", AGE: "AGE",
  URL: "URL_WITH_PII", KEY: "API_KEY",
};
const RE = /⟦([A-Z]+)\|([^⟧]*)⟧/g;

function parse(annotated) {
  const pii = [];
  const counts = {};
  const text = annotated.replace(RE, (_m, code, value) => {
    const type = CODES[code];
    if (!type) throw new Error(`unknown code ${code} in: ${annotated}`);
    counts[value] = (counts[value] ?? 0) + 1;
    if (!pii.some((p) => p.value === value)) pii.push({ value, type });
    return value;
  });
  return { text, pii, counts };
}

const nonEnNoPii = { "Das Update": "de", "Le déploiement": "fr", "De build": "nl", "El servidor": "es" };
const cases = [];
const annotatedCounts = new Map();
const counters = {};
function add(group, lang, annotated) {
  const { text, pii, counts } = parse(annotated);
  counters[group] = (counters[group] ?? 0) + 1;
  const id = `${group}-${String(counters[group]).padStart(3, "0")}`;
  annotatedCounts.set(id, counts);
  cases.push({ id, group, lang, text, pii });
}
namesEn.forEach((t) => add("names-en", "en", t));
namesIntl.forEach((t) => add("names-intl", "en", t));
euro.forEach(([lang, t]) => add("euro", lang, t));
structured.forEach((t) => add("structured", "en", t));
mixed.forEach((t) => add("mixed", "en", t));
[...nopii1, ...nopii2].forEach((t) => {
  const lang = Object.entries(nonEnNoPii).find(([k]) => t.startsWith(k))?.[1] ?? "en";
  add("no-pii", lang, t);
});

// Sanity checks.
const ids = new Set();
for (const c of cases) {
  if (ids.has(c.id)) throw new Error(`dup id ${c.id}`);
  ids.add(c.id);
  for (const p of c.pii) {
    if (!c.text.includes(p.value)) throw new Error(`${c.id}: value not in text: ${p.value}`);
    // Warn when a labelled value also occurs unlabelled elsewhere in the text (ambiguous label).
    const esc = p.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const total = (c.text.match(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "gu")) ?? []).length;
    if (total > (annotatedCounts.get(c.id)?.[p.value] ?? 1)) console.warn(`WARN ${c.id}: "${p.value}" occurs ${total}x, annotated ${annotatedCounts.get(c.id)?.[p.value] ?? 1}x`);
  }
  if (c.group === "no-pii" && c.pii.length) throw new Error(`${c.id}: no-pii has pii`);
  if (c.group !== "no-pii" && !c.pii.length) throw new Error(`${c.id}: pii group without pii`);
}
writeFileSync(new URL("./corpus.json", import.meta.url), JSON.stringify(cases, null, 1) + "\n");

const tally = (f) => cases.reduce((a, c) => (f(c).forEach((k) => (a[k] = (a[k] ?? 0) + 1)), a), {});
console.log("cases:", cases.length);
console.log("per group:", tally((c) => [c.group]));
console.log("per lang:", tally((c) => [c.lang]));
console.log("pii values per type:", tally((c) => c.pii.map((p) => p.type)));
