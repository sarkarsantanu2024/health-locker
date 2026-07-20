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
});
