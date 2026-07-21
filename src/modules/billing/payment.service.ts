import { Prisma, type PaymentMethod, type PaymentPurpose } from "@prisma/client";

import { audit } from "@/lib/audit";
import { decryptNullable } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { AppError } from "@/shared/errors";
import type { PaymentInstructions } from "@/modules/billing/payment.provider";
import { buildUpiLink, generateRefCode, isPlausibleUtr, normaliseUtr, upiQrSvg } from "@/modules/billing/upi";

/**
 * Manual collect-and-verify.
 *
 *   PENDING → SUBMITTED → APPROVED | REJECTED
 *            (payer files a UTR)  (an admin decides)
 *
 * Nothing here talks to a payment gateway. The payer moves money with their own
 * UPI app or bank, then tells us the reference; a human confirms it against the
 * bank statement. Zero gateway fees, zero PCI scope, one human in the loop.
 */

export interface CreatePaymentRequestInput {
  amountMinor: number;
  purpose: PaymentPurpose;
  description?: string;
  patientId?: string | null;
  orgId?: string | null;
  accessRequestId?: string | null;
  invoiceId?: string | null;
  subscriptionId?: string | null;
  /** Whose UPI/QR to show. Null = the platform's own profile. */
  merchantOrgId?: string | null;
  expiresInHours?: number;
}

/** Retries on the astronomically unlikely refCode collision rather than failing. */
async function createWithUniqueRef(
  data: Omit<Prisma.PaymentRequestUncheckedCreateInput, "refCode">,
): Promise<{ id: string; refCode: string }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const refCode = generateRefCode();

    try {
      return await prisma.paymentRequest.create({
        data: { ...data, refCode },
        select: { id: true, refCode: true },
      });
    } catch (error) {
      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueViolation) throw error;
    }
  }

  throw new AppError("INTERNAL", "Could not allocate a payment reference. Please try again.");
}

export async function createPaymentRequest(
  input: CreatePaymentRequestInput,
  actorId: string | null,
): Promise<{ id: string; refCode: string }> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new AppError("BAD_REQUEST", "The amount must be a positive whole number of paise.");
  }

  const merchant = await prisma.merchantPaymentProfile.findFirst({
    where: { orgId: input.merchantOrgId ?? null, isActive: true, deletedAt: null },
    select: { id: true },
  });

  if (!merchant) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "No payment details are configured yet. Contact support.",
    );
  }

  const request = await createWithUniqueRef({
    amountMinor: input.amountMinor,
    purpose: input.purpose,
    description: input.description ?? null,
    patientId: input.patientId ?? null,
    orgId: input.orgId ?? null,
    accessRequestId: input.accessRequestId ?? null,
    invoiceId: input.invoiceId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    merchantProfileId: merchant.id,
    status: "PENDING",
    expiresAt: input.expiresInHours
      ? new Date(Date.now() + input.expiresInHours * 3_600_000)
      : null,
  });

  await audit({
    action: "payment_request.created",
    entityType: "PaymentRequest",
    entityId: request.id,
    actorId,
    orgId: input.orgId ?? null,
    metadata: { refCode: request.refCode, amountMinor: input.amountMinor, purpose: input.purpose },
  });

  return request;
}

/**
 * What the payer is shown: QR, UPI deep link and bank details — all three, so
 * nobody is blocked by not having a UPI app.
 */
export async function getPaymentInstructions(refCode: string): Promise<{
  request: {
    id: string;
    refCode: string;
    amountMinor: number;
    description: string | null;
    status: string;
    expiresAt: Date | null;
  };
  instructions: PaymentInstructions;
}> {
  const request = await prisma.paymentRequest.findFirst({
    where: { refCode, deletedAt: null },
    select: {
      id: true,
      refCode: true,
      amountMinor: true,
      description: true,
      status: true,
      expiresAt: true,
      merchantProfile: {
        select: {
          payeeName: true,
          upiVpaEnc: true,
          bankNameEnc: true,
          accountNoEnc: true,
          ifscEnc: true,
        },
      },
    },
  });

  if (!request || !request.merchantProfile) throw new AppError("NOT_FOUND", "Not found.");

  const profile = request.merchantProfile;
  const vpa = decryptNullable(profile.upiVpaEnc);
  const accountNo = decryptNullable(profile.accountNoEnc);
  const ifsc = decryptNullable(profile.ifscEnc);
  const bankName = decryptNullable(profile.bankNameEnc);

  const linkInput = vpa
    ? {
        vpa,
        payeeName: profile.payeeName,
        amountMinor: request.amountMinor,
        refCode: request.refCode,
        note: request.description ?? undefined,
      }
    : null;

  return {
    request: {
      id: request.id,
      refCode: request.refCode,
      amountMinor: request.amountMinor,
      description: request.description,
      status: request.status,
      expiresAt: request.expiresAt,
    },
    instructions: {
      kind: "MANUAL",
      upiLink: linkInput ? buildUpiLink(linkInput) : null,
      qrSvg: linkInput ? await upiQrSvg(linkInput) : null,
      payeeName: profile.payeeName,
      vpa,
      bank: accountNo && ifsc ? { name: bankName ?? "Bank", accountNo, ifsc } : null,
    },
  };
}

export interface SubmitPaymentInput {
  refCode: string;
  utr: string;
  method?: PaymentMethod;
  paidAt?: Date | null;
  amountMinor?: number | null;
  proofDocumentId?: string | null;
  submittedById?: string | null;
  submitterPhone?: string | null;
}

/**
 * The payer's claim that they paid.
 *
 * Two abuse cases are blocked here:
 *   - Double-submit: one open submission per request.
 *   - UTR reuse: a UTR is globally unique because it identifies exactly ONE real
 *     bank transfer. Reusing one against a different request is the fraud case,
 *     and per-request uniqueness would miss it entirely.
 */
export async function submitPayment(input: SubmitPaymentInput): Promise<{ submissionId: string }> {
  const utr = normaliseUtr(input.utr);

  if (!isPlausibleUtr(utr)) {
    throw new AppError("BAD_REQUEST", "That does not look like a valid transaction reference.", {
      field: "utr",
    });
  }

  const request = await prisma.paymentRequest.findFirst({
    where: { refCode: input.refCode, deletedAt: null },
    select: { id: true, status: true, expiresAt: true, orgId: true, amountMinor: true },
  });

  if (!request) throw new AppError("NOT_FOUND", "Not found.");

  if (request.status === "APPROVED") {
    throw new AppError("CONFLICT", "This payment has already been approved.");
  }

  if (request.status === "CANCELLED" || request.status === "EXPIRED") {
    throw new AppError("BAD_REQUEST", "This payment request is no longer active.");
  }

  if (request.expiresAt && request.expiresAt < new Date()) {
    await prisma.paymentRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
    throw new AppError("BAD_REQUEST", "This payment request has expired. Please start again.");
  }

  const alreadyOpen = await prisma.paymentSubmission.findFirst({
    where: { paymentRequestId: request.id, status: "SUBMITTED" },
    select: { id: true },
  });

  if (alreadyOpen) {
    throw new AppError(
      "CONFLICT",
      "A payment reference has already been submitted for this request and is awaiting review.",
    );
  }

  try {
    const submission = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentSubmission.create({
        data: {
          paymentRequestId: request.id,
          utr,
          method: input.method ?? "UPI",
          paidAt: input.paidAt ?? null,
          amountMinor: input.amountMinor ?? request.amountMinor,
          proofDocumentId: input.proofDocumentId ?? null,
          submittedById: input.submittedById ?? null,
          submitterPhone: input.submitterPhone ?? null,
          status: "SUBMITTED",
        },
        select: { id: true },
      });

      await tx.paymentRequest.update({
        where: { id: request.id },
        data: { status: "SUBMITTED" },
      });

      return created;
    });

    await audit({
      action: "payment.submitted",
      entityType: "PaymentSubmission",
      entityId: submission.id,
      actorId: input.submittedById ?? null,
      orgId: request.orgId,
      metadata: { refCode: input.refCode, utr, method: input.method ?? "UPI" },
    });

    return { submissionId: submission.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(
        "CONFLICT",
        "That transaction reference has already been used. Check the number, or contact support.",
        { field: "utr" },
      );
    }
    throw error;
  }
}

/**
 * Approve. Idempotent: approving twice is a no-op rather than double-extending a
 * subscription, because an admin double-clicking a button must not cost money.
 */
export async function approvePayment(
  submissionId: string,
  actorId: string,
  note?: string,
): Promise<{ alreadyApproved: boolean }> {
  const submission = await prisma.paymentSubmission.findFirst({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      utr: true,
      paymentRequest: {
        select: {
          id: true,
          refCode: true,
          status: true,
          orgId: true,
          patientId: true,
          invoiceId: true,
          subscriptionId: true,
          accessRequestId: true,
          amountMinor: true,
        },
      },
    },
  });

  if (!submission) throw new AppError("NOT_FOUND", "Not found.");
  if (submission.status === "APPROVED") return { alreadyApproved: true };
  if (submission.status === "REJECTED") {
    throw new AppError("BAD_REQUEST", "This submission was already rejected.");
  }

  const request = submission.paymentRequest;

  await prisma.$transaction(async (tx) => {
    await tx.paymentSubmission.update({
      where: { id: submission.id },
      data: { status: "APPROVED", reviewedById: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
    });

    await tx.paymentRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", settledAt: new Date() },
    });

    if (request.invoiceId) {
      await tx.invoice.update({
        where: { id: request.invoiceId },
        data: { status: "PAID", paidAt: new Date() },
      });
    }

    if (request.subscriptionId) {
      const subscription = await tx.subscription.findUnique({
        where: { id: request.subscriptionId },
        select: { currentPeriodEnd: true, plan: { select: { interval: true } } },
      });

      if (subscription) {
        // Extend from the existing end date when still active, so paying early
        // does not cost the payer the remainder of their current period.
        const from =
          subscription.currentPeriodEnd && subscription.currentPeriodEnd > new Date()
            ? subscription.currentPeriodEnd
            : new Date();
        const months =
          subscription.plan.interval === "YEARLY"
            ? 12
            : subscription.plan.interval === "QUARTERLY"
              ? 3
              : subscription.plan.interval === "LIFETIME"
                ? 1200
                : 1;

        const end = new Date(from);
        end.setMonth(end.getMonth() + months);

        await tx.subscription.update({
          where: { id: request.subscriptionId },
          data: { status: "ACTIVE", startedAt: new Date(), currentPeriodEnd: end },
        });
      }
    }

    // A self-registered consumer: approving the payment is what lets them in.
    if (request.accessRequestId) {
      const accessRequest = await tx.accessRequest.findUnique({
        where: { id: request.accessRequestId },
        select: { provisionedUserId: true },
      });

      if (accessRequest?.provisionedUserId) {
        await tx.user.update({
          where: { id: accessRequest.provisionedUserId },
          data: { status: "ACTIVE" },
        });
        await tx.accessRequest.update({
          where: { id: request.accessRequestId },
          data: { status: "PROVISIONED", reviewedById: actorId, reviewedAt: new Date() },
        });
      } else {
        // No account yet — Phase 11's console picks this up and provisions one.
        await tx.accessRequest.update({
          where: { id: request.accessRequestId },
          data: { status: "APPROVED", reviewedById: actorId, reviewedAt: new Date() },
        });
      }
    }
  });

  await audit({
    action: "payment.approved",
    entityType: "PaymentSubmission",
    entityId: submission.id,
    actorId,
    orgId: request.orgId,
    metadata: {
      refCode: request.refCode,
      utr: submission.utr,
      amountMinor: request.amountMinor,
      activated: {
        invoice: request.invoiceId,
        subscription: request.subscriptionId,
        accessRequest: request.accessRequestId,
      },
    },
  });

  return { alreadyApproved: false };
}

/**
 * Reject. The request returns to PENDING so the payer can correct a mistyped UTR
 * and try again — a rejection is usually a typo, not fraud.
 */
export async function rejectPayment(
  submissionId: string,
  actorId: string,
  note: string,
): Promise<void> {
  const submission = await prisma.paymentSubmission.findFirst({
    where: { id: submissionId },
    select: { id: true, status: true, paymentRequest: { select: { id: true, refCode: true, orgId: true } } },
  });

  if (!submission) throw new AppError("NOT_FOUND", "Not found.");
  if (submission.status !== "SUBMITTED") {
    throw new AppError("BAD_REQUEST", "This submission has already been reviewed.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentSubmission.update({
      where: { id: submission.id },
      data: { status: "REJECTED", reviewedById: actorId, reviewedAt: new Date(), reviewNote: note },
    });

    await tx.paymentRequest.update({
      where: { id: submission.paymentRequest.id },
      data: { status: "PENDING" },
    });
  });

  await audit({
    action: "payment.rejected",
    entityType: "PaymentSubmission",
    entityId: submission.id,
    actorId,
    orgId: submission.paymentRequest.orgId,
    metadata: { refCode: submission.paymentRequest.refCode, note },
  });
}

/** The admin verification queue. */
export async function listPendingSubmissions(orgId?: string | null) {
  return prisma.paymentSubmission.findMany({
    where: {
      status: "SUBMITTED",
      ...(orgId !== undefined ? { paymentRequest: { orgId } } : {}),
    },
    orderBy: { submittedAt: "asc" },
    take: 100,
    select: {
      id: true,
      utr: true,
      method: true,
      amountMinor: true,
      paidAt: true,
      submittedAt: true,
      submitterPhone: true,
      proofDocumentId: true,
      proofDocument: { select: { id: true, fileName: true, mimeType: true } },
      submittedBy: { select: { username: true, displayName: true } },
      paymentRequest: {
        select: {
          refCode: true,
          amountMinor: true,
          purpose: true,
          description: true,
          patient: { select: { fullName: true } },
          org: { select: { name: true } },
          accessRequest: { select: { fullName: true, phone: true } },
        },
      },
    },
  });
}
