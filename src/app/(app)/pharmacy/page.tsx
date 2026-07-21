import { CalendarClock, PackageCheck, PackageX, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";

import { requireTenant } from "@/lib/auth/session";
import { pharmacySummary } from "@/modules/provider/pharmacy.service";
import { ProviderDashboard } from "@/modules/provider/ui/dashboard";
import { Stat, StatHero } from "@/ui/stat";
import { toneFor } from "@/ui/tone";

export const metadata: Metadata = { title: "Pharmacy" };
export const dynamic = "force-dynamic";

/**
 * Expiry is the number that costs money if nobody looks at it — but the
 * verification queue is what holds a customer at the counter, so that is the
 * screen's hero and expiry sits beside it in amber and rose.
 */
async function Counter() {
  const { orgId } = await requireTenant();
  const summary = await pharmacySummary(orgId);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatHero
        label="To verify"
        value={summary.toVerify}
        hint="Prescriptions waiting on a pharmacist"
        icon={PackageCheck}
        tone={toneFor("prescription")}
      />
      <Stat label="To pack" value={summary.toPack} icon={ShoppingBag} tone={toneFor("inventory")} />
      <Stat
        label="Expiring in 30 days"
        value={summary.expiringSoon}
        icon={CalendarClock}
        tone={summary.expiringSoon > 0 ? "amber" : "neutral"}
      />
      <Stat
        label="Expired on shelf"
        value={summary.expired}
        icon={PackageX}
        tone={summary.expired > 0 ? toneFor("alert") : "neutral"}
      />
    </div>
  );
}

export default async function PharmacyHomePage() {
  return (
    <ProviderDashboard title="Pharmacy" base="/pharmacy" hero="extra" extra={await Counter()} />
  );
}
