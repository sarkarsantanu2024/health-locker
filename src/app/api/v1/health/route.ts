import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isR2Configured } from "@/lib/r2";
import { isQStashConfigured, isRedisConfigured } from "@/lib/upstash";
import { isWebPushConfigured } from "@/lib/webpush";
import { errorBody } from "@/shared/errors";

// Prisma needs the Node runtime; never statically cache a health check.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    // A real round-trip to Neon, not just a client instantiation.
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      app: env.APP_NAME,
      env: env.NODE_ENV,
      db: { status: "ok", latencyMs: Date.now() - startedAt },
      // Optional services report configured/not-configured, never healthy/unhealthy:
      // they are unset by design in local and pre-Phase-4 environments.
      services: {
        redis: isRedisConfigured() ? "configured" : "not-configured",
        qstash: isQStashConfigured() ? "configured" : "not-configured",
        storage: isR2Configured() ? "configured" : "not-configured",
        webPush: isWebPushConfigured() ? "configured" : "not-configured",
        ai: env.AI_PROVIDER,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      errorBody("SERVICE_UNAVAILABLE", "Database is unreachable.", {
        cause: (error as Error).message,
      }),
      { status: 503 },
    );
  }
}
