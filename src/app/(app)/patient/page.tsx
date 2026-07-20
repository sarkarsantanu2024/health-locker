import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { ComingInPhase, PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "My health" };
export const dynamic = "force-dynamic";

export default async function PatientHomePage() {
  const user = await requireUser();

  // Scoped by the session's user id — never by an id from the URL.
  const patient = await prisma.patient.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      familyOf: {
        where: { deletedAt: null },
        select: { relationship: true, accessLevel: true, member: { select: { fullName: true } } },
      },
    },
  });

  return (
    <>
      <PageHeader
        title={`Hello, ${user.displayName.split(" ")[0]}`}
        description="Your records, medicines and family in one place."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Family</CardTitle>
            <CardDescription>People you can act for.</CardDescription>
          </CardHeader>
          <CardContent>
            {patient?.familyOf.length ? (
              <ul className="space-y-2 text-sm">
                {patient.familyOf.map((link) => (
                  <li key={link.member.fullName} className="flex justify-between gap-4">
                    <span>{link.member.fullName}</span>
                    <span className="text-muted-foreground">
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

        <Card>
          <CardHeader>
            <CardTitle>Health timeline</CardTitle>
            <CardDescription>Prescriptions, reports, medicines and expenses.</CardDescription>
          </CardHeader>
          <CardContent>
            <ComingInPhase phase={3} what="Unified health timeline" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
