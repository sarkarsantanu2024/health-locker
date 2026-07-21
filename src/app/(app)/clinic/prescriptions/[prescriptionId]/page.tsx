import type { Metadata } from "next";

import { PrescriptionPrintPage } from "@/modules/provider/ui/prescription-pages";

export const metadata: Metadata = { title: "Prescription" };
export const dynamic = "force-dynamic";

export default async function PrintPrescriptionPage({
  params,
}: {
  params: Promise<{ prescriptionId: string }>;
}) {
  const { prescriptionId } = await params;

  return <PrescriptionPrintPage base="/clinic" prescriptionId={prescriptionId} />;
}
