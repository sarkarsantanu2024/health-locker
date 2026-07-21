import type { Metadata } from "next";

import { ProviderStaffPage } from "@/modules/provider/ui/staff-page";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default function StaffPage() {
  return <ProviderStaffPage />;
}
