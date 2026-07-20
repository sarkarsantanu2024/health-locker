import { config } from "dotenv";

// Integration tests need the developer's real DATABASE_URL and ENCRYPTION_KEY,
// which Next loads automatically but Vitest does not.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Integration tests need DATABASE_URL. Copy infra/.env.example to .env, then run " +
      "`pnpm db:migrate && pnpm db:seed`.",
  );
}

if (!process.env.ENCRYPTION_KEY) {
  throw new Error("Integration tests need ENCRYPTION_KEY to read encrypted columns.");
}
