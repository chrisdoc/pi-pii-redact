import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Most suites run the real on-device redaction model on CPU (~45ms per call plus
    // ~0.5ms per character), so large-input tests need far more than vitest's 5s default.
    testTimeout: 30_000,
  },
});
