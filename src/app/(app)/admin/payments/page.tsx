import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PaymentQueue } from "@/app/(app)/admin/payments/payment-queue";
import { listPendingSubmissions } from "@/modules/billing/payment.service";
import { PageHeader } from "@/ui/page-header";
import { Stat } from "@/ui/stat";
import { Banknote, CheckCircle2, Clock } from "lucide-react";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  await requirePermission("payment:verify");

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [submissions, approvedThisMonth, revenue] = await Promise.all([
    // undefined = every tenant, including the platform's own (orgId null).
    listPendingSubmissions(undefined),
    prisma.paymentSubmission.count({
      where: { status: "APPROVED", reviewedAt: { gte: startOfMonth } },
    }),
    // Revenue counts APPROVED payments only — a submitted claim is not money.
    prisma.paymentRequest.aggregate({
      where: { status: "APPROVED", settledAt: { gte: startOfMonth } },
      _sum: { amountMinor: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Approve or reject submitted UPI, QR and bank payments."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Awaiting review"
          value={submissions.length}
          icon={Clock}
          tone={submissions.length > 0 ? "warning" : "neutral"}
        />
        <Stat label="Approved this month" value={approvedThisMonth} icon={CheckCircle2} />
        <Stat
          label="Collected this month"
          value={new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0,
          }).format((revenue._sum.amountMinor ?? 0) / 100)}
          icon={Banknote}
          hint="Approved payments only"
        />
      </div>

      <PaymentQueue
        submissions={submissions.map((submission) => ({
          id: submission.id,
          utr: submission.utr,
          method: submission.method,
          amountMinor: submission.amountMinor ?? submission.paymentRequest.amountMinor,
          requestedMinor: submission.paymentRequest.amountMinor,
          paidAt: submission.paidAt?.toISOString() ?? null,
          submittedAt: submission.submittedAt.toISOString(),
          refCode: submission.paymentRequest.refCode,
          purpose: submission.paymentRequest.purpose,
          description: submission.paymentRequest.description,
          payer:
            submission.paymentRequest.patient?.fullName ??
            submission.paymentRequest.org?.name ??
            submission.paymentRequest.accessRequest?.fullName ??
            submission.submittedBy?.displayName ??
            "Unknown",
          payerPhone:
            submission.submitterPhone ?? submission.paymentRequest.accessRequest?.phone ?? null,
          proofDocumentId: submission.proofDocumentId,
          proofIsPdf: submission.proofDocument?.mimeType === "application/pdf",
        }))}
      />
    </>
  );
}
