import { PackageCheck } from "lucide-react";
import type { Metadata } from "next";

import { requireTenant } from "@/lib/auth/session";
import { pharmacySummary } from "@/modules/provider/pharmacy.service";
import { ProviderDashboard } from "@/modules/provider/ui/dashboard";
import { Stat } from "@/ui/stat";

export const metadata: Metadata = { title: "Pharmacy" };
export const dynamic = "force-dynamic";

/** Expiry is the number that costs money if nobody looks at it. */
async function Counter() {
  const { orgId } = await requireTenant();
  const summary = await pharmacySummary(orgId);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="To verify" value={summary.toVerify} icon={PackageCheck} tone={summary.toVerify > 0 ? "warning" : "neutral"} />
      <Stat label="To pack" value={summary.toPack} />
      <Stat label="Expiring in 30 days" value={summary.expiringSoon} tone={summary.expiringSoon > 0 ? "warning" : "neutral"} />
      <Stat label="Expired on shelf" value={summary.expired} tone={summary.expired > 0 ? "danger" : "neutral"} />
    </div>
  );
}

export default async function PharmacyHomePage() {
  return <ProviderDashboard title="Pharmacy" base="/pharmacy" extra={await Counter()} />;
}
