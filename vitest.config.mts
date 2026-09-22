import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // @testing-library/react only registers its own afterEach(cleanup) when
    // it finds a global `afterEach` at import time (dist/index.js: `typeof
    // afterEach === 'function'`); without it, jsdom's `document.body` keeps
    // every test's rendered output and later `getByRole` queries in the same
    // file start matching more than one element. This is a real, observed
    // failure here (not a hypothetical): the four component test files below
    // fail on their second render in the same file without it. globals:true
    // is the fix Testing Library's own Vitest setup guide documents, and it
    // is inert for the plain-function tests elsewhere in this suite - they
    // already import everything they use from "vitest" by name.
    globals: true,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
    // Each test file boots its own PGlite (WASM Postgres), and Vitest's
    // default is roughly one worker per CPU core. On a loaded machine that
    // oversubscribes the CPU: 8-10 files failed with a plain "Test timed out
    // in 5000ms" (never an assertion failure) rather than the whole suite
    // slowing down together. Measured, not guessed: capped to 4 workers the
    // full suite passed 245/245 in 20.5s, FASTER than the failing
    // default-worker run's 30.5s, because past the point where workers
    // exceed what the machine can actually run concurrently you add
    // context-switching and memory pressure without adding throughput. Do
    // not raise this to "fix" a timeout - that hides contention, it doesn't
    // remove it.
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
