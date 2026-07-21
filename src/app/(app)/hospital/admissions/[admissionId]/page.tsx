import type { Metadata } from "next";

import { AdmissionDetailPage } from "@/modules/provider/ui/admission-pages";

export const metadata: Metadata = { title: "Admission" };
export const dynamic = "force-dynamic";

export default async function HospitalAdmissionPage({
  params,
}: {
  params: Promise<{ admissionId: string }>;
}) {
  const { admissionId } = await params;

  return <AdmissionDetailPage admissionId={admissionId} />;
}
