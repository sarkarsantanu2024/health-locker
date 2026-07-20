import { z } from "zod";

/**
 * Single source of truth for server-side configuration.
 *
 * Philosophy (lean MVP): the app must boot with nothing but a Postgres URL and a
 * JWT secret. Every managed cloud service (Upstash, R2, Web Push, AI) is optional
 * at boot and validated lazily at the point of use, so local/offline development
 * never needs credentials it will not exercise.
 */

const nonEmpty = z.string().trim().min(1);

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: nonEmpty.default("HealthLocker"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // --- Database (required) -------------------------------------------------
  // Neon: DATABASE_URL is the POOLED connection (-pooler host) used by the app;
  // DIRECT_URL is the direct connection used by `prisma migrate`.
  DATABASE_URL: nonEmpty,
  DIRECT_URL: nonEmpty.optional(),

  // --- Auth (required) -----------------------------------------------------
  AUTH_JWT_SECRET: nonEmpty.min(32, "AUTH_JWT_SECRET must be >= 32 characters"),
  AUTH_ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900), // 15 min
  AUTH_REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  AUTH_COOKIE_PREFIX: nonEmpty.default("hl"),
  // AES-256-GCM key (32 bytes, base64) for encrypting sensitive columns at rest.
  ENCRYPTION_KEY: z.string().trim().optional(),

  // --- Upstash (optional until Phase 4/5) ----------------------------------
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().optional(),
  QSTASH_URL: z.string().url().optional(),
  QSTASH_TOKEN: z.string().trim().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().trim().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().trim().optional(),

  // --- Cloudflare R2 (optional until Phase 4) ------------------------------
  R2_ACCOUNT_ID: z.string().trim().optional(),
  R2_ACCESS_KEY_ID: z.string().trim().optional(),
  R2_SECRET_ACCESS_KEY: z.string().trim().optional(),
  R2_BUCKET: z.string().trim().optional(),
  // Set for MinIO / non-Cloudflare S3-compatible local dev.
  R2_ENDPOINT: z.string().url().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),

  // --- Web Push (optional until Phase 5) -----------------------------------
  VAPID_PUBLIC_KEY: z.string().trim().optional(),
  VAPID_PRIVATE_KEY: z.string().trim().optional(),
  VAPID_SUBJECT: z.string().trim().default("mailto:ops@healthlocker.local"),

  // --- AI (optional; mock adapter is the default) --------------------------
  AI_PROVIDER: z.enum(["mock", "gemini", "groq"]).default("mock"),
  GEMINI_API_KEY: z.string().trim().optional(),
  GROQ_API_KEY: z.string().trim().optional(),

  // --- Jobs ----------------------------------------------------------------
  // Shared secret for Vercel Cron -> /api/jobs/* calls (QStash uses signatures).
  CRON_SECRET: z.string().trim().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

function loadEnv(): ServerEnv {
  // This module holds secrets; it must never end up in a client bundle. Next's
  // bundler would inline `process.env` lookups, so a browser global here means
  // something imported it from a Client Component.
  if (typeof window !== "undefined") {
    throw new Error("src/lib/env.ts is server-only and must not be imported by client code.");
  }

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Copy infra/.env.example to .env and fill in the required values.`,
    );
  }

  return parsed.data;
}

export const env: ServerEnv = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

/**
 * Lazily assert that an optional service group is configured. Feature code calls
 * this at the point of use so a missing R2 key never blocks `pnpm dev`.
 */
function requireGroup<T extends Record<string, string | undefined>>(
  service: string,
  values: T,
): { [K in keyof T]: string } {
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `${service} is not configured. Missing env vars: ${missing.join(", ")}. ` +
        `See infra/.env.example.`,
    );
  }

  return values as { [K in keyof T]: string };
}

export const requireRedisEnv = () =>
  requireGroup("Upstash Redis", {
    UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
  });

export const requireQStashEnv = () =>
  requireGroup("Upstash QStash", {
    QSTASH_TOKEN: env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: env.QSTASH_NEXT_SIGNING_KEY,
  });

export const requireR2Env = () =>
  requireGroup("Cloudflare R2", {
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: env.R2_BUCKET,
    // Either an explicit endpoint (MinIO) or an account id (Cloudflare) works;
    // the client resolves the endpoint, so we only require one of them here.
    R2_ENDPOINT_OR_ACCOUNT: env.R2_ENDPOINT ?? env.R2_ACCOUNT_ID,
  });

export const requireWebPushEnv = () =>
  requireGroup("Web Push", {
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: env.VAPID_SUBJECT,
  });

export const requireEncryptionKey = () =>
  requireGroup("Column encryption", { ENCRYPTION_KEY: env.ENCRYPTION_KEY }).ENCRYPTION_KEY;
