import { BedDouble } from "lucide-react";
import type { Metadata } from "next";

import { requireTenant } from "@/lib/auth/session";
import { occupancySummary } from "@/modules/provider/admission.service";
import { ProviderDashboard } from "@/modules/provider/ui/dashboard";
import { Stat } from "@/ui/stat";

export const metadata: Metadata = { title: "Hospital" };
export const dynamic = "force-dynamic";

/** The one number a hospital cares about that a clinic does not: who is in a bed. */
async function Occupancy() {
  const { orgId } = await requireTenant();
  const summary = await occupancySummary(orgId);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Currently admitted" value={summary.admitted} icon={BedDouble} />
      <Stat label="Discharged today" value={summary.dischargedToday} />
      <Stat label="Departments in use" value={summary.departments} />
    </div>
  );
}

export default async function HospitalHomePage() {
  return <ProviderDashboard title="Hospital" base="/hospital" extra={await Occupancy()} />;
}
