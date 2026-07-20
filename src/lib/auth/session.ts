import { cache } from "react";

import { readAccessToken } from "@/lib/auth/cookies";
import { verifyToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db";
import { AppError } from "@/shared/errors";
import { CONSUMER_ROLES, PLATFORM_ROLES, type Role } from "@/shared/enums";
import { ROLE_PERMISSIONS, type PermissionKey } from "@/shared/permissions";

/**
 * Session resolution and the authorization guards every route handler and server
 * action must pass through: authenticated → tenant-scoped → permission-checked.
 *
 * Authorization is DENY-BY-DEFAULT. A caller that forgets a guard gets nothing
 * useful, because the guards — not the queries — are what return the org id.
 */

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  orgId: string | null;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  sessionId: string;
  permissions: readonly PermissionKey[];
}

/**
 * Reads the session for the current request.
 *
 * The JWT is verified first (cheap, no I/O), then the user is re-read from the
 * database. That second step is deliberate: a token stays valid until it expires,
 * so without it a suspended or deleted user would keep their access until the
 * access token aged out. Wrapped in React `cache` so it runs once per request
 * however many guards call it.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = await readAccessToken();
  if (!token) return null;

  const claims = await verifyToken(token, "access");
  if (!claims) return null;

  const [user, session] = await Promise.all([
    prisma.user.findFirst({
      where: { id: claims.sub, deletedAt: null },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        orgId: true,
        status: true,
        mustChangePassword: true,
        twoFactorEnabled: true,
      },
    }),
    prisma.session.findFirst({
      where: { id: claims.sid, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
  ]);

  // Suspended, soft-deleted, or the session was revoked by an admin.
  if (!user || user.status !== "ACTIVE" || !session) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    orgId: user.orgId,
    mustChangePassword: user.mustChangePassword,
    twoFactorEnabled: user.twoFactorEnabled,
    sessionId: session.id,
    permissions: ROLE_PERMISSIONS[user.role],
  };
});

/** Authenticated, and past the forced first-login password change. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();

  if (!session) {
    throw new AppError("UNAUTHENTICATED", "You must be signed in.");
  }

  // An admin-provisioned account can do exactly one thing until it rotates its
  // temporary password: change that password.
  if (session.mustChangePassword) {
    throw new AppError("FORBIDDEN", "You must change your password before continuing.", {
      reason: "PASSWORD_CHANGE_REQUIRED",
    });
  }

  return session;
}

/** Authenticated only — used by the change-password flow itself. */
export async function requireAuthenticated(): Promise<SessionUser> {
  const session = await getSession();

  if (!session) throw new AppError("UNAUTHENTICATED", "You must be signed in.");

  return session;
}

/**
 * Returns the caller's tenant id. This is the ONLY sanctioned source of `orgId`
 * for a query — never accept one from the client, or a caller can read any
 * tenant by changing a parameter.
 */
export async function requireTenant(): Promise<{ user: SessionUser; orgId: string }> {
  const user = await requireUser();

  if (!user.orgId) {
    throw new AppError("FORBIDDEN", "This action requires a provider account.");
  }

  return { user, orgId: user.orgId };
}

export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireUser();

  if (!user.permissions.includes(permission)) {
    throw new AppError("FORBIDDEN", "You do not have permission to do that.", { permission });
  }

  return user;
}

/** Tenant scope and a permission in one call — the common provider-side case. */
export async function requireTenantPermission(
  permission: PermissionKey,
): Promise<{ user: SessionUser; orgId: string }> {
  const { user, orgId } = await requireTenant();

  if (!user.permissions.includes(permission)) {
    throw new AppError("FORBIDDEN", "You do not have permission to do that.", { permission });
  }

  return { user, orgId };
}

/**
 * Asserts a row belongs to the caller's tenant. Call this after loading any
 * record fetched by id — an id from a URL is attacker-controlled.
 */
export function assertSameTenant(rowOrgId: string | null | undefined, orgId: string): void {
  if (rowOrgId !== orgId) {
    // Deliberately NOT_FOUND, not FORBIDDEN: telling an attacker that a record
    // exists in another tenant is itself a disclosure.
    throw new AppError("NOT_FOUND", "Not found.");
  }
}

export function hasPermission(user: SessionUser, permission: PermissionKey): boolean {
  return user.permissions.includes(permission);
}

export function isPlatformRole(role: Role): boolean {
  return PLATFORM_ROLES.includes(role);
}

export function isConsumerRole(role: Role): boolean {
  return CONSUMER_ROLES.includes(role);
}
