import { UserPlus } from "lucide-react";
import type { Metadata } from "next";

import { RegisterPatientForm } from "@/modules/provider/ui/register-patient-form";
import { PageHeader } from "@/ui/page-header";
import { toneFor } from "@/ui/tone";

export const metadata: Metadata = { title: "Register patient" };
export const dynamic = "force-dynamic";

export default function RegisterPatientPage() {
  return (
    <>
      <PageHeader
        title="Register a patient"
        icon={UserPlus}
        tone={toneFor("patient")}
        description="Only a name is required. Everything else can be filled in later."
      />
      <RegisterPatientForm cancelHref="/pharmacy/patients" />
    </>
  );
}
