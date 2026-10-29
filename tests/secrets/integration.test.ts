import { describe, it, expect, beforeAll } from "vitest";
import { RedactorService } from "../../src/services/redactor.js";
import { getSecretScannerStatus } from "../../src/services/secrets/index.js";
import { fakeKeys, rand, randHex } from "./fake-keys.js";

function makeRedactor(): RedactorService {
  return new RedactorService([], undefined, {
    loadOptions: { directory: process.env.PI_PII_REDACT_MODEL_DIR || undefined },
  });
}

const SECRET_TOKEN = /\[SECRET_\d+#[a-z0-9]{4}\]/;

describe("secret detection (real scanner)", () => {
  let redactor: RedactorService;
  beforeAll(() => {
    redactor = makeRedactor();
  });

  const cases: Array<[string, () => { text: string; secret: string }]> = [
    ["Anthropic", () => { const k = fakeKeys.anthropic(); return { text: `export ANTHROPIC_API_KEY=${k}`, secret: k }; }],
    ["OpenAI", () => { const k = fakeKeys.openai(); return { text: `OPENAI_API_KEY=${k}`, secret: k }; }],
    ["Stripe", () => { const k = fakeKeys.stripe(); return { text: `STRIPE_KEY=${k}`, secret: k }; }],
    ["AWS key pair", () => { const k = fakeKeys.awsSecretKey(); return { text: `AWS_ACCESS_KEY_ID=${fakeKeys.awsAccessKeyId()}\nAWS_SECRET_ACCESS_KEY=${k}`, secret: k }; }],
    ["Hugging Face", () => { const k = fakeKeys.huggingFace(); return { text: `HF_TOKEN=${k}`, secret: k }; }],
    ["Slack", () => { const k = fakeKeys.slack(); return { text: `slack: ${k}`, secret: k }; }],
    ["SendGrid", () => { const k = fakeKeys.sendgrid(); return { text: `SENDGRID_API_KEY=${k}`, secret: k }; }],
    ["Google", () => { const k = fakeKeys.google(); return { text: `GOOGLE_API_KEY=${k}`, secret: k }; }],
    ["GitLab", () => { const k = fakeKeys.gitlab(); return { text: `token ${k}`, secret: k }; }],
    ["GitHub PAT", () => { const k = fakeKeys.github(); return { text: `token: ${k}`, secret: k }; }],
    ["JWT", () => { const k = fakeKeys.jwt(); return { text: `Authorization: Bearer ${k}`, secret: k }; }],
    ["password assignment", () => { const k = `${rand(8)}-${rand(8)}-${rand(6)}`; return { text: `password = "${k}"`, secret: k }; }],
  ];

  for (const [name, make] of cases) {
    it(`redacts a ${name} secret`, async () => {
      const { text, secret } = make();
      const result = await redactor.redact(text);
      expect(result.text).not.toContain(secret);
      expect(result.text).toMatch(SECRET_TOKEN);
      expect(result.redactions.some((r) => r.ruleId === "secrets" && r.category === "secret")).toBe(true);
      expect(getSecretScannerStatus()).toBe("ready");
    });
  }

  it("never leaves a fragment of a key behind (generic rules may match only a prefix)", async () => {
    for (let i = 0; i < 20; i++) {
      const key = fakeKeys.anthropic();
      const result = await redactor.redact(`export ANTHROPIC_API_KEY=${key}`);
      expect(result.text).toMatch(/^export ANTHROPIC_API_KEY=\[SECRET_\d+#[a-z0-9]{4}\]$/);
    }
  });

  it("redacts a PEM private key as a whole", async () => {
    const pem = fakeKeys.pem();
    const result = await redactor.redact(`my key:\n${pem}\nthanks`);
    const body = pem.split("\n")[1];
    expect(result.text).not.toContain(body);
    expect(result.text).toMatch(SECRET_TOKEN);
    expect(result.text).toContain("thanks");
  });

  it("restores the original in a tool-call-like string", async () => {
    const key = fakeKeys.anthropic();
    const result = await redactor.redact(`export ANTHROPIC_API_KEY=${key}`);
    const token = result.text.match(SECRET_TOKEN)![0];
    expect(redactor.restore(`curl -H "x-api-key: ${token}" https://api.example.com`)).toContain(key);
  });

  it("gives repeated occurrences the same token", async () => {
    const key = fakeKeys.openai();
    const result = await redactor.redact(`OPENAI_API_KEY=${key}\nagain: ${key}`);
    expect(result.text).not.toContain(key);
    const tokens = result.text.match(new RegExp(SECRET_TOKEN, "g"))!;
    expect(new Set(tokens).size).toBe(1);
    expect(tokens.length).toBe(2);
  });

  it("redacts a postgres URL with password as SECRET, not as a partial email", async () => {
    const pw = rand(12);
    const result = await redactor.redact(`DATABASE_URL=postgres://admin:${pw}@db.internal:5432/app`);
    expect(result.text).not.toContain(pw);
    expect(result.text).toMatch(SECRET_TOKEN);
    expect(result.text).not.toMatch(/\[EMAIL_/);
    expect(result.redactions.every((r) => r.ruleId === "secrets")).toBe(true);
  });

  it("wins over the phone rule for digits inside a key", async () => {
    const key = `sk_live_${rand(10, "0123456789")}${rand(14)}`;
    const result = await redactor.redact(`STRIPE_KEY=${key}`);
    expect(result.text).not.toMatch(/\[PHONE_/);
    expect(result.text).not.toContain(key);
  });

  it("can be disabled with the secrets rule (and its aliases)", async () => {
    const r = makeRedactor();
    expect(r.toggleRule("credentials", false)).toBe(false);
    expect(r.getRules().find((x) => x.id === "secrets")?.enabled).toBe(false);
    expect(r.toggleRule("secret", true)).toBe(true);
    r.toggleRule("secrets", false);
    const pw = `${rand(8)}-${rand(8)}-${rand(6)}`;
    const result = await r.redact(`password = "${pw}"`);
    expect(result.text).not.toMatch(SECRET_TOKEN);
  });

  describe("no false positives on developer text", () => {
    const texts = [
      `sha256: ${randHex(64)}`,
      `commit ${randHex(40)}\nMerge: ${randHex(7)} ${randHex(7)}`,
      `"integrity": "sha512-${Buffer.from(rand(64)).toString("base64")}"`,
      "uuid: 123e4567-e89b-12d3-a456-426614174000, token_type: 'bearer', expires_in: 3600",
      `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==">`,
      "const apiKey = process.env.OPENAI_API_KEY; // never hardcode keys",
      "docker run -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD postgres:16",
    ];
    for (const text of texts) {
      it(`leaves ${JSON.stringify(text.slice(0, 40))} alone`, async () => {
        const result = await redactor.redact(text);
        expect(result.redactions.filter((r) => r.ruleId === "secrets")).toEqual([]);
        expect(result.text).not.toMatch(/\[SECRET_/);
      });
    }
  });
});
