"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import {
  markAllRead,
  markRead,
  setPreference,
  setQuietHours,
} from "@/modules/notify/notify.service";
import { notificationTypesForRole } from "@/modules/notify/catalog";
import { AppError } from "@/shared/errors";
import { markReadSchema, preferenceSchema, quietHoursSchema } from "@/shared/schemas/notify";

export interface NotifyActionState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
}

function toState(error: unknown): NotifyActionState {
  if (error instanceof AppError) return { ok: false, error: error.message };

  console.error("[notify action] unexpected error", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function markReadAction(
  _prev: NotifyActionState,
  formData: FormData,
): Promise<NotifyActionState> {
  const parsed = markReadSchema.safeParse({ notificationId: formData.get("notificationId") });

  if (!parsed.success) return { ok: false, error: "Could not identify that notification." };

  try {
    const user = await requireUser();
    await markRead(user.id, parsed.data.notificationId);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllReadAction(
  _prev: NotifyActionState,
  _formData: FormData,
): Promise<NotifyActionState> {
  let count: number;

  try {
    const user = await requireUser();
    count = await markAllRead(user.id);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/notifications");
  return { ok: true, message: count === 0 ? "Nothing unread." : `Marked ${count} as read.` };
}

export async function setPreferenceAction(
  _prev: NotifyActionState,
  formData: FormData,
): Promise<NotifyActionState> {
  const parsed = preferenceSchema.safeParse({
    type: formData.get("type"),
    webPush: formData.get("webPush") ?? "",
  });

  if (!parsed.success) return { ok: false, error: "That notification type is not recognised." };

  try {
    const user = await requireUser();

    // A user may only set preferences for types their role can actually receive.
    if (!notificationTypesForRole(user.role).includes(parsed.data.type)) {
      throw new AppError("FORBIDDEN", "That notification type does not apply to your account.");
    }

    await setPreference(user.id, parsed.data.type, { webPush: parsed.data.webPush });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/notifications/settings");
  return { ok: true, message: "Saved." };
}

export async function setQuietHoursAction(
  _prev: NotifyActionState,
  formData: FormData,
): Promise<NotifyActionState> {
  const parsed = quietHoursSchema.safeParse({
    start: formData.get("start") ?? "",
    end: formData.get("end") ?? "",
  });

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const user = await requireUser();
    await setQuietHours(user.id, notificationTypesForRole(user.role), parsed.data.start, parsed.data.end);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/notifications/settings");
  return {
    ok: true,
    message: parsed.data.start
      ? `Pushes are silenced between ${parsed.data.start} and ${parsed.data.end}. In-app notices still arrive.`
      : "Quiet hours cleared.",
  };
}
