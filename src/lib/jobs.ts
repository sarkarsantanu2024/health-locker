import { env } from "@/lib/env";
import { getQStash, getQStashReceiver, isQStashConfigured } from "@/lib/upstash";
import { AppError } from "@/shared/errors";

/**
 * Authentication for `/api/jobs/*`.
 *
 * These routes are public URLs on the internet with no session, so this check is
 * the only thing protecting them. Two callers are accepted:
 *
 *   - **QStash**, verified by its `Upstash-Signature` header over the raw body.
 *   - **Vercel Cron**, which cannot sign, so it presents `CRON_SECRET` as a
 *     bearer token compared in constant time.
 *
 * If neither is configured the route refuses outright rather than running
 * unauthenticated — an open job endpoint that fans out notifications is a
 * spam cannon.
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);

  return diff === 0;
}

export type JobCaller = "qstash" | "cron";

/**
 * Verifies the request and returns the raw body, which the caller should parse
 * itself — the signature covers the exact bytes, so re-reading the stream after
 * `request.json()` would not be possible.
 */
export async function authenticateJob(request: Request): Promise<{ caller: JobCaller; body: string }> {
  const body = await request.text();

  const signature = request.headers.get("upstash-signature");

  if (signature && isQStashConfigured()) {
    const valid = await getQStashReceiver().verify({
      signature,
      body,
      url: request.url,
    });

    if (!valid) throw new AppError("UNAUTHENTICATED", "Invalid job signature.");

    return { caller: "qstash", body };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (env.CRON_SECRET && bearer && timingSafeEqual(bearer, env.CRON_SECRET)) {
    return { caller: "cron", body };
  }

  throw new AppError(
    "UNAUTHENTICATED",
    "This endpoint accepts signed QStash deliveries or an authorised cron call only.",
  );
}

/**
 * Enqueues background work. Falls back to running it inline when QStash is not
 * configured, so local development and CI behave the same as production without
 * needing credentials — the trade-off being that the caller waits for it.
 */
export async function enqueueJob(
  path: `/api/jobs/${string}`,
  payload: Record<string, unknown>,
  options: { delaySeconds?: number } = {},
): Promise<{ queued: boolean; messageId?: string }> {
  if (!isQStashConfigured()) return { queued: false };

  const response = await getQStash().publishJSON({
    url: `${env.APP_URL}${path}`,
    body: payload,
    ...(options.delaySeconds ? { delay: options.delaySeconds } : {}),
  });

  return { queued: true, messageId: response.messageId };
}
