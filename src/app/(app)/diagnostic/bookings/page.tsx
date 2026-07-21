import type { Metadata } from "next";

import { BookingsPage } from "@/modules/provider/ui/diagnostic-pages";

export const metadata: Metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

export default async function DiagnosticBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const { patientId } = await searchParams;

  return <BookingsPage patientId={patientId} />;
}
