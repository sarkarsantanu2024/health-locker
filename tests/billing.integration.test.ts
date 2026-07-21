import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Phase 6 acceptance: pay by UPI link/QR, submit a UTR, admin approves, plan
 * activates — with zero gateway fees and a human in the loop.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const {
  approvePayment,
  createPaymentRequest,
  getPaymentInstructions,
  listPendingSubmissions,
  rejectPayment,
  submitPayment,
} = await import("@/modules/billing/payment.service");
const { buildUpiLink, generateRefCode, isPlausibleUtr, normaliseUtr } = await import(
  "@/modules/billing/upi"
);
const { getPatientEntitlements, assertUnderLimit } = await import("@/modules/billing/entitlements");
const { encrypt } = await import("@/lib/crypto");

const prisma = new PrismaClient();
const SUFFIX = "billspec";
let patientId: string;
let adminId: string;
let merchantId: string;

async function cleanup() {
  const patients = await prisma.patient.findMany({
    where: { fullName: { contains: SUFFIX } },
    select: { id: true },
  });
  const patientIds = patients.map((p) => p.id);
  const users = await prisma.user.findMany({
    where: { username: { contains: SUFFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const requests = await prisma.paymentRequest.findMany({
    where: { OR: [{ patientId: { in: patientIds } }, { description: { contains: SUFFIX } }] },
    select: { id: true },
  });
  const requestIds = requests.map((r) => r.id);

  await prisma.paymentSubmission.deleteMany({ where: { paymentRequestId: { in: requestIds } } });
  await prisma.paymentRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prisma.subscription.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.consentRecord.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: requestIds } }] },
  });
  await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.merchantPaymentProfile.deleteMany({ where: { payeeName: { contains: SUFFIX } } });
}

beforeAll(async () => {
  await cleanup();

  const admin = await prisma.user.create({
    data: {
      username: `admin.${SUFFIX}`,
      passwordHash: "unused",
      displayName: "Bill Admin",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
    },
    select: { id: true },
  });
  adminId = admin.id;

  const patient = await prisma.patient.create({
    data: { fullName: `Payer ${SUFFIX}` },
    select: { id: true },
  });
  patientId = patient.id;

  // A tenant-scoped merchant profile, so the platform's own (orgId null) is
  // untouched by this suite.
  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: "demo-clinic" },
    select: { id: true },
  });

  await prisma.merchantPaymentProfile.deleteMany({ where: { orgId: org.id } });
  const merchant = await prisma.merchantPaymentProfile.create({
    data: {
      orgId: org.id,
      payeeName: `Clinic ${SUFFIX}`,
      upiVpaEnc: encrypt("clinic@testupi"),
      bankNameEnc: encrypt("Test Bank"),
      accountNoEnc: encrypt("123456789012"),
      ifscEnc: encrypt("TEST0001234"),
      accountLast4: "9012",
      isActive: true,
    },
    select: { id: true, orgId: true },
  });
  merchantId = merchant.id;
}, 60_000);

afterAll(async () => {
  await prisma.merchantPaymentProfile.deleteMany({ where: { id: merchantId } });
  await cleanup();
  await prisma.$disconnect();
});

describe("UPI primitives", () => {
  it("generates a reference code UPI apps accept", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateRefCode();
      expect(code).toMatch(/^HL[A-Z0-9]{8}$/);
      // Ambiguous glyphs removed: this gets read aloud over the phone.
      expect(code.slice(2)).not.toMatch(/[OI01]/);
    }
  });

  it("formats the amount as rupees with two decimals, not paise", () => {
    const link = buildUpiLink({
      vpa: "someone@bank",
      payeeName: "Someone",
      amountMinor: 49900,
      refCode: "HLABCD2345",
    });

    const params = new URLSearchParams(link.split("?")[1]);
    // 49900 paise is ₹499.00 — sending "49900" would charge 100x.
    expect(params.get("am")).toBe("499.00");
    expect(params.get("cu")).toBe("INR");
    expect(params.get("pa")).toBe("someone@bank");
    expect(params.get("tr")).toBe("HLABCD2345");
    expect(link.startsWith("upi://pay?")).toBe(true);
  });

  it("normalises and validates a UTR", () => {
    expect(normaliseUtr(" 4123 4567 8901 ")).toBe("412345678901");
    expect(isPlausibleUtr("412345678901")).toBe(true);
    expect(isPlausibleUtr("abc123")).toBe(true);
    expect(isPlausibleUtr("12345")).toBe(false);
    expect(isPlausibleUtr("has spaces in it!")).toBe(false);
  });
});

describe("payment instructions", () => {
  it("offers QR, deep link and bank details together", async () => {
    const { refCode } = await createPaymentRequest(
      { amountMinor: 49900, purpose: "SUBSCRIPTION", description: `Plan ${SUFFIX}`, patientId, merchantOrgId: (await prisma.merchantPaymentProfile.findUniqueOrThrow({ where: { id: merchantId }, select: { orgId: true } })).orgId },
      adminId,
    );

    const { instructions, request } = await getPaymentInstructions(refCode);

    expect(request.amountMinor).toBe(49900);
    expect(instructions.upiLink).toContain("upi://pay");
    expect(instructions.qrSvg).toContain("<svg");
    expect(instructions.vpa).toBe("clinic@testupi");
    // Bank details decrypt for display but are stored encrypted.
    expect(instructions.bank).toMatchObject({ accountNo: "123456789012", ifsc: "TEST0001234" });
  });

  it("refuses to raise a request for a non-positive amount", async () => {
    await expect(
      createPaymentRequest({ amountMinor: 0, purpose: "OTHER", patientId }, adminId),
    ).rejects.toThrow(/positive/i);
  });
});

describe("acceptance: submit → approve → plan activates", () => {
  it("runs the full manual flow end to end", async () => {
    const plan = await prisma.plan.findFirstOrThrow({ where: { code: "PATIENT_FAMILY" } });

    const subscription = await prisma.subscription.create({
      data: { planId: plan.id, patientId, status: "PENDING" },
      select: { id: true },
    });

    const { refCode } = await createPaymentRequest(
      {
        amountMinor: plan.priceMinor,
        purpose: "SUBSCRIPTION",
        description: `Family plan ${SUFFIX}`,
        patientId,
        subscriptionId: subscription.id,
      },
      adminId,
    );

    // Before payment, the patient is on the free fallback.
    const before = await getPatientEntitlements(patientId);
    expect(before.planName).toBe("Free");
    expect(before.familyMembers).toBe(1);

    await submitPayment({ refCode, utr: `UTR${SUFFIX}001`, method: "UPI" });

    const queued = await listPendingSubmissions(undefined);
    const mine = queued.find((s) => s.paymentRequest.refCode === refCode);
    expect(mine).toBeDefined();

    await approvePayment(mine!.id, adminId, "matched on statement");

    // The plan is now active and the entitlement changed.
    const after = await getPatientEntitlements(patientId);
    expect(after.planName).toBe(plan.name);
    expect(after.familyMembers).toBe(6);

    const settled = await prisma.paymentRequest.findFirstOrThrow({ where: { refCode } });
    expect(settled.status).toBe("APPROVED");
    expect(settled.settledAt).not.toBeNull();

    const activated = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(activated.status).toBe("ACTIVE");
    expect(activated.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
  });

  it("marks a linked invoice PAID on approval", async () => {
    const invoice = await prisma.invoice.create({
      data: {
        number: `INV-${SUFFIX}-1`,
        patientId,
        status: "ISSUED",
        subtotalMinor: 20000,
        totalMinor: 20000,
        issuedAt: new Date(),
      },
      select: { id: true },
    });

    const { refCode } = await createPaymentRequest(
      { amountMinor: 20000, purpose: "INVOICE", description: `Invoice ${SUFFIX}`, patientId, invoiceId: invoice.id },
      adminId,
    );

    await submitPayment({ refCode, utr: `UTR${SUFFIX}002` });
    const queue = await listPendingSubmissions(undefined);
    await approvePayment(queue.find((s) => s.paymentRequest.refCode === refCode)!.id, adminId);

    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).not.toBeNull();

    await prisma.invoice.delete({ where: { id: invoice.id } });
  });
});

describe("abuse and mistake handling", () => {
  it("blocks a second submission while one is awaiting review", async () => {
    const { refCode } = await createPaymentRequest(
      { amountMinor: 10000, purpose: "OTHER", description: `Dup ${SUFFIX}`, patientId },
      adminId,
    );

    await submitPayment({ refCode, utr: `UTR${SUFFIX}003` });

    await expect(submitPayment({ refCode, utr: `UTR${SUFFIX}004` })).rejects.toThrow(
      /already been submitted/i,
    );
  });

  it("rejects a UTR already used against a DIFFERENT request", async () => {
    const first = await createPaymentRequest(
      { amountMinor: 10000, purpose: "OTHER", description: `Reuse A ${SUFFIX}`, patientId },
      adminId,
    );
    const second = await createPaymentRequest(
      { amountMinor: 10000, purpose: "OTHER", description: `Reuse B ${SUFFIX}`, patientId },
      adminId,
    );

    const shared = `UTR${SUFFIX}SHARED`;
    await submitPayment({ refCode: first.refCode, utr: shared });

    // A UTR identifies exactly one real bank transfer — reuse across requests is
    // the fraud case that per-request uniqueness would miss.
    await expect(submitPayment({ refCode: second.refCode, utr: shared })).rejects.toThrow(
      /already been used/i,
    );
  });

  it("treats a re-typed UTR with different spacing as the same reference", async () => {
    const { refCode } = await createPaymentRequest(
      { amountMinor: 10000, purpose: "OTHER", description: `Space ${SUFFIX}`, patientId },
      adminId,
    );

    const other = await createPaymentRequest(
      { amountMinor: 10000, purpose: "OTHER", description: `Space2 ${SUFFIX}`, patientId },
      adminId,
    );

    await submitPayment({ refCode, utr: `UTR ${SUFFIX} SPACED` });
    await expect(
      submitPayment({ refCode: other.refCode, utr: `utr${SUFFIX}spaced` }),
    ).rejects.toThrow(/already been used/i);
  });

  it("is idempotent on approval, so a double click cannot double-extend a plan", async () => {
    const plan = await prisma.plan.findFirstOrThrow({ where: { code: "PATIENT_FAMILY" } });
    const subscription = await prisma.subscription.create({
      data: { planId: plan.id, patientId, status: "PENDING" },
      select: { id: true },
    });

    const { refCode } = await createPaymentRequest(
      { amountMinor: plan.priceMinor, purpose: "SUBSCRIPTION", description: `Idem ${SUFFIX}`, patientId, subscriptionId: subscription.id },
      adminId,
    );

    await submitPayment({ refCode, utr: `UTR${SUFFIX}IDEM` });
    const queue = await listPendingSubmissions(undefined);
    const submissionId = queue.find((s) => s.paymentRequest.refCode === refCode)!.id;

    const first = await approvePayment(submissionId, adminId);
    const afterFirst = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });

    const second = await approvePayment(submissionId, adminId);
    const afterSecond = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });

    expect(first.alreadyApproved).toBe(false);
    expect(second.alreadyApproved).toBe(true);
    expect(afterSecond.currentPeriodEnd?.getTime()).toBe(afterFirst.currentPeriodEnd?.getTime());
  });

  it("returns a rejected request to PENDING so a typo can be corrected", async () => {
    const { refCode } = await createPaymentRequest(
      { amountMinor: 10000, purpose: "OTHER", description: `Reject ${SUFFIX}`, patientId },
      adminId,
    );

    await submitPayment({ refCode, utr: `UTR${SUFFIX}BAD` });
    const queue = await listPendingSubmissions(undefined);
    const submissionId = queue.find((s) => s.paymentRequest.refCode === refCode)!.id;

    await rejectPayment(submissionId, adminId, "No matching transfer found");

    const request = await prisma.paymentRequest.findFirstOrThrow({ where: { refCode } });
    expect(request.status).toBe("PENDING");

    // The payer can now submit a corrected reference.
    await expect(submitPayment({ refCode, utr: `UTR${SUFFIX}GOOD` })).resolves.toMatchObject({
      submissionId: expect.any(String),
    });
  });

  it("refuses a submission against an expired request", async () => {
    const { refCode } = await createPaymentRequest(
      { amountMinor: 10000, purpose: "OTHER", description: `Expiry ${SUFFIX}`, patientId },
      adminId,
    );

    await prisma.paymentRequest.updateMany({
      where: { refCode },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(submitPayment({ refCode, utr: `UTR${SUFFIX}EXP` })).rejects.toThrow(/expired/i);
  });

  it("refuses to approve a submission that was already rejected", async () => {
    const { refCode } = await createPaymentRequest(
      { amountMinor: 10000, purpose: "OTHER", description: `Rej2 ${SUFFIX}`, patientId },
      adminId,
    );

    await submitPayment({ refCode, utr: `UTR${SUFFIX}REJ2` });
    const queue = await listPendingSubmissions(undefined);
    const submissionId = queue.find((s) => s.paymentRequest.refCode === refCode)!.id;

    await rejectPayment(submissionId, adminId, "wrong amount");
    await expect(approvePayment(submissionId, adminId)).rejects.toThrow(/already rejected/i);
  });
});

describe("entitlements", () => {
  it("falls back to the free tier with no active subscription", async () => {
    const fresh = await prisma.patient.create({
      data: { fullName: `Fresh ${SUFFIX}` },
      select: { id: true },
    });

    const entitlements = await getPatientEntitlements(fresh.id);
    expect(entitlements.planName).toBe("Free");
    expect(entitlements.analytics).toBe(false);

    await expect(assertUnderLimit({ patientId: fresh.id }, "familyMembers", 1, "family members"))
      .rejects.toThrow(/allows 1 family members/i);

    await prisma.patient.delete({ where: { id: fresh.id } });
  });

  it("ignores a subscription whose period has lapsed", async () => {
    const plan = await prisma.plan.findFirstOrThrow({ where: { code: "PATIENT_FAMILY" } });
    const lapsed = await prisma.patient.create({
      data: { fullName: `Lapsed ${SUFFIX}` },
      select: { id: true },
    });

    await prisma.subscription.create({
      data: {
        planId: plan.id,
        patientId: lapsed.id,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() - 86_400_000),
      },
    });

    // Status still says ACTIVE, but the period is over — that is not an entitlement.
    const entitlements = await getPatientEntitlements(lapsed.id);
    expect(entitlements.planName).toBe("Free");

    await prisma.subscription.deleteMany({ where: { patientId: lapsed.id } });
    await prisma.patient.delete({ where: { id: lapsed.id } });
  });
});
