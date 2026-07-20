import type { Metadata } from "next";

import { ProviderHome } from "@/modules/identity/provider-home";

export const metadata: Metadata = { title: "Clinic" };
export const dynamic = "force-dynamic";

export default function ClinicHomePage() {
  return (
    <ProviderHome
      title="Clinic"
      phase={7}
      feature="Appointments, prescriptions, invoices and the full visit flow"
    />
  );
}
