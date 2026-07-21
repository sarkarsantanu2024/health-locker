import type { Metadata } from "next";

import { ProviderPatientsPage } from "@/modules/provider/ui/patients-page";

export const metadata: Metadata = { title: "Patients" };
export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return <ProviderPatientsPage base="/clinic" query={q ?? ""} />;
}
