import { describe, it, expect } from "vitest";
import { RedactorService } from "../src/services/redactor.js";
import { PiiVault } from "../src/services/vault.js";

function item(label: string, original: string, start: number) {
  return { label, original, placeholder: `[${label}_1]`, confidence: 0.99, start, end: start + original.length };
}

/** Minimal fake native engine: `detect` returns items for the pass input. */
function fakeEngine(detect: (text: string) => ReturnType<typeof item>[]) {
  return {
    dispose: () => {},
    redaction: async (text: string) => ({
      redactedText: text,
      items: detect(text),
      restore: (t: string) => t,
    }),
  };
}

const tok = (label: string) => `\\[${label}_\\d+#[a-z0-9]{4}\\]`;
const tokRe = (label: string) => new RegExp(tok(label));

describe("RedactorService", () => {
  it("redacts email addresses", async () => {
    const service = new RedactorService();
    const result = await service.redact("Contact me at user@example.com for info.");
    expect(result.hasRedactions).toBe(true);
    expect(result.text).toMatch(new RegExp(`^Contact me at ${tok("EMAIL")} for info\\.$`));
    expect(result.text).toBe(`Contact me at ${service.getVault().tokenFor("EMAIL", "user@example.com")} for info.`);
    expect(result.count).toBe(1);
    expect(result.redactions[0].category).toBe("email");
    expect(result.redactions[0].original).toBe("user@example.com");
  });

  it("redacts API keys and tokens", async () => {
    const service = new RedactorService();
    const result = await service.redact("Key is sk-1234567890abcdef1234567890.");
    expect(result.hasRedactions).toBe(true);
    expect(result.text).toMatch(new RegExp(`^Key is ${tok("API_KEY")}\\.$`));
    expect(result.count).toBe(1);
    expect(result.redactions[0].category).toBe("api-key");
    expect(result.redactions[0].original).toBe("sk-1234567890abcdef1234567890");
  });

  it("redacts IPv4 addresses", async () => {
    const service = new RedactorService();
    const result = await service.redact("Server running on 192.168.1.100 port 8080.");
    expect(result.hasRedactions).toBe(true);
    expect(result.text).toMatch(new RegExp(`^Server running on ${tok("IP_ADDRESS")} port 8080\\.$`));
    expect(result.count).toBe(1);
    expect(result.redactions[0].category).toBe("ip");
    expect(result.redactions[0].original).toBe("192.168.1.100");
  });

  it("respects enabled/disabled toggle", async () => {
    const service = new RedactorService();
    service.setEnabled(false);
    expect(service.isEnabled()).toBe(false);
    const result = await service.redact("user@example.com");
    expect(result.hasRedactions).toBe(false);
    expect(result.text).toBe("user@example.com");
    expect(result.count).toBe(0);
    expect(result.redactions).toEqual([]);
  });

  it("redacts additional PII types (phone numbers and names)", async () => {
    const service = new RedactorService();
    const result = await service.redact("Please call Dr. Alice Grant at +1-555-0199 regarding the report.");
    expect(result.hasRedactions).toBe(true);
    expect(result.text).toMatch(tokRe("PHONE"));
    expect(result.text).not.toContain("+1-555-0199");
  });

  it("supports toggling individual rules", async () => {
    const service = new RedactorService();

    // Disable email rule
    expect(service.toggleRule("email", false)).toBe(false);
    const emailResult = await service.redact("Send email to test@domain.org");
    expect(emailResult.hasRedactions).toBe(false);
    expect(emailResult.text).toBe("Send email to test@domain.org");

    // API key rule remains active
    const keyResult = await service.redact("Token sk-1234567890abcdef1234567890 here");
    expect(keyResult.hasRedactions).toBe(true);
    expect(keyResult.text).toMatch(tokRe("API_KEY"));

    // Re-enable email rule
    expect(service.toggleRule("email", true)).toBe(true);
    const recheck = await service.redact("Send email to test@domain.org");
    expect(recheck.hasRedactions).toBe(true);
    expect(recheck.text).toMatch(tokRe("EMAIL"));
  });

  it("supports restoring redacted native text and LLM responses via result.restore", async () => {
    const service = new RedactorService();
    const prompt = "Register user bob@company.org with secret sk-1234567890abcdef1234567890 now.";
    const result = await service.redact(prompt);
    expect(result.hasRedactions).toBe(true);
    expect(result.restore).toBeDefined();

    // Simulate an LLM responding using the redacted placeholders
    const emailTok = service.getVault().tokenFor("EMAIL", "bob@company.org");
    const keyTok = service.getVault().tokenFor("API_KEY", "sk-1234567890abcdef1234567890");
    expect(result.text).toContain(emailTok);
    expect(result.text).toContain(keyTok);
    const llmResponse = `Confirmed: Account ${emailTok} provisioned with auth key ${keyTok}.`;
    const restored = result.restore!(llmResponse);
    expect(restored).toBe(
      "Confirmed: Account bob@company.org provisioned with auth key sk-1234567890abcdef1234567890."
    );
  });

  it("supports service-level restore method across native and overlay placeholders", async () => {
    const service = new RedactorService();
    const text = "Connect to developer@platform.net using token sk-9876543210fedcba9876543210 on 10.0.0.1";
    await service.redact(text);

    const v = service.getVault();
    const llmAnswer = `I will connect to ${v.tokenFor("EMAIL", "developer@platform.net")} using token ${v.tokenFor("API_KEY", "sk-9876543210fedcba9876543210")} at host ${v.tokenFor("IP_ADDRESS", "10.0.0.1")}.`;
    const restored = service.restore(llmAnswer);
    expect(restored).toBe(
      "I will connect to developer@platform.net using token sk-9876543210fedcba9876543210 at host 10.0.0.1."
    );
  });

  it("handles empty, whitespace, and nullish strings gracefully", async () => {
    const service = new RedactorService();
    const resEmpty = await service.redact("");
    expect(resEmpty.hasRedactions).toBe(false);
    expect(resEmpty.text).toBe("");
    expect(resEmpty.restore("hello")).toBe("hello");

    const resWhitespace = await service.redact("   ");
    expect(resWhitespace.hasRedactions).toBe(false);

    expect(service.restore("")).toBe("");
  });

  it("introspects rules with getRules and getConfig", () => {
    const service = new RedactorService();
    const rules = service.getRules();
    expect(rules.length).toBe(23);
    const config = service.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.maskUserInputs).toBe(true);
    expect(config.maskToolResults).toBe(true);
    expect(config.maskContextMessages).toBe(true);
    expect(config.notifyOnRedact).toBe(true);
  });

  describe("session vault semantics", () => {
    const tokenOf = (text: string, label: string) => text.match(tokRe(label))![0];

    it("gives the same email the same token across calls and different people different tokens", async () => {
      const service = new RedactorService();
      const r1 = await service.redact("Mail alice@example.com please");
      const r2 = await service.redact("Again alice@example.com thanks");
      const r3 = await service.redact("Now bob@example.com instead");
      const a1 = tokenOf(r1.text, "EMAIL");
      const a2 = tokenOf(r2.text, "EMAIL");
      const b = tokenOf(r3.text, "EMAIL");
      expect(a1).toBe(a2);
      expect(b).not.toBe(a1);
      expect(service.restore(`Reply to ${b}, cc ${a1}`)).toBe("Reply to bob@example.com, cc alice@example.com");
      expect(r1.restore(`${b}`)).toBe("bob@example.com");
    });

    it("keeps numbering monotonic after setVault with a rebuilt vault", async () => {
      const s1 = new RedactorService();
      const r1 = await s1.redact("a@one.com and b@two.com");
      const payload = s1.getVault().takePendingDelta()!;
      const s2 = new RedactorService();
      s2.setVault(PiiVault.fromPayloads(JSON.parse(JSON.stringify([payload]))));
      const again = await s2.redact("b@two.com");
      expect(again.text).toBe(r1.text.match(/\[EMAIL_2#[a-z0-9]{4}\]/)![0]);
      const fresh = await s2.redact("c@three.com");
      expect(fresh.text).toMatch(/^\[EMAIL_3#/);
    });

    it("never restores planted literal or foreign-nonce tokens", async () => {
      const service = new RedactorService();
      const res = await service.redact("Real: user@example.com");
      const real = tokenOf(res.text, "EMAIL");
      const nonce = real.match(/#([a-z0-9]{4})\]/)![1];
      const other = nonce === "zzzz" ? "yyyy" : "zzzz";
      const planted = `[EMAIL_1] [EMAIL_1#${other}] [EMAIL_99#${nonce}]`;
      expect(service.restore(planted)).toBe(planted);
      // a planted token in input does not leak a value and is left as-is
      const out = await service.redact(`file says ${planted}`);
      expect(out.text).toBe(`file says ${planted}`);
      expect(service.restore(out.text)).toBe(out.text);
    });

    it("is idempotent on already-tokenized text", async () => {
      const service = new RedactorService();
      const first = await service.redact("Contact alice@example.com via 192.168.1.5 key sk-1234567890abcdef1234567890");
      const second = await service.redact(first.text);
      expect(second.text).toBe(first.text);
      expect(second.hasRedactions).toBe(false);
      expect(second.count).toBe(0);
    });

    it("handles $ sequences in originals on restore", async () => {
      const service = new RedactorService([
        { id: "dollar", name: "Dollar", category: "custom", pattern: /PW:\S+/g, enabled: true },
      ]);
      const key = "PW:ab$&$1$$de$`$'";
      const res = await service.redact(`key ${key}`);
      expect(res.text).toMatch(/^key \[CUSTOM_\d+#[a-z0-9]{4}\]$/);
      expect(res.restore(res.text)).toBe(`key ${key}`);
    });

    it("does not double count repeated occurrences within one call", async () => {
      const service = new RedactorService();
      const res = await service.redact("a@x.com, a@x.com and a@x.com");
      expect(res.count).toBe(3);
      expect(res.redactions).toHaveLength(3);
      const seen = new Set(res.redactions.map((r) => r.masked));
      expect(seen.size).toBe(1);
    });

    it("does not add duplicate details for native repeat occurrences", async () => {
      const service = new RedactorService([], {}, {
        redactInstance: fakeEngine((text) => {
          const start = text.indexOf("Zorblax");
          return [item("GIVEN_NAME", "Zorblax", start)];
        }) as any,
      });
      const res = await service.redact("Zorblax met Zorblax and Zorblax.");
      expect(res.count).toBe(1);
      expect(res.redactions).toHaveLength(1);
      expect(res.text.match(/\[GIVEN_NAME_1#[a-z0-9]{4}\]/g)).toHaveLength(3);
      expect(res.text).not.toContain("Zorblax");
    });

    it("drops native items overlapping existing tokens and ignores tokens when probing digits", async () => {
      const service = new RedactorService();
      const first = await service.redact("mail a@x.com");
      const tokenText = first.text.slice("mail ".length);
      const calls: string[] = [];
      const svc2 = new RedactorService([], {}, {
        redactInstance: fakeEngine((text) => {
          calls.push(text);
          // engine wrongly flags part of the token
          const start = text.indexOf("EMAIL");
          return start >= 0 ? [item("GIVEN_NAME", "EMAIL", start)] : [];
        }) as any,
      });
      svc2.setVault(service.getVault());
      const res = await svc2.redact(`see ${tokenText}`);
      expect(res.text).toBe(`see ${tokenText}`);
      expect(res.count).toBe(0);
      // the token's digits alone must not trigger the structured pass
      expect(calls.length).toBe(1);
    });

    it("serves repeated input from the cache without touching the native engine", async () => {
      let calls = 0;
      const engine = fakeEngine((text) => {
        calls++;
        const start = text.indexOf("Zorblax");
        return start >= 0 ? [item("GIVEN_NAME", "Zorblax", start)] : [];
      });
      const service = new RedactorService([], {}, { redactInstance: engine as any });
      const r1 = await service.redact("Hello Zorblax");
      const callsAfterFirst = calls;
      expect(callsAfterFirst).toBeGreaterThan(0);
      const r2 = await service.redact("Hello Zorblax");
      expect(calls).toBe(callsAfterFirst);
      expect(r2.text).toBe(r1.text);
      expect(r2.count).toBe(r1.count);

      // cache is invalidated by toggleRule
      service.toggleRule("surname", false);
      await service.redact("Hello Zorblax");
      expect(calls).toBeGreaterThan(callsAfterFirst);
    });

    it("uses the fast path for known originals in later calls", async () => {
      const engine = fakeEngine((text) => {
        const start = text.indexOf("Zorblax");
        return start >= 0 && !text.includes("[") ? [item("GIVEN_NAME", "Zorblax", start)] : [];
      });
      const service = new RedactorService([], {}, { redactInstance: engine as any });
      const r1 = await service.redact("Hello Zorblax");
      const r2 = await service.redact("Bye Zorblax!");
      expect(tokenOf(r1.text, "GIVEN_NAME")).toBe(tokenOf(r2.text, "GIVEN_NAME"));
      expect(r2.hasRedactions).toBe(true);
      expect(r2.count).toBe(1);
    });

    it("dispose keeps the vault for restore", async () => {
      const service = new RedactorService();
      const res = await service.redact("a@x.com");
      service.dispose();
      expect(service.restore(res.text)).toBe("a@x.com");
    });

    it("does not make rules with a custom mask restorable", async () => {
      const service = new RedactorService([
        {
          id: "ticket",
          name: "Ticket",
          category: "custom",
          pattern: /TICKET-\d{4}/g,
          mask: () => "[TICKET_MASKED]",
          enabled: true,
        },
      ]);
      const res = await service.redact("see TICKET-1234 now");
      expect(res.text).toBe("see [TICKET_MASKED] now");
      expect(res.count).toBe(1);
      expect(res.restore(res.text)).toBe("see [TICKET_MASKED] now");
      expect(service.getVault().knownOriginals().some((e) => e.original === "TICKET-1234")).toBe(false);
    });
  });
});
