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

/**
 * These suites hard-delete the rows they create — and their cleanup matches on
 * name fragments, not ids. Pointed at the production database (which is where a
 * developer's `.env` tends to point) that is data loss. CI uses a throwaway
 * Postgres on localhost; a developer must do the same, or opt in deliberately
 * with a Neon branch or another disposable database.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

function databaseHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const host = databaseHost(process.env.DATABASE_URL);

if (!host || !LOCAL_HOSTS.has(host)) {
  if (process.env.ALLOW_REMOTE_INTEGRATION_DB !== "1") {
    throw new Error(
      `Refusing to run integration tests against "${host ?? "an unparseable URL"}". ` +
        "They delete rows. Use a local Postgres (see .github/workflows/ci.yml) or a disposable " +
        "Neon branch, and set ALLOW_REMOTE_INTEGRATION_DB=1 to confirm that is what this is.",
    );
  }

  console.warn(`[integration] running against remote database host "${host}" — make sure it is disposable.`);
}
