import { headers } from "next/headers";

import { prisma } from "@/lib/db";

/**
 * Append-only audit trail. Every create/update/delete of medical or financial
 * data goes through here, as does every read of a medical record.
 *
 * Two rules this module enforces so callers cannot get them wrong:
 *   1. Writing an audit row must never break the operation being audited — a
 *      failure here is logged, not thrown. Losing one trail row is bad; failing
 *      a discharge because the logger hiccuped is worse.
 *   2. Metadata is redacted. Anything that looks like a credential is stripped
 *      before it reaches the database.
 */

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  orgId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Keys whose values are never written to the trail, at any nesting depth. */
const REDACTED_KEYS = [
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "temporarypassword",
  "temppassword",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "twofactorsecret",
  "totp",
  "authorization",
  "cookie",
  "apikey",
];

const REDACTED = "[redacted]";

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.includes(key.toLowerCase()) ? REDACTED : redact(val, depth + 1);
    }

    return out;
  }

  return value;
}

/** Best-effort request context. Returns nulls outside a request scope (CLI, jobs). */
async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const headerList = await headers();
    // Vercel sets x-forwarded-for; the first entry is the client.
    const forwarded = headerList.get("x-forwarded-for");

    return {
      ip: forwarded?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? null,
      userAgent: headerList.get("user-agent") ?? null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const context = entry.ip !== undefined || entry.userAgent !== undefined
      ? { ip: entry.ip ?? null, userAgent: entry.userAgent ?? null }
      : await requestContext();

    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        actorId: entry.actorId ?? null,
        orgId: entry.orgId ?? null,
        metadata: entry.metadata ? (redact(entry.metadata) as object) : undefined,
        ip: context.ip,
        userAgent: context.userAgent,
      },
    });
  } catch (error) {
    // Never let auditing break the audited operation. Surfaced in logs so a
    // persistently failing trail is still noticed.
    console.error("[audit] failed to write entry", { action: entry.action, error });
  }
}

/**
 * Records that someone READ a medical record. Separate from `audit()` only to
 * make the call sites greppable — access logging is a compliance requirement,
 * not an afterthought.
 */
export async function auditRead(
  entry: Omit<AuditEntry, "action"> & { action?: string },
): Promise<void> {
  await audit({ ...entry, action: entry.action ?? `${entry.entityType.toLowerCase()}:read` });
}
