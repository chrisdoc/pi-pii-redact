import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Most suites run the real on-device redaction model on CPU (~45ms per call plus
    // ~0.5ms per character), so large-input tests need far more than vitest's 5s default.
    testTimeout: 30_000,
    setupFiles: ["tests/setup-shared-model.ts"],
    // Each test file loads its own model instance (once, via the setup file); running files in parallel oversubscribes the
    // CPU (e.g. 2-vCPU CI runners) and makes every inference slower, so run files one at a time.
    fileParallelism: false,
  },
});
