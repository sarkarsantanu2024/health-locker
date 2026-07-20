import { NextResponse } from "next/server";

import { auditRead } from "@/lib/audit";
import { getPatientContext } from "@/modules/patient/context";
import { renderHealthRecordPdf } from "@/modules/patient/export.pdf";
import { getProfile } from "@/modules/patient/patient.service";
import { getTimeline, TIMELINE_KINDS, type TimelineKind } from "@/modules/patient/timeline.service";
import { BLOOD_GROUP_LABELS, type BloodGroup } from "@/shared/enums";
import { errorBody } from "@/shared/errors";
import { AppError } from "@/shared/errors";

// @react-pdf/renderer needs Node; the export must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Downloads the acting patient's record as a PDF.
 *
 * Note there is no patient id in the URL: the record exported is whichever one
 * the session is currently acting for. An id here would be an invitation to
 * enumerate.
 */
export async function GET(request: Request) {
  try {
    const context = await getPatientContext();
    const url = new URL(request.url);

    const requestedKinds = url.searchParams
      .getAll("kind")
      .filter((k): k is TimelineKind => (TIMELINE_KINDS as readonly string[]).includes(k));

    const [profile, entries] = await Promise.all([
      getProfile(context.patientId, context.user.id),
      getTimeline(context.patientId, {
        kinds: requestedKinds.length ? requestedKinds : undefined,
        limit: 1000,
      }),
    ]);

    const pdf = await renderHealthRecordPdf(
      {
        fullName: profile.fullName,
        dateOfBirth: profile.dateOfBirth,
        gender: profile.gender,
        bloodGroup: BLOOD_GROUP_LABELS[profile.bloodGroup as BloodGroup],
        phone: profile.phone,
        city: profile.city,
        emergencyContactName: profile.emergencyContactName,
        emergencyContactPhone: profile.emergencyContactPhone,
      },
      entries,
    );

    // Exporting an entire medical history off-platform is exactly the kind of
    // bulk read a compliance review will ask about.
    await auditRead({
      action: "patient.exported",
      entityType: "Patient",
      entityId: context.patientId,
      actorId: context.user.id,
      metadata: { entryCount: entries.length, kinds: requestedKinds },
    });

    const safeName = profile.fullName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
    const filename = `healthlocker-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toBody(), { status: error.status });
    }

    console.error("[patient export] failed", error);
    return NextResponse.json(errorBody("INTERNAL", "Could not generate the export."), {
      status: 500,
    });
  }
}
