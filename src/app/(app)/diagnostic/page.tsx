import { CheckCircle2, FlaskConical, Microscope, TestTube } from "lucide-react";
import type { Metadata } from "next";

import { requireTenant } from "@/lib/auth/session";
import { diagnosticSummary } from "@/modules/provider/diagnostic.service";
import { ProviderDashboard } from "@/modules/provider/ui/dashboard";
import { Stat, StatHero } from "@/ui/stat";
import { toneFor } from "@/ui/tone";

export const metadata: Metadata = { title: "Diagnostics" };
export const dynamic = "force-dynamic";

/**
 * The verification queue is the number that matters here: a result sitting
 * unverified is a result the patient cannot see. It takes the screen's one
 * hero, in amber, because it is a queue somebody has to clear.
 */
async function Pipeline() {
  const { orgId } = await requireTenant();
  const summary = await diagnosticSummary(orgId);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatHero
        label="Awaiting verification"
        value={summary.awaitingVerification}
        hint="Not visible to patients yet"
        icon={FlaskConical}
        tone="amber"
      />
      <Stat
        label="Awaiting sample"
        value={summary.awaitingSample}
        icon={TestTube}
        tone={toneFor("appointment")}
      />
      <Stat
        label="In the lab"
        value={summary.processing}
        icon={Microscope}
        tone={toneFor("report")}
      />
      <Stat
        label="Published today"
        value={summary.publishedToday}
        icon={CheckCircle2}
        tone="emerald"
      />
    </div>
  );
}

export default async function DiagnosticHomePage() {
  return (
    <ProviderDashboard
      title="Diagnostics"
      base="/diagnostic"
      hero="extra"
      extra={await Pipeline()}
    />
  );
}
