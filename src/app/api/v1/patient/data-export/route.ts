import { NextResponse } from "next/server";

import { getPatientContext } from "@/modules/patient/context";
import { exportPatientData } from "@/modules/patient/privacy.service";
import { rateLimit } from "@/lib/ratelimit";
import { AppError, errorBody } from "@/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DPDP data portability: everything we hold about you, as JSON.
 *
 * Takes no patient id. It exports whichever record the session is acting for,
 * exactly like the PDF export — an id in the URL would invite enumeration, and
 * this endpoint returns considerably more than the PDF does.
 *
 * Throttled per user: assembling one of these is ~15 queries across every
 * clinical table, and it is the single most expensive read in the product.
 */
export async function GET() {
  try {
    const context = await getPatientContext();

    const throttle = await rateLimit("data-export", context.user.id, { tokens: 5, window: "1 h" });

    if (!throttle.success) {
      throw new AppError("RATE_LIMITED", "Too many exports. Please try again in an hour.");
    }

    const data = await exportPatientData(context.patientId, context.user.id);

    const filename = `healthlocker-${context.patientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${
      new Date().toISOString().slice(0, 10)
    }.json`;

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toBody(), { status: error.status });
    }

    console.error("[data-export] failed", error);
    return NextResponse.json(errorBody("INTERNAL", "Could not build your export."), { status: 500 });
  }
}
