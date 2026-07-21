import { Printer } from "lucide-react";
import Link from "next/link";

import { hasPermission, requireTenantPermission } from "@/lib/auth/session";
import { ageFrom, formatDate, formatDateTime, humanizeEnum, money } from "@/lib/format";
import { getEncounter } from "@/modules/provider/clinical.service";
import { listPractitioners, searchPatients } from "@/modules/provider/patients.service";
import { PrescriptionForm, RecordEncounterForm } from "@/modules/provider/ui/encounter-client";
import { StatusBadge } from "@/modules/provider/ui/status";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";

export async function NewEncounterPage({
  base,
  patientId,
  appointmentId,
}: {
  base: string;
  patientId?: string;
  appointmentId?: string;
}) {
  const { orgId } = await requireTenantPermission("encounter:manage");

  const [patients, practitioners] = await Promise.all([
    searchPatients(orgId, "", { take: 200 }),
    listPractitioners(orgId),
  ]);

  return (
    <>
      <PageHeader
        title="Record a visit"
        description="Saving this closes the appointment and adds the visit to the patient's timeline."
        action={
          <Link
            href={`${base}/appointments`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Back to the diary
          </Link>
        }
      />

      <RecordEncounterForm
        patients={patients.map((patient) => ({
          id: patient.id,
          fullName: patient.fullName,
          mrn: patient.mrn,
          phone: patient.phone,
        }))}
        practitioners={practitioners}
        defaultPatientId={patientId}
        appointmentId={appointmentId}
      />
    </>
  );
}

/**
 * A recorded visit, with the prescription pad attached.
 *
 * The prescription is written here rather than on its own screen because it is
 * part of the same act: a prescription with no consultation behind it is exactly
 * the record that later cannot be justified.
 */
export async function EncounterDetailPage({
  base,
  encounterId,
}: {
  base: string;
  encounterId: string;
}) {
  const { user, orgId } = await requireTenantPermission("encounter:read");
  const encounter = await getEncounter(orgId, encounterId);
  const practitioners = await listPractitioners(orgId);

  const age = ageFrom(encounter.patient.dateOfBirth);

  return (
    <>
      <PageHeader
        title={encounter.diagnosis ?? encounter.chiefComplaint ?? "Consultation"}
        description={`${formatDateTime(encounter.occurredAt)} · ${humanizeEnum(encounter.type)}`}
        action={
          <Link
            href={`${base}/patients/${encounter.patientId}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Open patient
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Consultation notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Complaint</p>
                <p>{encounter.chiefComplaint ?? "Not recorded"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Examination</p>
                <p className="whitespace-pre-wrap">{encounter.examination ?? "Not recorded"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Diagnosis</p>
                <p>{encounter.diagnosis ?? "Not recorded"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Advice</p>
                <p className="whitespace-pre-wrap">{encounter.advice ?? "Not recorded"}</p>
              </div>
              {encounter.followUpAt ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Follow up</p>
                  <p>{formatDate(encounter.followUpAt)}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {encounter.prescriptions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Prescriptions issued</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {encounter.prescriptions.map((prescription) => (
                  <div key={prescription.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        {formatDate(prescription.issuedAt)}
                      </p>
                      <Link
                        href={`${base}/prescriptions/${prescription.id}`}
                        className={buttonVariants({ variant: "ghost", size: "xs" })}
                      >
                        <Printer aria-hidden className="size-4" />
                        Print
                      </Link>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {prescription.items.map((item) => (
                        <li key={item.id} className="rounded-lg bg-muted px-3 py-2">
                          <span className="font-medium">{item.drugName}</span>
                          <span className="text-muted-foreground">
                            {[item.dose, item.frequency, item.duration, item.instructions]
                              .filter(Boolean)
                              .map((part) => ` · ${part}`)
                              .join("")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {hasPermission(user, "prescription:create") ? (
            <PrescriptionForm
              patientId={encounter.patientId}
              encounterId={encounter.id}
              practitioners={practitioners}
              defaultPractitionerId={encounter.practitioner?.id}
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Patient</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{encounter.patient.fullName}</p>
              <p className="text-muted-foreground">
                {[age !== null ? `${age} yrs` : null, humanizeEnum(encounter.patient.gender), encounter.patient.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {encounter.practitioner ? (
                <p className="mt-3 text-muted-foreground">
                  Seen by {encounter.practitioner.fullName}
                  {encounter.practitioner.qualification ? `, ${encounter.practitioner.qualification}` : ""}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {encounter.invoices.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Billing</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {encounter.invoices.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between gap-2">
                      <Link
                        href={`${base}/billing/${invoice.id}`}
                        className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {invoice.number}
                      </Link>
                      <span className="flex items-center gap-2">
                        {money(invoice.totalMinor)}
                        <StatusBadge value={invoice.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            hasPermission(user, "invoice:manage") && (
              <Link
                href={`${base}/billing/new?patientId=${encounter.patientId}&encounterId=${encounter.id}`}
                className={buttonVariants({ variant: "secondary", size: "sm", full: true })}
              >
                Create invoice for this visit
              </Link>
            )
          )}
        </div>
      </div>
    </>
  );
}
