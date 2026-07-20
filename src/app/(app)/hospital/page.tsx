import type { Metadata } from "next";

import { ProviderHome } from "@/modules/identity/provider-home";

export const metadata: Metadata = { title: "Hospital" };
export const dynamic = "force-dynamic";

export default function HospitalHomePage() {
  return (
    <ProviderHome
      title="Hospital"
      phase={8}
      feature="Departments, admissions, discharge and itemised billing"
    />
  );
}
