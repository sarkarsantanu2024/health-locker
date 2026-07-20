import type { Metadata } from "next";

import { ProviderHome } from "@/modules/identity/provider-home";

export const metadata: Metadata = { title: "Pharmacy" };
export const dynamic = "force-dynamic";

export default function PharmacyHomePage() {
  return (
    <ProviderHome
      title="Pharmacy"
      phase={10}
      feature="Inventory with batches and expiry, prescription verification and orders"
    />
  );
}
