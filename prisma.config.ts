// Prisma CLI configuration.
//
// Replaces the deprecated `prisma` key in package.json, which Prisma 7 removes.
// The catch is that the presence of this file turns OFF Prisma's automatic .env
// loading, so the dotenv import below is not optional — without it `prisma
// migrate` would run with no DATABASE_URL and fail with a confusing error.
//
// `.env.local` first, matching Next's own precedence, so a developer's local
// override wins over the checked-in defaults.
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
