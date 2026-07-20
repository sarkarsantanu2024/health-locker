/**
 * Tests must never depend on a developer's .env or reach a real service.
 * These defaults satisfy src/lib/env.ts's fail-fast validation.
 *
 * Assigned via Object.assign because @types/node declares NODE_ENV readonly.
 */
Object.assign(process.env, {
  NODE_ENV: "test",
  AI_PROVIDER: "mock",
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/healthlocker_test?schema=public",
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? "test-secret-test-secret-test-secret-0123456789",
  // Fixed 32-byte test key (0x00…0x1f). Must be set here rather than in a test's
  // beforeAll: src/lib/env.ts parses process.env at import time.
  ENCRYPTION_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
});
