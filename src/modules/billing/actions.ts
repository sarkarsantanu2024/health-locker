"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession, requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import {
  approvePayment,
  createPaymentRequest,
  rejectPayment,
  submitPayment,
} from "@/modules/billing/payment.service";
import { getPatientContext } from "@/modules/patient/context";
import { AppError } from "@/shared/errors";
import {
  rejectPaymentSchema,
  reviewPaymentSchema,
  startSubscriptionSchema,
  submitPaymentSchema,
} from "@/shared/schemas/billing";

export interface BillingActionState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
}

function toState(error: unknown): BillingActionState {
  if (error instanceof AppError) {
    const field = (error.details as { field?: string } | undefined)?.field;
    return field
      ? { ok: false, fieldErrors: { [field]: [error.message] } }
      : { ok: false, error: error.message };
  }

  console.error("[billing action] unexpected error", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/** Patient chooses a plan → we raise a request and send them to the pay page. */
export async function startSubscriptionAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const parsed = startSubscriptionSchema.safeParse({ planId: formData.get("planId") });

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  let refCode: string;

  try {
    const context = await getPatientContext();

    const plan = await prisma.plan.findFirst({
      where: { id: parsed.data.planId, isActive: true, deletedAt: null, audience: "PATIENT" },
      select: { id: true, name: true, priceMinor: true },
    });

    if (!plan) throw new AppError("NOT_FOUND", "That plan is not available.");
    if (plan.priceMinor === 0) {
      throw new AppError("BAD_REQUEST", "The free plan does not need a payment.");
    }

    const subscription = await prisma.subscription.create({
      data: { planId: plan.id, patientId: context.ownPatientId, status: "PENDING" },
      select: { id: true },
    });

    const request = await createPaymentRequest(
      {
        amountMinor: plan.priceMinor,
        purpose: "SUBSCRIPTION",
        description: `${plan.name} subscription`,
        patientId: context.ownPatientId,
        subscriptionId: subscription.id,
        expiresInHours: 72,
      },
      context.user.id,
    );

    refCode = request.refCode;
  } catch (error) {
    return toState(error);
  }

  redirect(`/pay/${refCode}`);
}

/**
 * The payer files their transaction reference. Deliberately callable without a
 * session — a self-registered consumer pays BEFORE their account is activated,
 * so requiring a login here would deadlock onboarding.
 */
export async function submitPaymentAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const parsed = submitPaymentSchema.safeParse({
    refCode: formData.get("refCode"),
    utr: formData.get("utr"),
    method: formData.get("method") ?? "UPI",
    paidAt: formData.get("paidAt") ?? "",
    proofDocumentId: formData.get("proofDocumentId") ?? "",
    submitterPhone: formData.get("submitterPhone") ?? "",
  });

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    // Unauthenticated endpoint, so it is throttled by reference code — guessing
    // UTRs against one request should not be cheap.
    const throttle = await rateLimit("payment-submit", parsed.data.refCode, {
      tokens: 5,
      window: "1 h",
    });
    if (!throttle.success) {
      throw new AppError("RATE_LIMITED", "Too many attempts. Please contact support.");
    }

    const session = await getSession();

    await submitPayment({
      refCode: parsed.data.refCode,
      utr: parsed.data.utr,
      method: parsed.data.method,
      paidAt: parsed.data.paidAt,
      proofDocumentId: parsed.data.proofDocumentId || null,
      submittedById: session?.id ?? null,
      submitterPhone: parsed.data.submitterPhone || null,
    });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/pay/${parsed.data.refCode}`);
  return {
    ok: true,
    message: "Thank you. We will confirm your payment and activate your account shortly.",
  };
}

export async function approvePaymentAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const parsed = reviewPaymentSchema.safeParse({
    submissionId: formData.get("submissionId"),
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) return { ok: false, error: "Could not identify that submission." };

  try {
    const actor = await requirePermission("payment:verify");
    const result = await approvePayment(parsed.data.submissionId, actor.id, parsed.data.note || undefined);

    revalidatePath("/admin/payments");
    return {
      ok: true,
      message: result.alreadyApproved ? "Already approved." : "Payment approved and access activated.",
    };
  } catch (error) {
    return toState(error);
  }
}

export async function rejectPaymentAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const parsed = rejectPaymentSchema.safeParse({
    submissionId: formData.get("submissionId"),
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const actor = await requirePermission("payment:verify");
    await rejectPayment(parsed.data.submissionId, actor.id, parsed.data.note);

    revalidatePath("/admin/payments");
    return { ok: true, message: "Payment rejected. The payer can submit a corrected reference." };
  } catch (error) {
    return toState(error);
  }
}
