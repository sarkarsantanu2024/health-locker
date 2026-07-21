import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { isWebPushConfigured } from "@/lib/webpush";
import { deletePushSubscription, savePushSubscription } from "@/modules/notify/notify.service";
import { AppError, errorBody } from "@/shared/errors";
import { pushSubscriptionSchema } from "@/shared/schemas/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registers (POST) and removes (DELETE) a browser's Web Push subscription.
 *
 * The endpoint URL identifies the browser install, not the user, so it is stored
 * against whoever is signed in when it is registered — and re-registering moves
 * it, which is what stops a shared machine pushing one person's medicine
 * reminders to the next person who signs in.
 */
function handle(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(error.toBody(), { status: error.status });
  }

  console.error("[push] subscription request failed", error);
  return NextResponse.json(errorBody("INTERNAL", "Could not save that subscription."), {
    status: 500,
  });
}

export async function POST(request: Request) {
  try {
    if (!isWebPushConfigured()) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "Push notifications are not configured on this deployment.",
      );
    }

    const user = await requireUser();
    const parsed = pushSubscriptionSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", "That is not a valid push subscription.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    await savePushSubscription(user.id, parsed.data, request.headers.get("user-agent"));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { endpoint?: unknown };

    if (typeof body.endpoint !== "string" || body.endpoint.length === 0) {
      throw new AppError("BAD_REQUEST", "An endpoint is required.");
    }

    await deletePushSubscription(user.id, body.endpoint);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
