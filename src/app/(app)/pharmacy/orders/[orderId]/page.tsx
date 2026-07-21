import type { Metadata } from "next";

import { OrderDetailPage } from "@/modules/provider/ui/pharmacy-pages";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function PharmacyOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return <OrderDetailPage orderId={orderId} />;
}
