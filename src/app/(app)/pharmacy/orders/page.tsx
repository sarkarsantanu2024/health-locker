import type { Metadata } from "next";

import { OrdersPage } from "@/modules/provider/ui/pharmacy-pages";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default function PharmacyOrdersPage() {
  return <OrdersPage />;
}
