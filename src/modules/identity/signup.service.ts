import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { AppError } from "@/shared/errors";
import type { SignupInput } from "@/shared/schemas/auth";

/**
 * Consumer self-registration.
 *
 * The person chooses their own username and password — nobody hands credentials
 * over by WhatsApp any more. But the account is created PENDING_ACTIVATION and
 * cannot sign in: a Super Admin still verifies the manual payment first, so the
 * paid onboarding gate from Phase 6 is preserved.
 *
 * PATIENT role only. A self-registered provider could claim a tenant that is not
 * theirs, so provider staff remain admin-provisioned (provisioning.service.ts).
 */

export interface SignupResult {
  userId: string;
  username: string;
  accessRequestId: string;
}

/** Signups per IP per hour. Abuse here costs us database rows and admin time. */
const SIGNUP_LIMIT = { tokens: 5, window: "1 h" } as const;

export async function registerConsumer(
  input: SignupInput,
  ip: string | null,
): Promise<SignupResult> {
  const throttle = await rateLimit("signup", ip ?? "unknown", SIGNUP_LIMIT);
  if (!throttle.success) {
    throw new AppError("RATE_LIMITED", "Too many sign-up attempts. Please try again later.");
  }

  const existing = await prisma.user.findUnique({
    where: { username: input.username },
    select: { id: true },
  });

  if (existing) {
    throw new AppError("CONFLICT", "That username is taken. Please choose another.", {
      field: "username",
    });
  }

  const plan = await prisma.plan.findFirst({
    where: { id: input.planId, isActive: true, deletedAt: null, audience: "PATIENT" },
    select: { id: true, priceMinor: true },
  });

  if (!plan) throw new AppError("BAD_REQUEST", "That plan is not available.");

  const passwordHash = await hashPassword(input.password);

  // One transaction: a User without its Patient, or an AccessRequest with no
  // account behind it, would both leave the admin queue in a broken state.
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: input.username,
        passwordHash,
        displayName: input.fullName,
        phone: input.phone,
        role: "PATIENT",
        status: "PENDING_ACTIVATION",
        // They chose this password themselves, so there is nothing to rotate.
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
      select: { id: true, username: true },
    });

    await tx.patient.create({
      data: {
        userId: user.id,
        fullName: input.fullName,
        phone: input.phone,
        addressLine: input.addressLine,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
      },
    });

    // Keeps the Phase 6 verification queue and the Phase 11 console working
    // unchanged — they already key off AccessRequest.
    const accessRequest = await tx.accessRequest.create({
      data: {
        fullName: input.fullName,
        phone: input.phone,
        city: input.city,
        desiredPlanId: plan.id,
        // A free plan still needs a human to look at it, but there is no payment
        // to wait for.
        status: plan.priceMinor > 0 ? "AWAITING_PAYMENT" : "PENDING",
        provisionedUserId: user.id,
        note: "Self-registered; credentials chosen by the user.",
      },
      select: { id: true },
    });

    return { user, accessRequestId: accessRequest.id };
  });

  await audit({
    action: "user.self_registered",
    entityType: "User",
    entityId: result.user.id,
    actorId: result.user.id,
    metadata: {
      username: result.user.username,
      planId: plan.id,
      accessRequestId: result.accessRequestId,
    },
    ip,
  });

  return {
    userId: result.user.id,
    username: result.user.username,
    accessRequestId: result.accessRequestId,
  };
}

/** Plans a consumer may pick during signup. */
export async function listSignupPlans() {
  return prisma.plan.findMany({
    where: { audience: "PATIENT", isActive: true, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, description: true, priceMinor: true, interval: true },
  });
}

/** True when the username is free — powers the inline availability check. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  return !existing;
}
