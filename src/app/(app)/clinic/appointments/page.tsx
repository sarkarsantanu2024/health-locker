import type { Metadata } from "next";

import { ProviderAppointmentsPage } from "@/modules/provider/ui/appointments-page";

export const metadata: Metadata = { title: "Appointments" };
export const dynamic = "force-dynamic";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; patientId?: string }>;
}) {
  const { date, patientId } = await searchParams;

  return <ProviderAppointmentsPage base="/clinic" date={date} patientId={patientId} />;
}
