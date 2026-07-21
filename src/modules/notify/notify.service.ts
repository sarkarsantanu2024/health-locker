import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { isWebPushConfigured, sendWebPush } from "@/lib/webpush";
import { AppError } from "@/shared/errors";
import type { NotificationType } from "@/shared/enums";

/**
 * Notifications — Web Push and in-app only. No email, no SMS.
 *
 * Three rules this module owns, so no caller can get them wrong:
 *
 *  1. **In-app is never suppressed.** A preference or a quiet-hours window can
 *     stop a push (an interruption), but the in-app row is always written. It is
 *     a pull channel: silencing it would lose the notice entirely, and "I was
 *     never told my report was ready" is not an acceptable outcome for health
 *     data. Turning a type off stops the *push*; the record stays.
 *
 *  2. **Delivery failure never fails the caller.** Discharging a patient must not
 *     500 because a browser push endpoint was unreachable. Every channel result
 *     is written to NotificationLog and swallowed.
 *
 *  3. **Idempotency is the caller's key, not a timestamp.** Reminder jobs run on
 *     a cron that may fire twice; passing `dedupeKey` makes a repeat a no-op.
 */

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep-link target and render data. `url` is what the service worker opens. */
  data?: Record<string, unknown>;
  /**
   * Stable identity for this notice. A second send with the same key for the
   * same user is dropped, so an at-least-once job queue stays safe.
   */
  dedupeKey?: string;
  /** Urgent notices ignore quiet hours (drug interactions, account lockouts). */
  urgent?: boolean;
}

export interface NotifyResult {
  notificationId: string | null;
  deduped: boolean;
  pushed: number;
  pushSkippedReason?: "not-configured" | "preference" | "quiet-hours" | "no-subscription";
}

interface ResolvedPreference {
  inApp: boolean;
  webPush: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

/** Defaults when a user has never touched their preferences. */
const DEFAULT_PREFERENCE: ResolvedPreference = {
  inApp: true,
  webPush: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};

/**
 * True when `now` (in the user's timezone) falls inside [start, end).
 * The window wraps midnight — "22:00 to 07:00" is the normal case, and a naive
 * start < end comparison would silently never match it.
 */
export function isWithinQuietHours(
  now: Date,
  start: string | null,
  end: string | null,
  timeZone = "Asia/Kolkata",
): boolean {
  if (!start || !end) return false;

  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  const nowMin = toMinutes(local);
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);

  return startMin <= endMin
    ? nowMin >= startMin && nowMin < endMin
    : nowMin >= startMin || nowMin < endMin;
}

async function resolvePreference(userId: string, type: NotificationType) {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId, type } },
    select: { inApp: true, webPush: true, quietHoursStart: true, quietHoursEnd: true },
  });

  return row ?? DEFAULT_PREFERENCE;
}

/**
 * Creates the in-app notification and fans it out to Web Push.
 * Never throws for a delivery problem — only for a caller mistake.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  if (input.dedupeKey) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        data: { path: ["dedupeKey"], equals: input.dedupeKey },
      },
      select: { id: true },
    });

    if (existing) return { notificationId: existing.id, deduped: true, pushed: 0 };
  }

  const [preference, user] = await Promise.all([
    resolvePreference(input.userId, input.type),
    prisma.user.findFirst({
      where: { id: input.userId, deletedAt: null },
      select: { id: true, timezone: true, status: true },
    }),
  ]);

  // A suspended or deleted account is not somewhere to keep piling notices.
  if (!user || user.status === "SUSPENDED") {
    return { notificationId: null, deduped: false, pushed: 0 };
  }

  const data = {
    ...(input.data ?? {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  };

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data,
    },
    select: { id: true },
  });

  await prisma.notificationLog.create({
    data: {
      notificationId: notification.id,
      channel: "IN_APP",
      status: "SENT",
      sentAt: new Date(),
    },
  });

  const push = await deliverWebPush(notification.id, input, preference, user.timezone);

  return { notificationId: notification.id, deduped: false, ...push };
}

async function deliverWebPush(
  notificationId: string,
  input: NotifyInput,
  preference: ResolvedPreference,
  timeZone: string,
): Promise<{ pushed: number; pushSkippedReason?: NotifyResult["pushSkippedReason"] }> {
  const skip = async (reason: NonNullable<NotifyResult["pushSkippedReason"]>) => {
    await prisma.notificationLog.create({
      data: { notificationId, channel: "WEB_PUSH", status: "SKIPPED", error: reason },
    });
    return { pushed: 0, pushSkippedReason: reason };
  };

  if (!isWebPushConfigured()) return skip("not-configured");
  if (!preference.webPush) return skip("preference");

  if (
    !input.urgent &&
    isWithinQuietHours(new Date(), preference.quietHoursStart, preference.quietHoursEnd, timeZone)
  ) {
    return skip("quiet-hours");
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: input.userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) return skip("no-subscription");

  const payload = {
    title: input.title,
    body: input.body,
    type: input.type,
    url: (input.data?.url as string | undefined) ?? "/notifications",
    notificationId,
  };

  let pushed = 0;
  const expired: string[] = [];

  for (const subscription of subscriptions) {
    const result = await sendWebPush(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
    );

    if (result.ok) pushed += 1;
    if (result.expired) expired.push(subscription.id);

    await prisma.notificationLog.create({
      data: {
        notificationId,
        channel: "WEB_PUSH",
        status: result.ok ? "SENT" : "FAILED",
        sentAt: result.ok ? new Date() : null,
        error: result.ok ? null : `status ${result.statusCode ?? "unknown"}`,
      },
    });
  }

  // A 404/410 means the browser threw the subscription away. Keeping it would
  // guarantee a failed send on every future notice.
  if (expired.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } });
  }

  if (pushed > 0) {
    await prisma.pushSubscription.updateMany({
      where: { userId: input.userId },
      data: { lastUsedAt: new Date() },
    });
  }

  return { pushed };
}

/** Fan-out helper. Failures are per-recipient, so one bad row cannot stop the rest. */
export async function notifyMany(inputs: NotifyInput[]): Promise<number> {
  let delivered = 0;

  for (const input of inputs) {
    try {
      const result = await notify(input);
      if (!result.deduped && result.notificationId) delivered += 1;
    } catch (error) {
      console.error("[notify] failed", { userId: input.userId, type: input.type, error });
    }
  }

  return delivered;
}

/**
 * Notifies the User behind a Patient, if there is one. A patient registered by a
 * clinic may have no account at all — that is not an error, it just means the
 * only channel left is the manual WhatsApp one.
 */
export async function notifyPatient(
  patientId: string,
  input: Omit<NotifyInput, "userId">,
): Promise<NotifyResult | null> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: { userId: true },
  });

  if (!patient?.userId) return null;

  return notify({ ...input, userId: patient.userId });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; take?: number } = {},
): Promise<NotificationView[]> {
  const rows = await prisma.notification.findMany({
    where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.take ?? 50, 200),
    select: { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    url: (row.data as { url?: string } | null)?.url ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  // Scoped by userId in the WHERE, not checked after loading — a caller cannot
  // mark someone else's notice read even by guessing an id.
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    const exists = await prisma.notification.count({ where: { id: notificationId, userId } });
    if (exists === 0) throw new AppError("NOT_FOUND", "Not found.");
  }
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  return result.count;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export interface PreferenceView {
  type: NotificationType;
  inApp: boolean;
  webPush: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export async function getPreferences(
  userId: string,
  types: readonly NotificationType[],
): Promise<PreferenceView[]> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const byType = new Map(rows.map((row) => [row.type, row]));

  return types.map((type) => {
    const row = byType.get(type);
    return {
      type,
      inApp: row?.inApp ?? DEFAULT_PREFERENCE.inApp,
      webPush: row?.webPush ?? DEFAULT_PREFERENCE.webPush,
      quietHoursStart: row?.quietHoursStart ?? null,
      quietHoursEnd: row?.quietHoursEnd ?? null,
    };
  });
}

export async function setPreference(
  userId: string,
  type: NotificationType,
  values: { webPush: boolean; quietHoursStart?: string | null; quietHoursEnd?: string | null },
): Promise<void> {
  await prisma.notificationPreference.upsert({
    where: { userId_type: { userId, type } },
    // inApp is deliberately not writable — see rule 1 at the top of this file.
    create: {
      userId,
      type,
      inApp: true,
      webPush: values.webPush,
      quietHoursStart: values.quietHoursStart ?? null,
      quietHoursEnd: values.quietHoursEnd ?? null,
    },
    update: {
      webPush: values.webPush,
      ...(values.quietHoursStart !== undefined ? { quietHoursStart: values.quietHoursStart } : {}),
      ...(values.quietHoursEnd !== undefined ? { quietHoursEnd: values.quietHoursEnd } : {}),
    },
  });
}

/** Applies one quiet-hours window across every type the user has. */
export async function setQuietHours(
  userId: string,
  types: readonly NotificationType[],
  start: string | null,
  end: string | null,
): Promise<void> {
  for (const type of types) {
    await prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, quietHoursStart: start, quietHoursEnd: end },
      update: { quietHoursStart: start, quietHoursEnd: end },
    });
  }
}

// ---------------------------------------------------------------------------
// Push subscriptions
// ---------------------------------------------------------------------------

export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null,
): Promise<void> {
  // Upsert on endpoint: the same browser re-subscribing must not accumulate
  // duplicates, and an endpoint that moved to another account must follow it.
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
    },
    update: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
      lastUsedAt: new Date(),
    },
  });

  await audit({
    action: "push-subscription:created",
    entityType: "PushSubscription",
    actorId: userId,
    metadata: { userAgent },
  });
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });

  await audit({
    action: "push-subscription:deleted",
    entityType: "PushSubscription",
    actorId: userId,
  });
}

export async function countPushSubscriptions(userId: string): Promise<number> {
  return prisma.pushSubscription.count({ where: { userId } });
}

// ---------------------------------------------------------------------------
// WhatsApp — sent by hand until an adapter exists
// ---------------------------------------------------------------------------

/**
 * Builds the text and the `wa.me` link an operator opens to send a message by
 * hand. The NotificationLog row it produces has the same shape a real adapter
 * would write, which is what makes automating this later a drop-in change
 * rather than a migration.
 */
export function whatsappLink(phone: string, message: string): string {
  // wa.me wants a bare international number: no +, no spaces, no dashes.
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 10 ? `91${digits}` : digits;

  return `https://wa.me/${national}?text=${encodeURIComponent(message)}`;
}

export async function recordWhatsappCopy(
  notificationId: string | null,
  copiedById: string,
): Promise<void> {
  await prisma.notificationLog.create({
    data: {
      notificationId,
      channel: "WHATSAPP_MANUAL",
      status: "COPIED",
      copiedById,
      sentAt: new Date(),
    },
  });
}
