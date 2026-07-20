import { audit } from "@/lib/audit";
import { generateTemporaryPassword, hashPassword, suggestUsername } from "@/lib/auth/password";
import { revokeAllSessions } from "@/modules/identity/auth.service";
import { prisma } from "@/lib/db";
import { AppError } from "@/shared/errors";
import { CONSUMER_ROLES, ORG_TYPE_BY_ROLE, PLATFORM_ROLES, type Role } from "@/shared/enums";
import type { CreateUserInput } from "@/shared/schemas/auth";

/**
 * Admin-side account provisioning — the ONLY way a user comes into existence.
 *
 * Every function that mints a credential returns it exactly once, in memory, for
 * the admin to copy and hand over out-of-band (WhatsApp/call). Nothing is
 * emailed, nothing is stored in clear, and the plaintext is never audited.
 *
 * Phase 11 builds the console on top of this; Phase 6 calls `createUser` when a
 * manual payment against an AccessRequest is approved.
 */

export interface ProvisionedCredentials {
  userId: string;
  username: string;
  /** Plaintext, shown once. Never persisted, never logged, never audited. */
  temporaryPassword: string;
}

/** Finds a free username, starting from a suggestion derived from the name. */
async function resolveUsername(desired: string | undefined, displayName: string): Promise<string> {
  if (desired) {
    const taken = await prisma.user.findUnique({ where: { username: desired } });
    if (taken) throw new AppError("CONFLICT", `The username "${desired}" is already taken.`);
    return desired;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = suggestUsername(displayName);
    const taken = await prisma.user.findUnique({ where: { username: candidate } });
    if (!taken) return candidate;
  }

  throw new AppError("INTERNAL", "Could not generate a unique username. Try specifying one.");
}

/**
 * Validates the role↔tenant relationship. A provider role without an org would
 * be a user no tenant guard can scope, and a patient WITH an org would silently
 * gain access to that tenant's data.
 */
async function validateOrgForRole(role: Role, orgId: string | undefined): Promise<string | null> {
  const isConsumer = CONSUMER_ROLES.includes(role);
  const isPlatform = PLATFORM_ROLES.includes(role);

  if (isConsumer || isPlatform) {
    if (orgId) {
      throw new AppError("BAD_REQUEST", `${role} accounts are not attached to an organization.`);
    }
    return null;
  }

  if (!orgId) {
    throw new AppError("BAD_REQUEST", `${role} requires an organization.`);
  }

  const org = await prisma.organization.findFirst({
    where: { id: orgId, deletedAt: null },
    select: { id: true, type: true },
  });

  if (!org) throw new AppError("NOT_FOUND", "That organization does not exist.");

  const expectedType = ORG_TYPE_BY_ROLE[role];
  if (expectedType && org.type !== expectedType) {
    throw new AppError(
      "BAD_REQUEST",
      `${role} belongs to a ${expectedType} organization, but that one is a ${org.type}.`,
    );
  }

  return org.id;
}

export async function createUser(
  input: CreateUserInput,
  actorId: string,
): Promise<ProvisionedCredentials> {
  const orgId = await validateOrgForRole(input.role, input.orgId || undefined);
  const username = await resolveUsername(input.username || undefined, input.displayName);
  const temporaryPassword = generateTemporaryPassword();

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(temporaryPassword),
      displayName: input.displayName,
      phone: input.phone || null,
      role: input.role,
      orgId,
      // The whole point: the admin's temporary password is single-use.
      mustChangePassword: true,
      status: "ACTIVE",
    },
    select: { id: true, username: true },
  });

  // A PATIENT account gets a Patient record so it has somewhere to put data.
  if (input.role === "PATIENT") {
    await prisma.patient.create({
      data: { userId: user.id, fullName: input.displayName, phone: input.phone || null },
    });
  }

  if (input.accessRequestId) {
    await prisma.accessRequest.update({
      where: { id: input.accessRequestId },
      data: { status: "PROVISIONED", provisionedUserId: user.id },
    });
  }

  if (input.planId) {
    const patient = input.role === "PATIENT"
      ? await prisma.patient.findUnique({ where: { userId: user.id }, select: { id: true } })
      : null;

    await prisma.subscription.create({
      data: {
        planId: input.planId,
        patientId: patient?.id ?? null,
        orgId: patient ? null : orgId,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });
  }

  await audit({
    action: "user.created",
    entityType: "User",
    entityId: user.id,
    actorId,
    orgId,
    // Note the absence of the password. Auditing a credential defeats it.
    metadata: { username: user.username, role: input.role, viaAccessRequest: input.accessRequestId || null },
  });

  return { userId: user.id, username: user.username, temporaryPassword };
}

/**
 * Admin password reset. This is the ONLY reset path — there is no "forgot
 * password" email flow anywhere in the product.
 */
export async function resetPassword(
  userId: string,
  actorId: string,
  reason?: string,
): Promise<ProvisionedCredentials> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, username: true, orgId: true },
  });

  if (!user) throw new AppError("NOT_FOUND", "That user does not exist.");

  const temporaryPassword = generateTemporaryPassword();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  // Anyone holding a session under the old password loses it immediately —
  // a reset is often the response to a compromise.
  await revokeAllSessions(user.id);

  await audit({
    action: "user.password_reset",
    entityType: "User",
    entityId: user.id,
    actorId,
    orgId: user.orgId,
    metadata: { username: user.username, reason: reason || null },
  });

  return { userId: user.id, username: user.username, temporaryPassword };
}

export async function setUserActive(
  userId: string,
  active: boolean,
  actorId: string,
  reason?: string,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, username: true, role: true, orgId: true, status: true },
  });

  if (!user) throw new AppError("NOT_FOUND", "That user does not exist.");

  if (userId === actorId && !active) {
    throw new AppError("BAD_REQUEST", "You cannot suspend your own account.");
  }

  // Activating a self-registered account is the moment the paid onboarding gate
  // opens, so the linked AccessRequest has to move with it — otherwise the
  // admin queue would still show the person as waiting.
  const wasPendingActivation = user.status === "PENDING_ACTIVATION";

  // Refuse to suspend the last usable Super Admin — that locks everyone out of
  // the product permanently, since there is no self-service recovery.
  if (!active && user.role === "SUPER_ADMIN") {
    const remaining = await prisma.user.count({
      where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null, id: { not: userId } },
    });

    if (remaining === 0) {
      throw new AppError("BAD_REQUEST", "This is the last active Super Admin and cannot be suspended.");
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: active ? "ACTIVE" : "SUSPENDED" },
  });

  if (active && wasPendingActivation) {
    await prisma.accessRequest.updateMany({
      where: { provisionedUserId: userId, status: { not: "PROVISIONED" } },
      data: { status: "PROVISIONED", reviewedById: actorId, reviewedAt: new Date() },
    });
  }

  if (!active) await revokeAllSessions(userId);

  await audit({
    action: active
      ? wasPendingActivation
        ? "user.activated"
        : "user.reactivated"
      : "user.suspended",
    entityType: "User",
    entityId: userId,
    actorId,
    orgId: user.orgId,
    metadata: { username: user.username, reason: reason || null, previousStatus: user.status },
  });
}
