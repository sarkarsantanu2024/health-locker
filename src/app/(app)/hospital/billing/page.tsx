import type { Metadata } from "next";

import { ProviderBillingPage } from "@/modules/provider/ui/billing-pages";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default function BillingPage() {
  return <ProviderBillingPage base="/hospital" />;
}
