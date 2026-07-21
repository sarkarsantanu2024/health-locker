import type { Metadata } from "next";

import { InvoiceDetailPage } from "@/modules/provider/ui/billing-pages";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;

  return <InvoiceDetailPage base="/clinic" invoiceId={invoiceId} />;
}
