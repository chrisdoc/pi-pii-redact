/**
 * Cheap pre-gate. Every scanString call costs about 24 ms regardless of input size, so the
 * scanner only runs for text that could plausibly contain a secret: a long token-like run,
 * a PEM header, credentials in a URL, or a password/token/key assignment.
 */
const GATE = /[A-Za-z0-9_\-+/=.]{20,}|-----BEGIN|:\/\/[^\s/:@]+:[^\s/@]+@|(?:password|passwd|secret|token|api[_-]?key)\s*[:=]/i;

export function passesSecretGate(text: string): boolean {
  return GATE.test(text);
}
