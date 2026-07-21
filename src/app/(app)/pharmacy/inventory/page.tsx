import type { Metadata } from "next";

import { InventoryPage } from "@/modules/provider/ui/pharmacy-pages";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function PharmacyInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return <InventoryPage query={q ?? ""} />;
}
