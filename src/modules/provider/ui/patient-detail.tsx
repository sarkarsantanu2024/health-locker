import { CalendarPlus, FileText, Receipt, Stethoscope, UserRound } from "lucide-react";
import Link from "next/link";

import { requireTenantPermission, hasPermission } from "@/lib/auth/session";
import { ageFrom, formatDate, formatDateTime, humanizeEnum, money } from "@/lib/format";
import { patientClinicalSummary } from "@/modules/provider/patients.service";
import { StatusBadge } from "@/modules/provider/ui/status";
import {
  AddAllergyForm,
  AddConditionForm,
  AddVaccinationForm,
  AddVitalForm,
} from "@/modules/provider/ui/record-forms";
import { BLOOD_GROUP_LABELS, type BloodGroup } from "@/shared/enums";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { toneFor } from "@/ui/tone";

/**
 * A patient as a provider sees them.
 *
 * Allergies come first and are the only thing rendered in a danger tone. That is
 * a clinical safety decision, not a styling one: the reason this page exists at
 * all is so nobody prescribes something the patient reacts to, and anything that
 * pushes that below the fold defeats it.
 */
export async function ProviderPatientDetail({
  base,
  patientId,
  canPrescribe = false,
}: {
  base: string;
  patientId: string;
  canPrescribe?: boolean;
}) {
  const { user, orgId } = await requireTenantPermission("patient:read");
  const summary = await patientClinicalSummary(orgId, patientId, user.id);

  const { patient } = summary;
  const age = ageFrom(patient.dateOfBirth);
  const canManageRecords = hasPermission(user, "record:manage");
  const canInvoice = hasPermission(user, "invoice:manage");

  return (
    <>
      <PageHeader
        title={patient.fullName}
        icon={UserRound}
        tone={toneFor("patient")}
        description={[
          age !== null ? `${age} years` : null,
          humanizeEnum(patient.gender),
          patient.bloodGroup !== "UNKNOWN"
            ? BLOOD_GROUP_LABELS[patient.bloodGroup as BloodGroup]
            : null,
          patient.mrn ? `File ${patient.mrn}` : null,
          patient.phone,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${base}/appointments?patientId=${patient.id}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <CalendarPlus aria-hidden className="size-4" />
              Book
            </Link>
            {canPrescribe ? (
              <Link
                href={`${base}/encounters/new?patientId=${patient.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                <Stethoscope aria-hidden className="size-4" />
                Record visit
              </Link>
            ) : null}
            {canInvoice ? (
              <Link
                href={`${base}/billing/new?patientId=${patient.id}`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                <Receipt aria-hidden className="size-4" />
                Invoice
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* --- safety first ------------------------------------------------ */}
          <Card hue={toneFor("alert")}>
            <CardHeader>
              <CardTitle>Allergies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.allergies.length === 0 ? (
                <p className="text-sm text-muted-foreground">None recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {summary.allergies.map((allergy) => (
                    <li
                      key={allergy.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2"
                    >
                      <span className="font-medium">{allergy.substance}</span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        {allergy.reaction}
                        <StatusBadge value={allergy.severity} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {canManageRecords ? <AddAllergyForm patientId={patient.id} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.conditions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active conditions recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {summary.conditions.map((condition) => (
                    <li key={condition.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{condition.name}</span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        {condition.diagnosedAt ? formatDate(condition.diagnosedAt) : null}
                        <StatusBadge value={condition.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {canManageRecords ? <AddConditionForm patientId={patient.id} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Visits at this organisation</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.encounters.length === 0 ? (
                <EmptyState
                  title="No visits recorded here yet"
                  description="Visits recorded at this organisation appear here, newest first."
                  art="records"
                  tone={toneFor("prescription")}
                />
              ) : (
                <ul className="divide-y divide-border">
                  {summary.encounters.map((encounter) => (
                    <li key={encounter.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link
                          href={`${base}/encounters/${encounter.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {encounter.diagnosis ?? encounter.chiefComplaint ?? "Consultation"}
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(encounter.occurredAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {[humanizeEnum(encounter.type), encounter.practitioner?.fullName]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card hue={toneFor("report")}>
            <CardHeader>
              <CardTitle>Reports</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.reports.length === 0 ? (
                <p className="text-sm text-muted-foreground">No published reports.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {summary.reports.map((report) => (
                    <li key={report.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{report.title}</span>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(report.reportedAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{report.org?.name}</p>
                      {report.findings.length > 0 ? (
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {report.findings.map((finding) => (
                            <li key={finding.label}>
                              <Badge
                                tone={finding.flag === "CRITICAL" ? "danger" : "warning"}
                              >
                                {finding.label}: {finding.value}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* --- right rail --------------------------------------------------- */}
        <div className="space-y-4">
          {summary.appointments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Upcoming</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {summary.appointments.map((appointment) => (
                    <li key={appointment.id} className="flex items-center justify-between gap-2">
                      <span>{formatDateTime(appointment.scheduledAt)}</span>
                      <StatusBadge value={appointment.status} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Recent readings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.vitals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No readings recorded.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {summary.vitals.map((vital) => (
                    <li key={vital.id} className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground">{humanizeEnum(vital.type)}</span>
                      <span className="font-medium">
                        {vital.value}
                        {vital.unit ? ` ${vital.unit}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {canManageRecords ? <AddVitalForm patientId={patient.id} /> : null}
            </CardContent>
          </Card>

          <Card hue={toneFor("prescription")}>
            <CardHeader>
              <CardTitle>Prescriptions</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.prescriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">None issued here.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {summary.prescriptions.map((prescription) => (
                    <li key={prescription.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <Link
                          href={`${base}/prescriptions/${prescription.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          <FileText aria-hidden className="mr-1 inline size-3.5" />
                          {formatDate(prescription.issuedAt)}
                        </Link>
                        <span className="text-muted-foreground">
                          {prescription.practitioner?.fullName}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        {prescription.items.map((item) => item.drugName).join(", ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {summary.invoices.length > 0 ? (
            <Card hue={toneFor("billing")}>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {summary.invoices.map((invoice) => (
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
          ) : null}

          {canManageRecords ? (
            <Card hue={toneFor("vaccination")}>
              <CardHeader>
                <CardTitle>Vaccinations</CardTitle>
              </CardHeader>
              <CardContent>
                <AddVaccinationForm patientId={patient.id} />
              </CardContent>
            </Card>
          ) : null}

          <Alert tone="info">
            Every time this page is opened it is written to the audit trail, with who opened it and
            when.
          </Alert>
        </div>
      </div>
    </>
  );
}
