import { prisma } from "@/lib/db";
import { AppError } from "@/shared/errors";

/**
 * Plan entitlements. `Plan.features` is JSON, so adding a limit is a seed change
 * rather than a migration — and the guard degrades to the free tier when nobody
 * has an active subscription, rather than failing open.
 */

export interface Entitlements {
  familyMembers: number;
  aiPagesPerMonth: number;
  storageMb: number;
  emergencyCard: boolean;
  staffSeats: number;
  locations: number;
  analytics: boolean;
}

/** What you get with no active subscription at all. Deliberately meagre. */
const FREE_FALLBACK: Entitlements = {
  familyMembers: 1,
  aiPagesPerMonth: 5,
  storageMb: 50,
  emergencyCard: true,
  staffSeats: 1,
  locations: 1,
  analytics: false,
};

function coerce(features: unknown): Entitlements {
  const raw = (features ?? {}) as Record<string, unknown>;

  const num = (key: keyof Entitlements, fallback: number) =>
    typeof raw[key] === "number" ? (raw[key] as number) : fallback;
  const bool = (key: keyof Entitlements, fallback: boolean) =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback;

  return {
    familyMembers: num("familyMembers", FREE_FALLBACK.familyMembers),
    aiPagesPerMonth: num("aiPagesPerMonth", FREE_FALLBACK.aiPagesPerMonth),
    storageMb: num("storageMb", FREE_FALLBACK.storageMb),
    emergencyCard: bool("emergencyCard", FREE_FALLBACK.emergencyCard),
    staffSeats: num("staffSeats", FREE_FALLBACK.staffSeats),
    locations: num("locations", FREE_FALLBACK.locations),
    analytics: bool("analytics", FREE_FALLBACK.analytics),
  };
}

async function activeSubscription(where: { patientId?: string; orgId?: string }) {
  return prisma.subscription.findFirst({
    where: {
      ...where,
      deletedAt: null,
      status: "ACTIVE",
      // A lapsed period is not an entitlement, even if the row still says ACTIVE.
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
    },
    orderBy: { currentPeriodEnd: "desc" },
    select: { plan: { select: { code: true, name: true, features: true } } },
  });
}

export async function getPatientEntitlements(patientId: string): Promise<Entitlements & { planName: string }> {
  const subscription = await activeSubscription({ patientId });

  return {
    ...coerce(subscription?.plan.features),
    planName: subscription?.plan.name ?? "Free",
  };
}

export async function getOrgEntitlements(orgId: string): Promise<Entitlements & { planName: string }> {
  const subscription = await activeSubscription({ orgId });

  return {
    ...coerce(subscription?.plan.features),
    planName: subscription?.plan.name ?? "Free",
  };
}

/**
 * Gates a feature by the active plan. Throws a message naming the limit, because
 * "upgrade required" without a number is useless to the person reading it.
 */
export async function requireEntitlement(
  scope: { patientId: string } | { orgId: string },
  check: (entitlements: Entitlements) => boolean,
  message: string,
): Promise<void> {
  const entitlements =
    "patientId" in scope
      ? await getPatientEntitlements(scope.patientId)
      : await getOrgEntitlements(scope.orgId);

  if (!check(entitlements)) {
    throw new AppError("FORBIDDEN", message, { reason: "PLAN_LIMIT", plan: entitlements.planName });
  }
}

/** Convenience for the common "have I hit a count limit?" case. */
export async function assertUnderLimit(
  scope: { patientId: string } | { orgId: string },
  limit: keyof Pick<Entitlements, "familyMembers" | "staffSeats" | "locations">,
  currentCount: number,
  noun: string,
): Promise<void> {
  const entitlements =
    "patientId" in scope
      ? await getPatientEntitlements(scope.patientId)
      : await getOrgEntitlements(scope.orgId);

  if (currentCount >= entitlements[limit]) {
    throw new AppError(
      "FORBIDDEN",
      `Your ${entitlements.planName} plan allows ${entitlements[limit]} ${noun}. Upgrade to add more.`,
      { reason: "PLAN_LIMIT", limit, allowed: entitlements[limit] },
    );
  }
}
