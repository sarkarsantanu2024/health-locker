import type { Metadata } from "next";

import { EncounterDetailPage } from "@/modules/provider/ui/encounter-pages";

export const metadata: Metadata = { title: "Visit" };
export const dynamic = "force-dynamic";

export default async function VisitPage({
  params,
}: {
  params: Promise<{ encounterId: string }>;
}) {
  const { encounterId } = await params;

  return <EncounterDetailPage base="/hospital" encounterId={encounterId} />;
}
