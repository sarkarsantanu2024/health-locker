import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Phase 11 acceptance: a Super Admin can take an approved payment, create an
 * account, and copy the generated credentials to hand over; can reset a password
 * and suspend a user; and every action is audited.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "10.1.2.3" }),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const { createUser, platformScope, resetPassword, setUserActive } = await import(
  "@/modules/identity/provisioning.service"
);
const { login } = await import("@/modules/identity/auth.service");
const { listUsers, listAccessRequests, listAuditLog, revenueSummary } = await import(
  "@/modules/admin/admin.service"
);
const { approvePayment, createPaymentRequest, submitPayment, listPendingSubmissions } = await import(
  "@/modules/billing/payment.service"
);
const { resetMemoryLimiter } = await import("@/lib/ratelimit");

const prisma = new PrismaClient();
const SUFFIX = "adminspec";
let adminId: string;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { username: { contains: SUFFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const requests = await prisma.accessRequest.findMany({
    where: { fullName: { contains: SUFFIX } },
    select: { id: true },
  });
  const requestIds = requests.map((r) => r.id);

  const payments = await prisma.paymentRequest.findMany({
    where: { OR: [{ accessRequestId: { in: requestIds } }, { description: { contains: SUFFIX } }] },
    select: { id: true },
  });

  await prisma.paymentSubmission.deleteMany({
    where: { paymentRequestId: { in: payments.map((p) => p.id) } },
  });
  await prisma.paymentRequest.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } });
  await prisma.accessRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: userIds } }] },
  });
  await prisma.subscription.deleteMany({ where: { patient: { userId: { in: userIds } } } });
  await prisma.patient.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await cleanup();

  const admin = await prisma.user.create({
    data: {
      username: `super.${SUFFIX}`,
      passwordHash: "unused",
      displayName: "Spec Super Admin",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
    },
    select: { id: true },
  });
  adminId = admin.id;
}, 60_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("acceptance: approved payment → account → credentials to hand over", () => {
  it("runs the whole provisioning pipeline", async () => {
    // 1. An enquiry with no account (the case the console exists for).
    const request = await prisma.accessRequest.create({
      data: {
        fullName: `Enquiry ${SUFFIX}`,
        phone: "9830011223",
        city: "Kolkata",
        status: "AWAITING_PAYMENT",
        desiredPlanId: "plan-patient-family",
      },
      select: { id: true },
    });

    // 2. They pay and file a reference.
    const payment = await createPaymentRequest(
      {
        amountMinor: 49900,
        purpose: "ACCESS_REQUEST",
        description: `Onboarding ${SUFFIX}`,
        accessRequestId: request.id,
      },
      adminId,
    );

    await submitPayment({ refCode: payment.refCode, utr: `UTR${SUFFIX}01`, submitterPhone: "9830011223" });

    const queue = await listPendingSubmissions(undefined);
    const submission = queue.find((s) => s.paymentRequest.refCode === payment.refCode);
    expect(submission).toBeDefined();

    // 3. Admin approves. With no account behind it, the request moves to APPROVED
    // and waits for provisioning rather than silently activating nothing.
    await approvePayment(submission!.id, adminId, "verified against statement");

    const approved = await prisma.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved.status).toBe("APPROVED");

    // 4. It shows up in the console.
    const pipeline = await listAccessRequests();
    const listed = pipeline.find((item) => item.id === request.id);
    expect(listed?.paymentRequests[0]?.status).toBe("APPROVED");
    expect(listed?.provisionedUser).toBeNull();

    // 5. Provision — credentials returned ONCE, in memory.
    const credentials = await createUser(
      {
        displayName: `Enquiry ${SUFFIX}`,
        role: "PATIENT",
        phone: "9830011223",
        accessRequestId: request.id,
        planId: "plan-patient-family",
      },
      platformScope(adminId),
    );

    expect(credentials.username).toMatch(/^enquiry\./);
    expect(credentials.temporaryPassword).toHaveLength(14);

    // 6. The request is marked provisioned and linked to the new account.
    const provisioned = await prisma.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(provisioned.status).toBe("PROVISIONED");
    expect(provisioned.provisionedUserId).toBe(credentials.userId);

    // 7. Those exact credentials work, and force a password change.
    resetMemoryLimiter();
    const result = await login(
      { username: credentials.username, password: credentials.temporaryPassword },
      "10.1.2.3",
    );
    expect(result.mustChangePassword).toBe(true);

    // 8. The subscription came with it.
    const subscription = await prisma.subscription.findFirst({
      where: { patient: { userId: credentials.userId } },
      select: { status: true, plan: { select: { code: true } } },
    });
    expect(subscription?.plan.code).toBe("PATIENT_FAMILY");
  });

  it("never writes the generated password to the audit trail", async () => {
    const credentials = await createUser(
      { displayName: `Audit Check ${SUFFIX}`, role: "PATIENT" },
      platformScope(adminId),
    );

    const entries = await prisma.auditLog.findMany({
      where: { entityId: credentials.userId },
    });

    expect(entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(entries)).toContain(credentials.username);
    expect(JSON.stringify(entries)).not.toContain(credentials.temporaryPassword);
  });
});

describe("acceptance: reset password and suspend, audited", () => {
  it("issues a new temporary password that replaces the old one", async () => {
    const created = await createUser(
      { displayName: `Reset Target ${SUFFIX}`, role: "PATIENT" },
      platformScope(adminId),
    );

    const reissued = await resetPassword(created.userId, platformScope(adminId), "customer called");

    expect(reissued.username).toBe(created.username);
    expect(reissued.temporaryPassword).not.toBe(created.temporaryPassword);

    resetMemoryLimiter();
    await expect(
      login({ username: created.username, password: created.temporaryPassword }, "10.1.2.3"),
    ).rejects.toThrow();

    resetMemoryLimiter();
    await expect(
      login({ username: created.username, password: reissued.temporaryPassword }, "10.1.2.3"),
    ).resolves.toMatchObject({ mustChangePassword: true });

    const audited = await prisma.auditLog.findFirst({
      where: { action: "user.password_reset", entityId: created.userId },
    });
    expect(audited).not.toBeNull();
    expect(JSON.stringify(audited?.metadata)).toContain("customer called");
  });

  it("suspends and reactivates, recording both", async () => {
    const created = await createUser(
      { displayName: `Suspend Target ${SUFFIX}`, role: "PATIENT" },
      platformScope(adminId),
    );

    await setUserActive(created.userId, false, platformScope(adminId), "spec suspension");
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: created.userId } })).status,
    ).toBe("SUSPENDED");

    resetMemoryLimiter();
    await expect(
      login({ username: created.username, password: created.temporaryPassword }, "10.1.2.3"),
    ).rejects.toThrow();

    await setUserActive(created.userId, true, platformScope(adminId));
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: created.userId } })).status,
    ).toBe("ACTIVE");

    const actions = await prisma.auditLog.findMany({
      where: { entityId: created.userId, action: { in: ["user.suspended", "user.reactivated"] } },
      select: { action: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual(["user.reactivated", "user.suspended"]);
  });

  it("captures the request IP on an audited action", async () => {
    const created = await createUser({ displayName: `IP Check ${SUFFIX}`, role: "PATIENT" }, platformScope(adminId));

    const entry = await prisma.auditLog.findFirst({
      where: { entityId: created.userId, action: "user.created" },
      select: { ip: true },
    });

    expect(entry?.ip).toBe("10.1.2.3");
  });
});

describe("admin read models", () => {
  it("searches users by name, username and phone", async () => {
    const created = await createUser(
      { displayName: `Searchable ${SUFFIX}`, role: "PATIENT", phone: "9812345678" },
      platformScope(adminId),
    );

    const byName = await listUsers({ query: "Searchable" }, adminId);
    expect(byName.users.map((u) => u.id)).toContain(created.userId);

    const byPhone = await listUsers({ query: "9812345678" }, adminId);
    expect(byPhone.users.map((u) => u.id)).toContain(created.userId);

    const byRole = await listUsers({ role: "SUPER_ADMIN" }, adminId);
    expect(byRole.users.every((u) => u.role === "SUPER_ADMIN")).toBe(true);
  });

  it("paginates rather than returning everything", async () => {
    const page = await listUsers({}, adminId);

    expect(page.pageSize).toBe(25);
    expect(page.users.length).toBeLessThanOrEqual(25);
    expect(page.pages).toBe(Math.ceil(page.total / 25));
  });

  it("records that the user directory was browsed", async () => {
    await listUsers({ query: "anything" }, adminId);

    const entry = await prisma.auditLog.findFirst({
      where: { action: "admin.users_listed", actorId: adminId },
      orderBy: { createdAt: "desc" },
    });

    expect(entry).not.toBeNull();
  });

  it("filters the audit trail by action", async () => {
    const filtered = await listAuditLog({ action: "user.created" });

    expect(filtered.entries.length).toBeGreaterThan(0);
    expect(filtered.entries.every((entry) => entry.action.includes("user.created"))).toBe(true);
  });

  it("counts revenue from approved payments only", async () => {
    const before = await revenueSummary();

    const pending = await createPaymentRequest(
      { amountMinor: 100000, purpose: "OTHER", description: `Unapproved ${SUFFIX}` },
      adminId,
    );
    await submitPayment({ refCode: pending.refCode, utr: `UTR${SUFFIX}NOTYET` });

    const after = await revenueSummary();

    // Submitted but not approved: revenue is unchanged, the queue grew.
    expect(after.monthMinor).toBe(before.monthMinor);
    expect(after.pendingVerification).toBe(before.pendingVerification + 1);
  });
});
