import type { Metadata } from "next";

import { ProviderDashboard } from "@/modules/provider/ui/dashboard";

export const metadata: Metadata = { title: "Clinic" };
export const dynamic = "force-dynamic";

export default function ClinicHomePage() {
  return <ProviderDashboard title="Clinic" base="/clinic" />;
}
