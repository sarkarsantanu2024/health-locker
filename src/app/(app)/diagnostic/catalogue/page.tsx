import type { Metadata } from "next";

import { CataloguePage } from "@/modules/provider/ui/diagnostic-pages";

export const metadata: Metadata = { title: "Test catalogue" };
export const dynamic = "force-dynamic";

export default function DiagnosticCataloguePage() {
  return <CataloguePage />;
}
