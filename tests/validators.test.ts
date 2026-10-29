import { describe, it, expect } from "vitest";
import {
  abaRoutingNumber,
  allSameDigit,
  bsn,
  email,
  hasContext,
  iban,
  imei,
  ipv4,
  ipv6,
  luhn,
  phone,
  ssn,
} from "../src/rules/validators.js";

describe("luhn", () => {
  it.each(["4111111111111111", "5555555555554444", "378282246310005", "4111 1111 1111 1111", "4111-1111-1111-1111"])(
    "accepts %s",
    (n) => expect(luhn(n)).toBe(true)
  );
  it.each(["4111111111111112", "1234567890123456", "411111111111", "41111111111111111111", ""])("rejects %s", (n) =>
    expect(luhn(n)).toBe(false)
  );
});

describe("allSameDigit", () => {
  it("detects repeated digits", () => {
    expect(allSameDigit("0000 0000 0000 0000")).toBe(true);
    expect(allSameDigit("4111 1111 1111 1111")).toBe(false);
  });
});

describe("iban", () => {
  it.each(["DE89370400440532013000", "NL91ABNA0417164300", "GB82WEST12345698765432", "NL91 ABNA 0417 1643 00", "nl91abna0417164300"])(
    "accepts %s",
    (n) => expect(iban(n)).toBe(true)
  );
  it("rejects a one-digit mutation", () => {
    expect(iban("NL91ABNA0417164301")).toBe(false);
    expect(iban("DE89370400440532013001")).toBe(false);
  });
  it("rejects wrong country length and structure", () => {
    expect(iban("DE8937040044053201300")).toBe(false);
    expect(iban("12345678901234567")).toBe(false);
    expect(iban("NL91")).toBe(false);
  });
  it("accepts unknown countries inside the generic 15-34 window when mod-97 holds", () => {
    expect(iban("BR1800360305000010009795493C1")).toBe(true);
  });
});

describe("bsn", () => {
  it("applies the elfproef", () => {
    expect(bsn("111222333")).toBe(true);
    expect(bsn("123456782")).toBe(true);
    expect(bsn("10000021")).toBe(true); // 8 digits, zero-padded (010000021)
    expect(bsn("123456789")).toBe(false);
    expect(bsn("000000000")).toBe(false);
    expect(bsn("1234567")).toBe(false);
  });
});

describe("abaRoutingNumber", () => {
  it("accepts valid routing numbers", () => {
    expect(abaRoutingNumber("011000015")).toBe(true);
    expect(abaRoutingNumber("021000021")).toBe(true);
  });
  it("rejects bad checksum, all-zero and wrong length", () => {
    expect(abaRoutingNumber("011000016")).toBe(false);
    expect(abaRoutingNumber("000000000")).toBe(false);
    expect(abaRoutingNumber("01100001")).toBe(false);
    expect(abaRoutingNumber("0110000155")).toBe(false);
  });
});

describe("ssn", () => {
  it("accepts a valid shape", () => {
    expect(ssn("123-45-6789")).toBe(true);
    expect(ssn("123456789")).toBe(true);
  });
  it.each(["000-12-3456", "666-12-3456", "900-12-3456", "987-65-4321", "123-00-4567", "123-45-0000", "12-345-6789x"])(
    "rejects %s",
    (n) => expect(ssn(n)).toBe(false)
  );
});

describe("ipv4", () => {
  it("accepts dotted decimals", () => {
    expect(ipv4("192.168.1.100")).toBe(true);
    expect(ipv4("0.0.0.0")).toBe(true);
    expect(ipv4("255.255.255.255")).toBe(true);
  });
  it.each(["256.1.1.1", "1.2.3", "1.2.3.4.5", "01.2.3.4", "1.2.3.", "a.b.c.d", "1..2.3"])("rejects %s", (n) =>
    expect(ipv4(n)).toBe(false)
  );
});

describe("ipv6", () => {
  it("accepts real addresses, including zones", () => {
    expect(ipv6("2001:db8::1")).toBe(true);
    expect(ipv6("fe80::1%en0")).toBe(true);
    expect(ipv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(true);
  });
  it.each(["::", "::1", "std::vector", "Foo::Bar", "Add::Dec", "a::b", "10:15:30", "12:34", "1:2:3:4:5:6:7:8:9"])(
    "rejects %s",
    (n) => expect(ipv6(n)).toBe(false)
  );
});

describe("imei", () => {
  it("accepts a Luhn-valid 15-digit IMEI", () => {
    expect(imei("490154203237518")).toBe(true);
    expect(imei("49-015420-323751-8")).toBe(true);
  });
  it("rejects wrong length or checksum", () => {
    expect(imei("490154203237519")).toBe(false);
    expect(imei("49015420323751")).toBe(false);
    expect(imei("4901542032375180")).toBe(false);
  });
});

describe("email", () => {
  it("accepts well-formed addresses", () => {
    expect(email("user@example.com")).toBe(true);
    expect(email("a.b+c@sub.example.co.uk")).toBe(true);
  });
  it.each(["a@b", "@example.com", "a@@b.com", "a@b..com", "a@.com", "a@b.c", "a@b.c1", "a..b@example.com"])(
    "rejects %s",
    (n) => expect(email(n)).toBe(false)
  );
});

describe("hasContext", () => {
  it("finds keywords in the window before the match, case-insensitively", () => {
    expect(hasContext("My SSN is 123456789", 10, /ssn/)).toBe(true);
    expect(hasContext("ssn" + " ".repeat(60) + "123456789", 63, /ssn/)).toBe(false);
    expect(hasContext("ssn", 0, /ssn/)).toBe(false);
  });
  it("is not affected by global/sticky flags or lastIndex", () => {
    const re = /ssn/g;
    for (let i = 0; i < 3; i++) expect(hasContext("ssn: 1", 5, re)).toBe(true);
  });
});

describe("phone", () => {
  it.each([
    "+1 (555) 012-3456",
    "+31 6 1234 5678",
    "+44 20 7946 0958",
    "+49 30 12345678",
    "0049 30 1234567",
    "+31612345678",
    "555-012-3456",
    "(555) 012-3456",
    "555.987.6543",
    "555 012 3456",
    "06-12345678",
    "020 123 4567",
    "030 1234567",
    "555-0123",
  ])("accepts %s", (n) => expect(phone(n)).toBe(true));

  it.each([
    "1234567890",
    "0012345678",
    "2024-03-12",
    "12.03.1985",
    "12-03-1985",
    "100-200",
    "1000-2000",
    "1.2.3",
    "192.168.100.200",
    "1.234.567",
    "3.14159265",
    "+1 23",
    "1 2 3 4 5 6 7 8 9",
    "+1234567890123456",
  ])("rejects %s", (n) => expect(phone(n)).toBe(false));
});
