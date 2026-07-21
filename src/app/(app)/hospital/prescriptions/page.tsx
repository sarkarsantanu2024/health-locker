import type { Metadata } from "next";

import { ProviderPrescriptionsPage } from "@/modules/provider/ui/prescription-pages";

export const metadata: Metadata = { title: "Prescriptions" };
export const dynamic = "force-dynamic";

export default function PrescriptionsPage() {
  return <ProviderPrescriptionsPage base="/hospital" />;
}
