import type { Metadata } from "next";

import { RegisterPatientForm } from "@/modules/provider/ui/register-patient-form";
import { PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Register patient" };
export const dynamic = "force-dynamic";

export default function RegisterPatientPage() {
  return (
    <>
      <PageHeader
        title="Register a patient"
        description="Only a name is required. Everything else can be filled in later."
      />
      <RegisterPatientForm cancelHref="/diagnostic/patients" />
    </>
  );
}
