import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";

import { requireTenant } from "@/lib/auth/session";
import { diagnosticSummary } from "@/modules/provider/diagnostic.service";
import { ProviderDashboard } from "@/modules/provider/ui/dashboard";
import { Stat } from "@/ui/stat";

export const metadata: Metadata = { title: "Diagnostics" };
export const dynamic = "force-dynamic";

/**
 * The verification queue is the number that matters here: a result sitting
 * unverified is a result the patient cannot see.
 */
async function Pipeline() {
  const { orgId } = await requireTenant();
  const summary = await diagnosticSummary(orgId);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Awaiting sample" value={summary.awaitingSample} icon={FlaskConical} />
      <Stat label="In the lab" value={summary.processing} />
      <Stat
        label="Awaiting verification"
        value={summary.awaitingVerification}
        tone={summary.awaitingVerification > 0 ? "warning" : "neutral"}
        hint="Not visible to patients yet"
      />
      <Stat label="Published today" value={summary.publishedToday} />
    </div>
  );
}

export default async function DiagnosticHomePage() {
  return <ProviderDashboard title="Diagnostics" base="/diagnostic" extra={await Pipeline()} />;
}
