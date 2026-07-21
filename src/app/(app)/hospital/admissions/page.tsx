import type { Metadata } from "next";

import { AdmissionsPage } from "@/modules/provider/ui/admission-pages";

export const metadata: Metadata = { title: "Admissions" };
export const dynamic = "force-dynamic";

export default async function HospitalAdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const { patientId } = await searchParams;

  return <AdmissionsPage patientId={patientId} />;
}
