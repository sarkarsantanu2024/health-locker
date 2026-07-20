import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { ComingInPhase, PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const user = await requireUser();

  const [users, orgs, pendingRequests, pendingPayments] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.organization.count({ where: { deletedAt: null } }),
    prisma.accessRequest.count({ where: { deletedAt: null, status: { in: ["PENDING", "AWAITING_PAYMENT"] } } }),
    prisma.paymentSubmission.count({ where: { status: "SUBMITTED" } }),
  ]);

  const stats = [
    { label: "Active users", value: users },
    { label: "Organizations", value: orgs },
    { label: "Onboarding requests", value: pendingRequests },
    { label: "Payments to verify", value: pendingPayments },
  ];

  return (
    <>
      <PageHeader
        title="Platform administration"
        description={`Signed in as ${user.username} (${user.role.replace(/_/g, " ").toLowerCase()})`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-3xl">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Onboarding &amp; provisioning</CardTitle>
            <CardDescription>
              Verify a manual payment, create the account, hand the credentials over by hand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ComingInPhase phase={11} what="Provisioning console" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment verification</CardTitle>
            <CardDescription>UPI / QR / bank submissions awaiting approval.</CardDescription>
          </CardHeader>
          <CardContent>
            <ComingInPhase phase={6} what="Verification queue" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
