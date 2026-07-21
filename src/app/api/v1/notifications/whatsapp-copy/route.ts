import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { recordWhatsappCopy } from "@/modules/notify/notify.service";
import { AppError, errorBody } from "@/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records that an operator opened WhatsApp to send a message by hand.
 *
 * This exists so the delivery trail is complete even for the manual channel: a
 * NotificationLog row with `WHATSAPP_MANUAL` / `COPIED` is written here, and an
 * automated adapter would later write the same row with `SENT`. Nothing about
 * the schema or the queries has to change when the adapter arrives.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { notificationId?: unknown };

    const notificationId =
      typeof body.notificationId === "string" && body.notificationId.length > 0
        ? body.notificationId
        : null;

    await recordWhatsappCopy(notificationId, user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toBody(), { status: error.status });
    }

    console.error("[whatsapp-copy] failed", error);
    return NextResponse.json(errorBody("INTERNAL", "Could not record that."), { status: 500 });
  }
}
