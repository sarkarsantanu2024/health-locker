import type { Metadata } from "next";

import { ReportsPage } from "@/modules/provider/ui/diagnostic-pages";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default function DiagnosticReportsPage() {
  return <ReportsPage />;
}
