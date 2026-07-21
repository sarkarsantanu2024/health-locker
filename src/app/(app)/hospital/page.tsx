import { BedDouble, Building2, HeartPulse } from "lucide-react";
import type { Metadata } from "next";

import { requireTenant } from "@/lib/auth/session";
import { occupancySummary } from "@/modules/provider/admission.service";
import { ProviderDashboard } from "@/modules/provider/ui/dashboard";
import { Stat, StatHero } from "@/ui/stat";
import { toneFor } from "@/ui/tone";

export const metadata: Metadata = { title: "Hospital" };
export const dynamic = "force-dynamic";

/**
 * The one number a hospital cares about that a clinic does not: who is in a
 * bed. It outranks the day's appointments here, so it takes the screen's single
 * hero and the shared dashboard demotes its own.
 */
async function Occupancy() {
  const { orgId } = await requireTenant();
  const summary = await occupancySummary(orgId);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatHero
        label="Currently admitted"
        value={summary.admitted}
        hint="In a bed right now"
        icon={BedDouble}
        tone={toneFor("admission")}
      />
      <Stat
        label="Discharged today"
        value={summary.dischargedToday}
        icon={HeartPulse}
        tone="emerald"
      />
      <Stat
        label="Departments in use"
        value={summary.departments}
        icon={Building2}
        tone={toneFor("department")}
      />
    </div>
  );
}

export default async function HospitalHomePage() {
  return (
    <ProviderDashboard
      title="Hospital"
      base="/hospital"
      hero="extra"
      extra={await Occupancy()}
    />
  );
}
