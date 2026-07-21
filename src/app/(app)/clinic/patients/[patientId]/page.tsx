import type { Metadata } from "next";

import { ProviderPatientDetail } from "@/modules/provider/ui/patient-detail";

export const metadata: Metadata = { title: "Patient" };
export const dynamic = "force-dynamic";

export default async function PatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  return <ProviderPatientDetail base="/clinic" patientId={patientId} canPrescribe={true} />;
}
