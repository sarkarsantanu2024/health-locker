import { NextResponse } from "next/server";

import { refreshSession } from "@/modules/identity/auth.service";
import { errorBody } from "@/shared/errors";

// Prisma + argon2 need the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchanges the refresh cookie for a new session pair. The refresh cookie is
 * scoped to /api/v1/auth, so it is only ever sent here.
 */
export async function POST() {
  const ok = await refreshSession();

  if (!ok) {
    return NextResponse.json(
      errorBody("UNAUTHENTICATED", "Your session has expired. Please sign in again."),
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
