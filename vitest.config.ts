import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The `@/*` alias mirrors tsconfig.json. Declared by hand rather than via
// vite-tsconfig-paths, which is ESM-only and cannot be required by the config loader.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
  },
});
