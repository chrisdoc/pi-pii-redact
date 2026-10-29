import { describe, it, expect } from "vitest";
import { RedactorService } from "../src/services/redactor.js";

/** Fake NER engine that never finds anything: only the deterministic overlay layer can redact. */
const emptyEngine = {
  dispose: () => {},
  redaction: async (text: string) => ({ redactedText: text, items: [], restore: (t: string) => t }),
};

function service() {
  return new RedactorService([], undefined, { redactInstance: emptyEngine as never });
}

const tokenRe = (label: string) => new RegExp(`\\[${label}_\\d+#[a-z0-9]{4}\\]`);

describe("deterministic rules: positives", () => {
  const cases: Array<[string, string, string, string]> = [
    // [input, original, vault label, rule id]
    ["Card 4111 1111 1111 1111 expires soon", "4111 1111 1111 1111", "CREDIT_CARD", "credit-card"],
    ["Card 5555-5555-5555-4444.", "5555-5555-5555-4444", "CREDIT_CARD", "credit-card"],
    ["Amex 378282246310005 ok", "378282246310005", "CREDIT_CARD", "credit-card"],
    ["IBAN DE89370400440532013000.", "DE89370400440532013000", "BANK_ACCOUNT", "bank-account"],
    ["IBAN NL91 ABNA 0417 1643 00.", "NL91 ABNA 0417 1643 00", "BANK_ACCOUNT", "bank-account"],
    ["iban gb82west12345698765432 end", "gb82west12345698765432", "BANK_ACCOUNT", "bank-account"],
    ["Call +1 (555) 012-3456 now", "+1 (555) 012-3456", "PHONE", "phone"],
    ["Bel +31 6 1234 5678.", "+31 6 1234 5678", "PHONE", "phone"],
    ["Tel +44 20 7946 0958", "+44 20 7946 0958", "PHONE", "phone"],
    ["Tel +49 30 12345678", "+49 30 12345678", "PHONE", "phone"],
    ["Tel 0049 30 1234567", "0049 30 1234567", "PHONE", "phone"],
    ["Phone 555-012-3456!", "555-012-3456", "PHONE", "phone"],
    ["Phone (555) 012-3456", "(555) 012-3456", "PHONE", "phone"],
    ["Phone 555.987.6543", "555.987.6543", "PHONE", "phone"],
    ["Phone 555 012 3456", "555 012 3456", "PHONE", "phone"],
    ["Mobiel 06-12345678", "06-12345678", "PHONE", "phone"],
    ["Tel 020 123 4567", "020 123 4567", "PHONE", "phone"],
    ["Tel 030 1234567", "030 1234567", "PHONE", "phone"],
    ["SSN 123-45-6789 on file", "123-45-6789", "SSN", "ssn"],
    ["Social security number: 123456789", "123456789", "SSN", "ssn"],
    ["Routing number 011000015", "011000015", "ROUTING_NUMBER", "routing-number"],
    ["ABA 021000021", "021000021", "ROUTING_NUMBER", "routing-number"],
    ["IMEI: 490154203237518", "490154203237518", "IMEI", "imei"],
    ["IMEI 49-015420-323751-8", "49-015420-323751-8", "IMEI", "imei"],
    ["BSN: 111222333", "111222333", "GOVERNMENT_ID", "nl-bsn"],
    ["Burgerservicenummer 111222333", "111222333", "GOVERNMENT_ID", "nl-bsn"],
    ["Host 192.168.1.100 up", "192.168.1.100", "IP_ADDRESS", "ip-address"],
    ["Host 2001:db8::1 up", "2001:db8::1", "IP_ADDRESS", "ip-address"],
    ["Host fe80::1%eth0 up", "fe80::1%eth0", "IP_ADDRESS", "ip-address"],
    ["Mail user@example.com now", "user@example.com", "EMAIL", "email"],
  ];

  it.each(cases)("redacts %s", async (input, original, label, ruleId) => {
    const result = await service().redact(input);
    expect(result.text).not.toContain(original);
    expect(result.text).toMatch(tokenRe(label));
    expect(result.count).toBe(1);
    expect(result.redactions[0].original).toBe(original);
    expect(result.redactions[0].ruleId).toBe(ruleId);
    expect(result.restore(result.text)).toBe(input);
  });

  it("gives IMEI precedence over credit-card on a Luhn-valid 15-digit number", async () => {
    const result = await service().redact("IMEI 490154203237518");
    expect(result.redactions.map((r) => r.ruleId)).toEqual(["imei"]);
  });

  it("gives credit cards the CREDIT_CARD label even without context words", async () => {
    const result = await service().redact("4111111111111111");
    expect(result.text).toMatch(tokenRe("CREDIT_CARD"));
  });

  it("is stable across repeated calls (no regex lastIndex leakage)", async () => {
    const s = service();
    const input = "a 4111 1111 1111 1111 b 555-012-3456 c 10.0.0.1";
    const first = await s.redact(input);
    const second = await s.redact(`${input} again`);
    expect(second.text).toBe(`${first.text} again`);
    expect(first.count).toBe(3);
  });
});

describe("deterministic rules: rejected candidates stay untouched", () => {
  const negatives: Array<[string, string]> = [
    ["credit card, bad Luhn", "Card 4111 1111 1111 1112"],
    ["credit card, all zeros", "Card 0000 0000 0000 0000"],
    ["credit card, embedded in longer digits", "id 34111111111111111111111"],
    ["iban, mutated", "IBAN NL91ABNA0417164301"],
    ["undashed 9 digits without ssn context", "order 123456789"],
    ["routing checksum ok but no context", "value 011000015"],
    ["routing context but bad checksum", "Routing number 011000016"],
    ["bsn elfproef ok but no context", "count 111222333"],
    ["bsn context but bad elfproef", "BSN 123456789"],
    ["ipv4 octet out of range", "ip 999.1.1.1"],
    ["email without TLD", "a@localhost"],
  ];

  it.each(negatives)("%s", async (_name, input) => {
    const result = await service().redact(input);
    expect(result.text).toBe(input);
    expect(result.count).toBe(0);
  });

  // An invalid-SSN-shaped number is not an SSN, but its 3-2-4 grouping is still a plausible
  // phone-like identifier, so the phone rule (recall-first) may take it. It must never become SSN.
  it.each(["000-12-3456", "666-12-3456", "912-12-3456"])("%s is never tokenized as SSN", async (n) => {
    const result = await service().redact(`SSN ${n}`);
    expect(result.text).not.toMatch(tokenRe("SSN"));
  });

  it("a Luhn-valid 15-digit number without IMEI context is a card, not an IMEI", async () => {
    const result = await service().redact("serial 490154203237518");
    expect(result.redactions.map((r) => r.ruleId)).toEqual(["credit-card"]);
  });

  it("a failed validation does not consume a token number or create a vault entry", async () => {
    const s = service();
    await s.redact("Card 4111 1111 1111 1112");
    expect(s.getVault().takePendingDelta()).toBeNull();
  });
});

describe("deterministic rules: developer text produces zero redactions", () => {
  const devText = [
    "at Object.<anonymous> (/app/src/index.ts:42:13)",
    "    at Module._compile (node:internal/modules/cjs/loader:1554:14)",
    "Traceback (most recent call last): File \"main.py\", line 12, in <module>",
    "2024-03-12T10:15:30Z",
    "2024-03-12T10:15:30.123+01:00",
    "2024-03-12 10:15:30",
    "2024-03-12",
    "12.03.1985",
    "03/12/2024",
    "12-03-1985",
    "10:15:30",
    "10:15:30.456",
    "v22.11.0",
    "1.2.3",
    "^4.17.21 ~1.2.3 >=18.0.0 <20.0.0",
    "node@22.11.0",
    "1.2.3-beta.4",
    "ports: - \"5432:5432\" - \"8080:80\"",
    "docker run -p 5432:5432 postgres:16",
    "SELECT * FROM users WHERE id = 1234567890 AND age BETWEEN 18 AND 65;",
    "INSERT INTO t (a, b) VALUES (123456789, 987654321);",
    "git commit 3f2a9c1 and a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    "pid 12345 tid 67890",
    "[12345] started",
    "ts=1710238530123",
    "epoch 1710238530",
    "price 3.14159265 or $1,234,567.89 or 1.234.567",
    "range 100-200 and 1000-2000",
    "std::vector<int> v; Foo::Bar::baz(); a::b",
    "namespace::Add::Dec",
    "order id 5551234567 shipped",
    "ORD5551234567 and 555123456789012",
    "user_id=4111111111111112",
    "size 1920x1080 at 60.0 fps, 16:9",
    "version 10.0.19045.4046",
    "0x7fff5fbff8c0",
    "uuid 123e4567-e89b-12d3-a456-426614174000",
    "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "build #20240312-1 on port 3000",
    "rows: 1 2 3 4 5 6 7 8 9",
    "lat 52.3702, lon 4.8952",
  ];

  it.each(devText)("leaves %s unchanged", async (input) => {
    const result = await service().redact(input);
    expect(result.text).toBe(input);
    expect(result.count).toBe(0);
  });
});

describe("deterministic rules: toggling", () => {
  it("disabling a converted rule stops its detections", async () => {
    const s = service();
    s.toggleRule("phone", false);
    const result = await s.redact("Phone 555-012-3456");
    expect(result.text).toBe("Phone 555-012-3456");
  });

  it("nl-bsn is a separate rule from government-id", async () => {
    const s = service();
    s.toggleRule("nl-bsn", false);
    const result = await s.redact("BSN 111222333");
    expect(result.text).toBe("BSN 111222333");
  });
});
