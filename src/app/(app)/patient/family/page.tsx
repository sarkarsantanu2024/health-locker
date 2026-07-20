import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { FamilyClient } from "@/app/(app)/patient/family/family-client";
import { getPatientContext } from "@/modules/patient/context";
import { listFamily } from "@/modules/patient/patient.service";
import { PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Family" };
export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const context = await getPatientContext();

  // Family is always listed from the caller's OWN record, never the acting one —
  // otherwise switching to a relative would show that relative's family tree.
  const [links, own] = await Promise.all([
    listFamily(context.ownPatientId),
    // context.patientName is whoever is being ACTED FOR, so the caller's own
    // name has to be read separately.
    prisma.patient.findUnique({
      where: { id: context.ownPatientId },
      select: { fullName: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Family"
        description="Switch between records and manage who you can act for."
      />

      <FamilyClient
        ownName={own?.fullName ?? "You"}
        ownPatientId={context.ownPatientId}
        isActingForOther={context.isActingForOther}
        members={links.map((link) => ({
          linkId: link.id,
          memberId: link.member.id,
          fullName: link.member.fullName,
          relationship: link.relationship,
          accessLevel: link.accessLevel,
          isActive: link.member.id === context.patientId,
        }))}
      />
    </>
  );
}
