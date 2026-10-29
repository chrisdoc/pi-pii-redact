import { randomBytes } from "node:crypto";

// Realistic provider keys must never be committed (GitHub push protection rejects them), so
// every key used in tests is generated at runtime from random bytes.

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const URLSAFE = `${ALNUM}-_`;

export function rand(length: number, alphabet = ALNUM): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function randHex(length: number): string {
  return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

export const fakeKeys = {
  anthropic: () => "sk-ant-api03-" + rand(93, URLSAFE) + "AA",
  // Real OpenAI keys embed the base64 of "OpenAI" in the middle; the scanner keys on it.
  openai: () => "sk-proj-" + rand(24, URLSAFE) + Buffer.from("OpenAI").toString("base64") + rand(24, URLSAFE),
  stripe: () => "sk_live_" + rand(24),
  awsAccessKeyId: () => "AKIA" + rand(16, "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"),
  awsSecretKey: () => rand(40, `${ALNUM}/+`),
  huggingFace: () => "hf_" + rand(34, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"),
  slack: () => `xoxb-${rand(12, "0123456789")}-${rand(12, "0123456789")}-${rand(24)}`,
  sendgrid: () => "SG." + rand(22, URLSAFE) + "." + rand(43, URLSAFE),
  google: () => "AIza" + rand(35, URLSAFE),
  gitlab: () => "glpat-" + rand(20, URLSAFE),
  github: () => "ghp_" + rand(36),
  jwt: () => {
    const b64 = (s: string) => Buffer.from(s).toString("base64url");
    return `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(`{"sub":"${rand(10)}","name":"x"}`)}.${rand(43, URLSAFE)}`;
  },
  pem: () =>
    `-----BEGIN RSA PRIVATE KEY-----\n${Array.from({ length: 4 }, () => randomBytes(48).toString("base64")).join("\n")}\n-----END RSA PRIVATE KEY-----`,
};
