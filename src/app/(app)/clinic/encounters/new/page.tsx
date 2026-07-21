import type { Metadata } from "next";

import { NewEncounterPage } from "@/modules/provider/ui/encounter-pages";

export const metadata: Metadata = { title: "Record a visit" };
export const dynamic = "force-dynamic";

export default async function RecordVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; appointmentId?: string }>;
}) {
  const { patientId, appointmentId } = await searchParams;

  return <NewEncounterPage base="/clinic" patientId={patientId} appointmentId={appointmentId} />;
}
