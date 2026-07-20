import webpush, { type PushSubscription } from "web-push";

import { env, requireWebPushEnv } from "@/lib/env";

/**
 * Web Push (VAPID) — one of the two automated notification channels in the MVP
 * (the other is in-app). No email, no SMS. See Section 0.
 *
 * Generate a key pair with: `pnpm dlx web-push generate-vapid-keys`
 */

let configured = false;

function ensureConfigured(): void {
  if (configured) return;

  const cfg = requireWebPushEnv();
  webpush.setVapidDetails(cfg.VAPID_SUBJECT, cfg.VAPID_PUBLIC_KEY, cfg.VAPID_PRIVATE_KEY);
  configured = true;
}

export function isWebPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export interface WebPushResult {
  ok: boolean;
  /** True when the endpoint is gone (404/410) and the subscription should be deleted. */
  expired: boolean;
  statusCode?: number;
}

export async function sendWebPush(
  subscription: PushSubscription,
  payload: Record<string, unknown>,
): Promise<WebPushResult> {
  ensureConfigured();

  try {
    const res = await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true, expired: false, statusCode: res.statusCode };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    return { ok: false, expired: statusCode === 404 || statusCode === 410, statusCode };
  }
}

export type { PushSubscription };
