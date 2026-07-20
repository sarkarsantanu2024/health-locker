import type { Metadata } from "next";

import { ProviderHome } from "@/modules/identity/provider-home";

export const metadata: Metadata = { title: "Diagnostic centre" };
export const dynamic = "force-dynamic";

export default function DiagnosticcentreHomePage() {
  return (
    <ProviderHome
      title="Diagnostic centre"
      phase={9}
      feature="Test catalogue, sample tracking and report publishing"
    />
  );
}
