import { Banknote, Building2, ClipboardList, CreditCard, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { revenueSummary } from "@/modules/admin/admin.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { Stat } from "@/ui/stat";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

function money(minor: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export default async function AdminHomePage() {
  const user = await requireUser();

  const [revenue, users, pendingUsers, orgs, pendingRequests] = await Promise.all([
    revenueSummary(),
    prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.user.count({ where: { deletedAt: null, status: "PENDING_ACTIVATION" } }),
    prisma.organization.count({ where: { deletedAt: null, type: { not: "PLATFORM" } } }),
    prisma.accessRequest.count({
      where: { deletedAt: null, status: { in: ["PENDING", "AWAITING_PAYMENT"] } },
    }),
  ]);

  const queues = [
    {
      href: "/admin/payments",
      label: "Payments to verify",
      value: revenue.pendingVerification,
      icon: Banknote,
      description: "Check the screenshot and UTR, then approve.",
    },
    {
      href: "/admin/onboarding",
      label: "Onboarding waiting",
      value: pendingRequests,
      icon: ClipboardList,
      description: "Sign-ups and enquiries needing action.",
    },
    {
      href: "/admin/users",
      label: "Awaiting activation",
      value: pendingUsers,
      icon: Users,
      description: "Signed up, payment not yet confirmed.",
    },
  ];

  return (
    <>
      <PageHeader
        title="Platform administration"
        description={`Signed in as ${user.username}`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Collected this month"
          value={money(revenue.monthMinor)}
          icon={CreditCard}
          hint={`${revenue.monthCount} approved payment${revenue.monthCount === 1 ? "" : "s"}`}
          tone="primary"
        />
        <Stat label="Collected this year" value={money(revenue.yearMinor)} icon={Banknote} />
        <Stat
          label="Active subscriptions"
          value={revenue.activeSubscriptions}
          icon={ShieldCheck}
        />
        <Stat label="Tenants" value={orgs} icon={Building2} hint={`${users} active users`} />
      </div>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Needs your attention</h2>

      <div className="grid gap-3 md:grid-cols-3">
        {queues.map((queue) => {
          const Icon = queue.icon;
          const waiting = queue.value > 0;

          return (
            <Link key={queue.href} href={queue.href} className="block">
              <Card interactive className="h-full">
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-sm">{queue.label}</CardTitle>
                    <CardDescription className="mt-1">{queue.description}</CardDescription>
                  </div>
                  <Icon
                    aria-hidden
                    className={`size-4 shrink-0 ${waiting ? "text-warning" : "text-muted-foreground"}`}
                  />
                </CardHeader>
                <CardContent>
                  <p className={`text-3xl font-semibold ${waiting ? "text-warning" : ""}`}>
                    {queue.value}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Revenue counts approved payments only — a submitted claim is not money until you have
        matched it against your bank statement.
      </p>
    </>
  );
}
