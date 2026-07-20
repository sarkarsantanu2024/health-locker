import { Banknote, Building2, ClipboardList, Users } from "lucide-react";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { ComingInPhase, PageHeader } from "@/ui/page-header";
import { Stat } from "@/ui/stat";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const user = await requireUser();

  const [users, pendingUsers, orgs, pendingRequests, pendingPayments] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.user.count({ where: { deletedAt: null, status: "PENDING_ACTIVATION" } }),
    prisma.organization.count({ where: { deletedAt: null } }),
    prisma.accessRequest.count({
      where: { deletedAt: null, status: { in: ["PENDING", "AWAITING_PAYMENT"] } },
    }),
    prisma.paymentSubmission.count({ where: { status: "SUBMITTED" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Platform administration"
        description={`Signed in as ${user.username}`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active users" value={users} icon={Users} />
        <Stat
          label="Awaiting activation"
          value={pendingUsers}
          icon={ClipboardList}
          tone={pendingUsers > 0 ? "warning" : "neutral"}
          hint={pendingUsers > 0 ? "Signed up, payment not yet verified" : "Nothing waiting"}
        />
        <Stat label="Organizations" value={orgs} icon={Building2} />
        <Stat
          label="Payments to verify"
          value={pendingPayments}
          icon={Banknote}
          tone={pendingPayments > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Onboarding &amp; provisioning</CardTitle>
            <CardDescription>
              {pendingRequests > 0
                ? `${pendingRequests} request${pendingRequests === 1 ? "" : "s"} waiting on payment verification.`
                : "Verify a payment, then activate the account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ComingInPhase phase={11} what="Provisioning console" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment verification</CardTitle>
            <CardDescription>UPI, QR and bank submissions awaiting approval.</CardDescription>
          </CardHeader>
          <CardContent>
            <ComingInPhase phase={6} what="Verification queue" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
