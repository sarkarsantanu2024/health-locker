import type { Prisma, Role, UserStatus } from "@prisma/client";

import { auditRead } from "@/lib/audit";
import { prisma } from "@/lib/db";

/**
 * Read models for the admin console. Every list is paginated and capped — an
 * admin screen that loads every row is a screen that dies the day the product
 * succeeds.
 */

const PAGE_SIZE = 25;

export interface UserFilter {
  query?: string;
  role?: Role;
  status?: UserStatus;
  orgId?: string;
  page?: number;
}

export async function listUsers(filter: UserFilter, actorId: string) {
  const page = Math.max(1, filter.page ?? 1);
  const needle = filter.query?.trim();

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(filter.role ? { role: filter.role } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.orgId ? { orgId: filter.orgId } : {}),
    ...(needle
      ? {
          OR: [
            { username: { contains: needle, mode: "insensitive" } },
            { displayName: { contains: needle, mode: "insensitive" } },
            { phone: { contains: needle } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        username: true,
        displayName: true,
        phone: true,
        role: true,
        status: true,
        mustChangePassword: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        lockedUntil: true,
        createdAt: true,
        org: { select: { name: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Browsing the user directory is itself worth recording.
  await auditRead({
    action: "admin.users_listed",
    entityType: "User",
    actorId,
    metadata: { query: needle ?? null, role: filter.role ?? null, total },
  });

  return { users, total, page, pageSize: PAGE_SIZE, pages: Math.ceil(total / PAGE_SIZE) };
}

/**
 * The onboarding pipeline. Self-registered consumers already have a
 * PENDING_ACTIVATION account; older requests may have none, and those are the
 * ones needing the provisioning form.
 */
export async function listAccessRequests(includeResolved = false) {
  return prisma.accessRequest.findMany({
    where: {
      deletedAt: null,
      ...(includeResolved ? {} : { status: { in: ["PENDING", "AWAITING_PAYMENT", "APPROVED"] } }),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      fullName: true,
      phone: true,
      city: true,
      note: true,
      orgType: true,
      status: true,
      createdAt: true,
      desiredPlan: { select: { id: true, name: true, priceMinor: true, audience: true } },
      provisionedUser: { select: { id: true, username: true, status: true } },
      paymentRequests: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          refCode: true,
          status: true,
          amountMinor: true,
          submissions: {
            orderBy: { submittedAt: "desc" },
            take: 1,
            select: { status: true, utr: true, proofDocumentId: true },
          },
        },
      },
    },
  });
}

export interface AuditFilter {
  action?: string;
  entityType?: string;
  actorId?: string;
  page?: number;
}

export async function listAuditLog(filter: AuditFilter) {
  const page = Math.max(1, filter.page ?? 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(filter.action ? { action: { contains: filter.action, mode: "insensitive" } } : {}),
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ip: true,
        createdAt: true,
        actor: { select: { username: true, displayName: true } },
        org: { select: { name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, page, pageSize: PAGE_SIZE, pages: Math.ceil(total / PAGE_SIZE) };
}

/** Distinct actions present in the trail, for the filter dropdown. */
export async function auditActions(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["action"],
    orderBy: { action: "asc" },
    take: 100,
    select: { action: true },
  });

  return rows.map((row) => row.action);
}

export async function listOrganizations() {
  return prisma.organization.findMany({
    where: { deletedAt: null },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      city: true,
      isActive: true,
      createdAt: true,
      _count: { select: { users: true, patientLinks: true } },
      subscriptions: {
        where: { status: "ACTIVE", deletedAt: null },
        take: 1,
        select: { plan: { select: { name: true } }, currentPeriodEnd: true },
      },
    },
  });
}

/** Revenue is counted from APPROVED payments only — a claim is not money. */
export async function revenueSummary() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const startOfYear = new Date(startOfMonth);
  startOfYear.setMonth(0);

  const [month, year, pending, activeSubs] = await Promise.all([
    prisma.paymentRequest.aggregate({
      where: { status: "APPROVED", settledAt: { gte: startOfMonth } },
      _sum: { amountMinor: true },
      _count: true,
    }),
    prisma.paymentRequest.aggregate({
      where: { status: "APPROVED", settledAt: { gte: startOfYear } },
      _sum: { amountMinor: true },
    }),
    prisma.paymentSubmission.count({ where: { status: "SUBMITTED" } }),
    prisma.subscription.count({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
      },
    }),
  ]);

  return {
    monthMinor: month._sum.amountMinor ?? 0,
    monthCount: month._count,
    yearMinor: year._sum.amountMinor ?? 0,
    pendingVerification: pending,
    activeSubscriptions: activeSubs,
  };
}

export async function listPlans() {
  return prisma.plan.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true, audience: true, priceMinor: true, interval: true, isActive: true },
  });
}

export async function listActiveOrganizationsForSelect() {
  return prisma.organization.findMany({
    where: { deletedAt: null, isActive: true, type: { not: "PLATFORM" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
}
