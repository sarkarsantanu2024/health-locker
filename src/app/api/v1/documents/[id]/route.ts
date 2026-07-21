import { NextResponse } from "next/server";

import { auditRead } from "@/lib/audit";
import { getSession, hasPermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { assertCanReadPatient } from "@/modules/patient/context";
import { AppError, errorBody } from "@/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves an uploaded document to someone entitled to see it.
 *
 * Authorization is explicit and layered, because a document id in a URL is
 * attacker-controlled:
 *   - platform staff with `document:read` may view any document (that is what
 *     verifying a payment screenshot requires);
 *   - provider staff may view documents belonging to their own tenant;
 *   - a patient may view their own, or a linked family member's.
 * Everything else is NOT_FOUND, never FORBIDDEN — confirming a document exists
 * is itself a disclosure.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session) {
      return NextResponse.json(errorBody("UNAUTHENTICATED", "Sign in first."), { status: 401 });
    }

    const document = await prisma.document.findFirst({
      where: { id, deletedAt: null, status: { in: ["UPLOADED", "PROCESSING", "PROCESSED"] } },
      select: {
        id: true,
        storageKey: true,
        mimeType: true,
        fileName: true,
        patientId: true,
        orgId: true,
        uploadedById: true,
      },
    });

    if (!document) throw new AppError("NOT_FOUND", "Not found.");

    const isPlatformReviewer =
      hasPermission(session, "payment:verify") || hasPermission(session, "audit:read");
    const isOwnUpload = document.uploadedById === session.id;
    const isSameTenant = Boolean(document.orgId && session.orgId && document.orgId === session.orgId);

    let allowed = isPlatformReviewer || isOwnUpload || isSameTenant;

    if (!allowed && document.patientId) {
      // Throws NOT_FOUND when the caller has no link to that patient.
      await assertCanReadPatient(document.patientId);
      allowed = true;
    }

    if (!allowed) throw new AppError("NOT_FOUND", "Not found.");

    const object = await getObject(document.id, document.storageKey, document.mimeType);

    await auditRead({
      action: "document.viewed",
      entityType: "Document",
      entityId: document.id,
      actorId: session.id,
      orgId: document.orgId,
    });

    // R2 hands back a short-lived presigned URL; the fallback streams bytes.
    if (object.url) return NextResponse.redirect(object.url);

    return new NextResponse(new Uint8Array(object.bytes!), {
      headers: {
        "Content-Type": object.contentType,
        // inline so a reviewer sees the screenshot without downloading it.
        "Content-Disposition": `inline; filename="${document.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toBody(), { status: error.status });
    }

    console.error("[document] failed to serve", error);
    return NextResponse.json(errorBody("INTERNAL", "Could not load that document."), { status: 500 });
  }
}
