import type { Metadata } from "next";

import { DepartmentsPage } from "@/modules/provider/ui/admission-pages";

export const metadata: Metadata = { title: "Departments" };
export const dynamic = "force-dynamic";

export default function HospitalDepartmentsPage() {
  return <DepartmentsPage />;
}
