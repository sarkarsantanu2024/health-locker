import type { Metadata } from "next";

import { ReportDetailPage } from "@/modules/provider/ui/diagnostic-pages";

export const metadata: Metadata = { title: "Report" };
export const dynamic = "force-dynamic";

export default async function DiagnosticReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;

  return <ReportDetailPage reportId={reportId} />;
}
