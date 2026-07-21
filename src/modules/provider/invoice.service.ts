import { Prisma } from "@prisma/client";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatDate, money } from "@/lib/format";
import { createPaymentRequest } from "@/modules/billing/payment.service";
import { notifyPatient } from "@/modules/notify/notify.service";
import { requirePatientOfOrg } from "@/modules/provider/patients.service";
import { AppError } from "@/shared/errors";
import type { InvoiceStatus } from "@/shared/enums";

/**
 * Provider-side invoicing.
 *
 * Money is only ever an integer count of paise, and every total is recomputed
 * from the line items on the server. A client-supplied total is never trusted:
 * a form that posts its own arithmetic is a form that can be edited to say
 * whatever the payer likes.
 *
 * There is no gateway. Collecting is a `PaymentRequest` against the tenant's own
 * merchant profile, verified by a human — the same flow as consumer
 * subscriptions, so there is one payment path in the product, not two.
 */

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  departmentId?: string | null;
}

export interface CreateInvoiceInput {
  patientId: string;
  items: InvoiceItemInput[];
  encounterId?: string | null;
  admissionId?: string | null;
  discountMinor?: number;
  taxMinor?: number;
  dueAt?: Date | null;
  notes?: string | null;
}

/** `INV-2026-00042`, unique per tenant. Human-facing, so it is not a cuid. */
async function nextInvoiceNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { orgId, number: { startsWith: `INV-${year}-` } },
  });

  return `INV-${year}-${String(count + 1).padStart(5, "0")}`;
}

export function computeTotals(
  items: InvoiceItemInput[],
  discountMinor = 0,
  taxMinor = 0,
): { subtotalMinor: number; totalMinor: number; lines: (InvoiceItemInput & { amountMinor: number })[] } {
  const lines = items.map((item) => ({
    ...item,
    amountMinor: item.quantity * item.unitPriceMinor,
  }));

  const subtotalMinor = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  // Clamped at zero: a discount larger than the bill must not produce a negative
  // invoice that would then be "collected" from the clinic.
  const totalMinor = Math.max(0, subtotalMinor - discountMinor + taxMinor);

  return { subtotalMinor, totalMinor, lines };
}

export async function createInvoice(
  orgId: string,
  input: CreateInvoiceInput,
  actorId: string,
): Promise<{ id: string; number: string; totalMinor: number }> {
  await requirePatientOfOrg(orgId, input.patientId);

  if (input.items.length === 0) {
    throw new AppError("VALIDATION_FAILED", "Add at least one line.", { field: "items" });
  }

  for (const item of input.items) {
    if (!Number.isInteger(item.unitPriceMinor) || item.unitPriceMinor < 0) {
      throw new AppError("VALIDATION_FAILED", "Enter a valid price for every line.", {
        field: "items",
      });
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new AppError("VALIDATION_FAILED", "Quantity must be at least 1.", { field: "items" });
    }
  }

  const { subtotalMinor, totalMinor, lines } = computeTotals(
    input.items,
    input.discountMinor ?? 0,
    input.taxMinor ?? 0,
  );

  let number = await nextInvoiceNumber(orgId);
  let invoice: { id: string; number: string } | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      invoice = await prisma.invoice.create({
        data: {
          number,
          orgId,
          patientId: input.patientId,
          encounterId: input.encounterId ?? null,
          admissionId: input.admissionId ?? null,
          status: "DRAFT",
          subtotalMinor,
          discountMinor: input.discountMinor ?? 0,
          taxMinor: input.taxMinor ?? 0,
          totalMinor,
          dueAt: input.dueAt ?? null,
          notes: input.notes ?? null,
          items: {
            create: lines.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
              amountMinor: line.amountMinor,
              departmentId: line.departmentId ?? null,
            })),
          },
        },
        select: { id: true, number: true },
      });
      break;
    } catch (error) {
      const conflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

      if (!conflict || attempt === 4) throw error;

      number = `${number.slice(0, -5)}${String(Number(number.slice(-5)) + 1).padStart(5, "0")}`;
    }
  }

  await audit({
    action: "invoice:created",
    entityType: "Invoice",
    entityId: invoice!.id,
    actorId,
    orgId,
    metadata: { number: invoice!.number, totalMinor, patientId: input.patientId },
  });

  return { id: invoice!.id, number: invoice!.number, totalMinor };
}

/**
 * Draft → issued. This is the point the bill becomes real: it is what the
 * patient sees, what the reminder job chases, and what can be collected against.
 */
export async function issueInvoice(
  orgId: string,
  invoiceId: string,
  actorId: string,
): Promise<{ refCode: string | null }> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId, deletedAt: null },
    select: { id: true, number: true, status: true, totalMinor: true, patientId: true, dueAt: true },
  });

  if (!invoice) throw new AppError("NOT_FOUND", "Not found.");
  if (invoice.status !== "DRAFT") {
    throw new AppError("BAD_REQUEST", "Only a draft invoice can be issued.");
  }
  if (invoice.totalMinor <= 0) {
    throw new AppError("BAD_REQUEST", "A zero-value invoice cannot be issued.");
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "ISSUED", issuedAt: new Date() },
  });

  // A payment request against the tenant's own merchant profile. If the tenant
  // has not configured one, the invoice is still issued — they may well collect
  // in cash — so this failure is soft.
  let refCode: string | null = null;

  try {
    const request = await createPaymentRequest(
      {
        amountMinor: invoice.totalMinor,
        purpose: "INVOICE",
        description: `Invoice ${invoice.number}`,
        patientId: invoice.patientId,
        orgId,
        invoiceId: invoice.id,
        merchantOrgId: orgId,
        expiresInHours: 24 * 30,
      },
      actorId,
    );

    refCode = request.refCode;
  } catch (error) {
    console.warn("[invoice] issued without a payment request", { invoiceId, error });
  }

  await audit({
    action: "invoice:issued",
    entityType: "Invoice",
    entityId: invoice.id,
    actorId,
    orgId,
    metadata: { number: invoice.number, totalMinor: invoice.totalMinor, refCode },
  });

  await notifyPatient(invoice.patientId, {
    type: "PAYMENT_DUE",
    title: `Invoice ${invoice.number}`,
    body: `${money(invoice.totalMinor)}${invoice.dueAt ? ` · due ${formatDate(invoice.dueAt)}` : ""}`,
    data: { url: refCode ? `/pay/${refCode}` : "/patient/billing", invoiceId: invoice.id },
    dedupeKey: `invoice-issued:${invoice.id}`,
  });

  return { refCode };
}

/**
 * Void, never delete. A financial record that vanishes is indistinguishable from
 * one that never existed, which is exactly what an audit has to rule out.
 */
export async function voidInvoice(
  orgId: string,
  invoiceId: string,
  actorId: string,
  reason: string,
): Promise<void> {
  const result = await prisma.invoice.updateMany({
    where: { id: invoiceId, orgId, deletedAt: null, status: { in: ["DRAFT", "ISSUED", "OVERDUE"] } },
    data: { status: "VOID", notes: reason },
  });

  if (result.count === 0) {
    throw new AppError("BAD_REQUEST", "That invoice cannot be voided.");
  }

  // Any outstanding ask for money goes with it, or the patient keeps seeing a
  // live pay page for a bill that was cancelled.
  await prisma.paymentRequest.updateMany({
    where: { invoiceId, status: { in: ["PENDING", "SUBMITTED"] } },
    data: { status: "CANCELLED" },
  });

  await audit({
    action: "invoice:voided",
    entityType: "Invoice",
    entityId: invoiceId,
    actorId,
    orgId,
    metadata: { reason },
  });
}

export async function listInvoices(
  orgId: string,
  filters: { status?: InvoiceStatus; patientId?: string } = {},
) {
  return prisma.invoice.findMany({
    where: {
      orgId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.patientId ? { patientId: filters.patientId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      status: true,
      totalMinor: true,
      issuedAt: true,
      dueAt: true,
      paidAt: true,
      createdAt: true,
      patientId: true,
      patient: { select: { fullName: true, phone: true } },
      paymentRequests: {
        where: { status: { in: ["PENDING", "SUBMITTED"] } },
        select: { refCode: true, status: true },
        take: 1,
      },
    },
  });
}

export async function getInvoice(orgId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      subtotalMinor: true,
      discountMinor: true,
      taxMinor: true,
      totalMinor: true,
      issuedAt: true,
      dueAt: true,
      paidAt: true,
      notes: true,
      patient: { select: { id: true, fullName: true, phone: true, addressLine: true, city: true } },
      org: { select: { name: true, addressLine: true, city: true, phone: true, licenceNo: true } },
      items: {
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPriceMinor: true,
          amountMinor: true,
          department: { select: { name: true } },
        },
      },
      paymentRequests: {
        orderBy: { createdAt: "desc" },
        select: { refCode: true, status: true, amountMinor: true },
      },
    },
  });

  if (!invoice) throw new AppError("NOT_FOUND", "Not found.");

  return invoice;
}

/** Revenue summary for the tenant dashboard. */
export async function revenueSummary(orgId: string) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [paid, outstanding, drafts] = await Promise.all([
    prisma.invoice.aggregate({
      where: { orgId, deletedAt: null, status: "PAID", paidAt: { gte: startOfMonth } },
      _sum: { totalMinor: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { orgId, deletedAt: null, status: { in: ["ISSUED", "OVERDUE"] } },
      _sum: { totalMinor: true },
      _count: true,
    }),
    prisma.invoice.count({ where: { orgId, deletedAt: null, status: "DRAFT" } }),
  ]);

  return {
    paidThisMonthMinor: paid._sum.totalMinor ?? 0,
    paidThisMonthCount: paid._count,
    outstandingMinor: outstanding._sum.totalMinor ?? 0,
    outstandingCount: outstanding._count,
    draftCount: drafts,
  };
}
