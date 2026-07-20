import { Activity, CreditCard, FileText, Pill, Users } from "lucide-react";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { ComingInPhase } from "@/ui/page-header";
import { TileLink } from "@/ui/stat";

export const metadata: Metadata = { title: "My health" };
export const dynamic = "force-dynamic";

function greeting(date = new Date()): string {
  // Asia/Kolkata is the assumed audience; refined per-user in Phase 12.
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function PatientHomePage() {
  const user = await requireUser();

  // Scoped by the session's user id — never by an id from the URL.
  const patient = await prisma.patient.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: {
      id: true,
      familyOf: {
        where: { deletedAt: null },
        select: {
          relationship: true,
          accessLevel: true,
          member: { select: { fullName: true } },
        },
      },
    },
  });

  const firstName = user.displayName.split(" ")[0];

  return (
    <>
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">{greeting()},</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{firstName}</h1>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <TileLink href="/patient/medicines" label="Medicines" value="Schedules and reminders" icon={Pill} tone="primary" />
        <TileLink href="/patient/reports" label="Reports" value="Lab results and scans" icon={FileText} tone="info" />
        <TileLink href="/patient/timeline" label="Timeline" value="Everything, in order" icon={Activity} tone="success" />
        <TileLink href="/patient/billing" label="Billing" value="Plan and payments" icon={CreditCard} tone="accent" />
      </div>

      <Card tone="consumer" className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users aria-hidden className="size-4 text-muted-foreground" />
            Family
          </CardTitle>
          <CardDescription>People you can view or manage.</CardDescription>
        </CardHeader>
        <CardContent>
          {patient?.familyOf.length ? (
            <ul className="divide-y divide-border">
              {patient.familyOf.map((link) => (
                <li key={link.member.fullName} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="font-medium">{link.member.fullName}</span>
                  <span className="text-sm text-muted-foreground">
                    {link.relationship.toLowerCase()} · {link.accessLevel.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {patient
                ? "No family members linked yet."
                : "No patient profile is linked to this account yet."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card tone="consumer">
        <CardHeader>
          <CardTitle>Health timeline</CardTitle>
          <CardDescription>Prescriptions, reports, medicines and expenses in one place.</CardDescription>
        </CardHeader>
        <CardContent>
          <ComingInPhase phase={3} what="Unified health timeline" />
        </CardContent>
      </Card>
    </>
  );
}
