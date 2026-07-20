import { PrismaClient } from "@prisma/client";

import { env, isProduction } from "@/lib/env";

/**
 * Serverless-safe Prisma singleton.
 *
 * Each Vercel lambda invocation may reuse a warm module scope; caching the client
 * on `globalThis` keeps one connection pool per instance instead of leaking a new
 * one per request. `DATABASE_URL` must be Neon's POOLED connection string.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ["error"] : ["warn", "error"],
    datasources: { db: { url: env.DATABASE_URL } },
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
