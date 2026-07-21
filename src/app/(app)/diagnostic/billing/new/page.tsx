import type { Metadata } from "next";

import { NewInvoicePage } from "@/modules/provider/ui/billing-pages";

export const metadata: Metadata = { title: "New invoice" };
export const dynamic = "force-dynamic";

export default async function CreateInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; encounterId?: string; admissionId?: string }>;
}) {
  const { patientId, encounterId, admissionId } = await searchParams;

  return (
    <NewInvoicePage
      base="/diagnostic"
      patientId={patientId}
      encounterId={encounterId}
      admissionId={admissionId}
      withDepartments={false}
    />
  );
}
