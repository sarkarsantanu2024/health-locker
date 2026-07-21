import { CreditCard, Receipt, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { formatDate, humanizeEnum, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getPatientContext } from "@/modules/patient/context";
import { StatusBadge } from "@/modules/provider/ui/status";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { Stat } from "@/ui/stat";
import { TONE_STYLES, toneFor } from "@/ui/tone";

import { AddExpenseForm } from "./expense-form";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

/**
 * The patient's money view: what they owe, what they have paid, and what they
 * have spent out of pocket.
 *
 * Anything unpaid links straight to `/pay/<ref>` — the same public page a
 * self-registering consumer uses. One payment path in the product, not two.
 */
export default async function PatientBillingPage() {
  const context = await getPatientContext();
  const readOnly = context.accessLevel !== "MANAGE";

  const startOfYear = new Date(new Date().getFullYear(), 0, 1);

  const [subscription, invoices, expenses, spendThisYear] = await Promise.all([
    prisma.subscription.findFirst({
      where: { patientId: context.patientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        currentPeriodEnd: true,
        plan: { select: { name: true, priceMinor: true, interval: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { patientId: context.patientId, deletedAt: null, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        number: true,
        status: true,
        totalMinor: true,
        issuedAt: true,
        dueAt: true,
        org: { select: { name: true } },
        paymentRequests: {
          where: { status: { in: ["PENDING", "SUBMITTED"] } },
          select: { refCode: true, status: true },
          take: 1,
        },
      },
    }),
    prisma.expense.findMany({
      where: { patientId: context.patientId, deletedAt: null },
      orderBy: { incurredAt: "desc" },
      take: 30,
      select: {
        id: true,
        category: true,
        amountMinor: true,
        incurredAt: true,
        vendor: true,
        note: true,
      },
    }),
    prisma.expense.aggregate({
      where: { patientId: context.patientId, deletedAt: null, incurredAt: { gte: startOfYear } },
      _sum: { amountMinor: true },
    }),
  ]);

  const outstanding = invoices
    .filter((invoice) => ["ISSUED", "OVERDUE"].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.totalMinor, 0);

  // Money is amber wherever it appears — an expense on the timeline, a bill here.
  const tone = toneFor("expense");
  const style = TONE_STYLES[tone];

  return (
    <>
      <PageHeader
        title="Billing"
        icon={Wallet}
        tone={tone}
        description={
          context.isActingForOther
            ? `${context.patientName}'s plan, bills and spending`
            : "Your plan, bills and spending."
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Outstanding"
          value={money(outstanding)}
          icon={Receipt}
          tone={outstanding > 0 ? tone : "neutral"}
          hint={outstanding > 0 ? "Tap a bill below to pay" : "Nothing due"}
        />
        <Stat
          label="Spent this year"
          value={money(spendThisYear._sum.amountMinor ?? 0)}
          icon={Wallet}
          tone={tone}
          hint="Out of pocket, as recorded by you"
        />
      </div>

      <Card tone="consumer" hue={toneFor("insurance")} className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard aria-hidden className={cn("size-4", TONE_STYLES[toneFor("insurance")].text)} />
            Your plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{subscription.plan.name}</p>
                <p className="text-sm text-muted-foreground">
                  {money(subscription.plan.priceMinor)} ·{" "}
                  {humanizeEnum(subscription.plan.interval).toLowerCase()}
                  {subscription.currentPeriodEnd
                    ? ` · renews ${formatDate(subscription.currentPeriodEnd)}`
                    : ""}
                </p>
              </div>
              <StatusBadge value={subscription.status} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You are on the free plan. Everything in your locker stays yours either way.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold tracking-tight">Bills</h2>
        {invoices.length === 0 ? (
          <EmptyState
            art="wallet"
            tone={tone}
            title="No bills yet"
            description="Invoices from your clinic, hospital or diagnostic centre appear here."
          />
        ) : (
          <ul className="space-y-2">
            {invoices.map((invoice) => {
              const payable = invoice.paymentRequests[0];

              return (
                <li
                  key={invoice.id}
                  className={cn(
                    "bg-hue-wash flex flex-wrap items-center justify-between gap-3 rounded-consumer border border-border bg-surface p-4",
                    style.gradientVars,
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-2xl",
                        style.chipSolid,
                      )}
                    >
                      <Receipt aria-hidden className="size-5" />
                      <span className="sr-only">Bill</span>
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{invoice.org?.name ?? "HealthLocker"}</p>
                      <p className="text-sm text-muted-foreground">
                        {invoice.number}
                        {invoice.issuedAt ? ` · ${formatDate(invoice.issuedAt)}` : ""}
                        {invoice.dueAt ? ` · due ${formatDate(invoice.dueAt)}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{money(invoice.totalMinor)}</span>
                    {payable && !readOnly ? (
                      <Link href={`/pay/${payable.refCode}`} className={buttonVariants({ size: "sm" })}>
                        Pay
                      </Link>
                    ) : (
                      <StatusBadge value={invoice.status} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold tracking-tight">Out-of-pocket spending</h2>

        {expenses.length === 0 ? (
          <EmptyState
            art="wallet"
            tone={tone}
            title="Nothing recorded"
            description="Track what you spend at the chemist or on tests, so the yearly total is real."
          />
        ) : (
          <ul
            className={cn(
              "bg-hue-wash divide-y divide-border rounded-consumer border border-border bg-surface",
              style.gradientVars,
            )}
          >
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-center gap-3.5 p-4">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-2xl",
                    style.chipSolid,
                  )}
                >
                  <Wallet aria-hidden className="size-5" />
                  <span className="sr-only">Expense</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{humanizeEnum(expense.category)}</p>
                  <p className="text-sm text-muted-foreground">
                    {[formatDate(expense.incurredAt), expense.vendor, expense.note]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="font-medium">{money(expense.amountMinor)}</span>
              </li>
            ))}
          </ul>
        )}

        {readOnly ? null : <AddExpenseForm />}
      </section>
    </>
  );
}
