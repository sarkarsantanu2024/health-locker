import type { Metadata } from "next";

import { NewReportPage } from "@/modules/provider/ui/diagnostic-pages";

export const metadata: Metadata = { title: "Enter results" };
export const dynamic = "force-dynamic";

export default async function DiagnosticNewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; bookingId?: string; title?: string }>;
}) {
  const { patientId, bookingId, title } = await searchParams;

  return <NewReportPage patientId={patientId} bookingId={bookingId} title={title} />;
}
