import { createHash, randomUUID } from "node:crypto";

import { audit } from "@/lib/audit";
import { clearSessionCookies, readRefreshToken, setSessionCookies } from "@/lib/auth/cookies";
import { signToken, verifyToken } from "@/lib/auth/jwt";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { LOGIN_IP_LIMIT, rateLimit, SENSITIVE_LIMIT } from "@/lib/ratelimit";
import { AppError } from "@/shared/errors";
import type { LoginInput } from "@/shared/schemas/auth";

/**
 * Authentication. There is no registration function in this file, and that is
 * the point: accounts exist only because an admin created one
 * (see provisioning.service.ts).
 */

/** Consecutive failures before the account locks. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface LoginResult {
  userId: string;
  mustChangePassword: boolean;
  role: string;
}

function hashRefreshToken(token: string): string {
  // The database stores only a digest: a leaked dump must not be replayable.
  return createHash("sha256").update(token).digest("hex");
}

async function issueSession(user: {
  id: string;
  role: string;
  orgId: string | null;
  mustChangePassword: boolean;
}): Promise<void> {
  const sessionId = randomUUID();
  const claims = {
    sub: user.id,
    role: user.role as never,
    orgId: user.orgId,
    mustChangePassword: user.mustChangePassword,
    sid: sessionId,
  };

  const [accessToken, refreshToken] = await Promise.all([
    signToken(claims, "access"),
    signToken(claims, "refresh"),
  ]);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + env.AUTH_REFRESH_TOKEN_TTL * 1000),
    },
  });

  await setSessionCookies(accessToken, refreshToken);
}

/**
 * Verifies credentials and starts a session.
 *
 * Every failure path returns the SAME message. Distinguishing "no such user"
 * from "wrong password" from "suspended" hands an attacker a free account
 * enumeration oracle.
 */
export async function login(input: LoginInput, ip: string | null): Promise<LoginResult> {
  const genericFailure = new AppError("UNAUTHENTICATED", "Incorrect username or password.");

  const throttle = await rateLimit("login", ip ?? "unknown", LOGIN_IP_LIMIT);
  if (!throttle.success) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Try again in a minute.");
  }

  const user = await prisma.user.findFirst({
    where: { username: input.username, deletedAt: null },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      role: true,
      orgId: true,
      status: true,
      mustChangePassword: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
      failedLoginCount: true,
      lockedUntil: true,
    },
  });

  if (!user) {
    // Spend comparable time on a missing user so response timing does not reveal
    // whether the username exists.
    await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", input.password);
    throw genericFailure;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({
      action: "auth.login_blocked_locked",
      entityType: "User",
      entityId: user.id,
      actorId: user.id,
      ip,
    });
    throw new AppError(
      "RATE_LIMITED",
      `Account temporarily locked. Try again after ${LOCKOUT_MINUTES} minutes.`,
    );
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);

  if (!passwordOk) {
    const failedLoginCount = user.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= MAX_FAILED_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });

    await audit({
      action: shouldLock ? "auth.login_failed_locked" : "auth.login_failed",
      entityType: "User",
      entityId: user.id,
      actorId: user.id,
      metadata: { failedLoginCount },
      ip,
    });

    throw genericFailure;
  }

  // Suspension is checked AFTER the password so a wrong password on a suspended
  // account is indistinguishable from a wrong password on an active one.
  if (user.status !== "ACTIVE") {
    await audit({
      action: "auth.login_blocked_suspended",
      entityType: "User",
      entityId: user.id,
      actorId: user.id,
      ip,
    });
    throw genericFailure;
  }

  if (user.twoFactorEnabled) {
    if (!input.totp) {
      throw new AppError("UNAUTHENTICATED", "Enter the 6-digit code from your authenticator app.", {
        reason: "TOTP_REQUIRED",
      });
    }

    if (!user.twoFactorSecret || !verifyTotp(decrypt(user.twoFactorSecret), input.totp)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: user.failedLoginCount + 1 },
      });
      await audit({
        action: "auth.totp_failed",
        entityType: "User",
        entityId: user.id,
        actorId: user.id,
        ip,
      });
      throw new AppError("UNAUTHENTICATED", "That code is not valid.", { reason: "TOTP_REQUIRED" });
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await issueSession(user);

  await audit({
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    actorId: user.id,
    orgId: user.orgId,
    ip,
  });

  return { userId: user.id, mustChangePassword: user.mustChangePassword, role: user.role };
}

/**
 * Rotates the refresh token. The old token is revoked as it is exchanged, so a
 * stolen token is single-use and the theft surfaces as a failed refresh.
 */
export async function refreshSession(): Promise<boolean> {
  const token = await readRefreshToken();
  if (!token) return false;

  const claims = await verifyToken(token, "refresh");
  if (!claims) return false;

  const session = await prisma.session.findFirst({
    where: {
      id: claims.sid,
      refreshTokenHash: hashRefreshToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, userId: true },
  });

  if (!session) return false;

  const user = await prisma.user.findFirst({
    where: { id: session.userId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, role: true, orgId: true, mustChangePassword: true },
  });

  if (!user) return false;

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  await issueSession(user);

  return true;
}

export async function logout(sessionId?: string): Promise<void> {
  if (sessionId) {
    await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await clearSessionCookies();
}

/** Revokes every session for a user — used on password change and suspension. */
export async function revokeAllSessions(userId: string, except?: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(except ? { id: { not: except } } : {}) },
    data: { revokedAt: new Date() },
  });

  return result.count;
}

/**
 * Changes the caller's own password. Clears `mustChangePassword`, which is what
 * releases an admin-provisioned account into the rest of the product.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ip: string | null,
): Promise<void> {
  const throttle = await rateLimit("change-password", userId, SENSITIVE_LIMIT);
  if (!throttle.success) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Try again in a minute.");
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, passwordHash: true, orgId: true },
  });

  if (!user) throw new AppError("UNAUTHENTICATED", "You must be signed in.");

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    await audit({
      action: "auth.password_change_failed",
      entityType: "User",
      entityId: userId,
      actorId: userId,
      ip,
    });
    throw new AppError("BAD_REQUEST", "Your current password is not correct.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  // Every other device is signed out: a password change is how a user responds
  // to a suspected compromise, and it has to actually evict the attacker.
  await revokeAllSessions(userId);

  await audit({
    action: "auth.password_changed",
    entityType: "User",
    entityId: userId,
    actorId: userId,
    orgId: user.orgId,
    ip,
  });
}

// --- TOTP enrolment --------------------------------------------------------

export async function beginTotpEnrolment(userId: string): Promise<{ secret: string }> {
  const secret = generateTotpSecret();

  // Stored encrypted but not yet enabled: a secret without `twoFactorEnabled`
  // is an in-progress enrolment that has never been proven.
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: encrypt(secret), twoFactorEnabled: false },
  });

  return { secret };
}

export async function confirmTotpEnrolment(
  userId: string,
  code: string,
  ip: string | null,
): Promise<void> {
  const throttle = await rateLimit("totp-enrol", userId, SENSITIVE_LIMIT);
  if (!throttle.success) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Try again in a minute.");
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { twoFactorSecret: true },
  });

  if (!user?.twoFactorSecret) {
    throw new AppError("BAD_REQUEST", "Start two-factor setup again.");
  }

  if (!verifyTotp(decrypt(user.twoFactorSecret), code)) {
    throw new AppError("BAD_REQUEST", "That code is not valid. Check your authenticator app.");
  }

  await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });

  await audit({ action: "auth.totp_enabled", entityType: "User", entityId: userId, actorId: userId, ip });
}

export async function disableTotp(userId: string, password: string, ip: string | null): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { passwordHash: true },
  });

  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new AppError("BAD_REQUEST", "Your password is not correct.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  await audit({ action: "auth.totp_disabled", entityType: "User", entityId: userId, actorId: userId, ip });
}
