import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Integration tests run against a REAL database (see tests/*.integration.test.ts).
 * Kept in a separate project so `pnpm test` stays fast, offline and hermetic.
 *
 * Requires DATABASE_URL, plus a migrated and seeded schema.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.integration.setup.ts"],
    include: ["tests/**/*.integration.test.ts"],
    // A serverless Postgres cold start can exceed the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Shared database: parallel files would race on connection limits.
    fileParallelism: false,
  },
});
