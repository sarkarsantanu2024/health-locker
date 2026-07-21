"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { humanizeEnum } from "@/lib/format";
import {
  issuePrescriptionAction,
  recordEncounterAction,
  emptyProviderState,
} from "@/modules/provider/actions";
import type { PatientOption, PractitionerOption } from "@/modules/provider/ui/appointment-client";
import { ENCOUNTER_TYPES } from "@/shared/enums";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Field, Input, Label, Select, Textarea } from "@/ui/field";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function RecordEncounterForm({
  patients,
  practitioners,
  defaultPatientId,
  appointmentId,
}: {
  patients: PatientOption[];
  practitioners: PractitionerOption[];
  defaultPatientId?: string;
  appointmentId?: string;
}) {
  const [state, action] = useActionState(recordEncounterAction, emptyProviderState);

  return (
    <Card>
      <CardContent className="p-5">
        <form action={action} className="space-y-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Patient" errors={state.fieldErrors?.patientId}>
              {(props) => (
                <Select
                  {...props}
                  name="patientId"
                  required
                  defaultValue={defaultPatientId ?? ""}
                  // Locked when arriving from an appointment: changing it here
                  // would silently file the note against the wrong person.
                  disabled={Boolean(defaultPatientId && appointmentId)}
                >
                  <option value="" disabled>
                    Choose a patient
                  </option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.fullName}
                      {patient.mrn ? ` · ${patient.mrn}` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {defaultPatientId && appointmentId ? (
              <input type="hidden" name="patientId" value={defaultPatientId} />
            ) : null}

            <Field label="Seen by" errors={state.fieldErrors?.practitionerId} optional>
              {(props) => (
                <Select {...props} name="practitionerId" defaultValue="">
                  <option value="">Not recorded</option>
                  {practitioners.map((practitioner) => (
                    <option key={practitioner.id} value={practitioner.id}>
                      {practitioner.fullName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Visit type" errors={state.fieldErrors?.type}>
              {(props) => (
                <Select {...props} name="type" defaultValue="OPD">
                  {ENCOUNTER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {humanizeEnum(type)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Follow up on" errors={state.fieldErrors?.followUpAt} optional>
              {(props) => <Input {...props} name="followUpAt" type="date" />}
            </Field>

            <div className="sm:col-span-2">
              <Field label="Presenting complaint" errors={state.fieldErrors?.chiefComplaint} optional>
                {(props) => <Input {...props} name="chiefComplaint" autoFocus />}
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Examination" errors={state.fieldErrors?.examination} optional>
                {(props) => <Textarea {...props} name="examination" rows={3} />}
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Diagnosis" errors={state.fieldErrors?.diagnosis} optional>
                {(props) => <Input {...props} name="diagnosis" />}
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Advice" errors={state.fieldErrors?.advice} optional>
                {(props) => <Textarea {...props} name="advice" rows={3} />}
              </Field>
            </div>
          </div>

          <SubmitButton label="Save visit" />
        </form>
      </CardContent>
    </Card>
  );
}

interface DrugRow {
  key: number;
}

/**
 * Prescription entry.
 *
 * Rows are added client-side and posted as repeated field names, which the
 * server re-pairs. Frequency accepts the Indian "1-0-1" convention as well as
 * "BD"/"TDS" — the reminder-schedule mapping understands both, and forcing a
 * dropdown would slow down the person writing it.
 */
export function PrescriptionForm({
  patientId,
  encounterId,
  practitioners,
  defaultPractitionerId,
}: {
  patientId: string;
  encounterId?: string;
  practitioners: PractitionerOption[];
  defaultPractitionerId?: string;
}) {
  const [state, action] = useActionState(issuePrescriptionAction, emptyProviderState);
  const [rows, setRows] = useState<DrugRow[]>([{ key: 0 }, { key: 1 }]);
  const [nextKey, setNextKey] = useState(2);

  if (state.ok) {
    return (
      <Alert tone="success">
        {state.message} The patient can see it in their timeline immediately.
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prescription</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="patientId" value={patientId} />
          {encounterId ? <input type="hidden" name="encounterId" value={encounterId} /> : null}

          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.fieldErrors?.items ? (
            <Alert tone="danger">{state.fieldErrors.items.join(" ")}</Alert>
          ) : null}

          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={row.key} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <Label>Medicine {index + 1}</Label>
                  {rows.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                      aria-label={`Remove medicine ${index + 1}`}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  <input
                    name="drugName"
                    placeholder="Drug name"
                    aria-label={`Drug name ${index + 1}`}
                    className="h-11 rounded-lg border border-border-strong bg-surface px-3 text-base sm:col-span-2"
                  />
                  <input
                    name="dose"
                    placeholder="Dose (500 mg)"
                    aria-label={`Dose ${index + 1}`}
                    className="h-11 rounded-lg border border-border-strong bg-surface px-3 text-base"
                  />
                  <input
                    name="frequency"
                    placeholder="1-0-1 or BD"
                    aria-label={`Frequency ${index + 1}`}
                    className="h-11 rounded-lg border border-border-strong bg-surface px-3 text-base"
                  />
                  <input
                    name="duration"
                    placeholder="5 days"
                    aria-label={`Duration ${index + 1}`}
                    className="h-11 rounded-lg border border-border-strong bg-surface px-3 text-base"
                  />
                  <input
                    name="instructions"
                    placeholder="After food"
                    aria-label={`Instructions ${index + 1}`}
                    className="h-11 rounded-lg border border-border-strong bg-surface px-3 text-base sm:col-span-3"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setRows([...rows, { key: nextKey }]);
              setNextKey(nextKey + 1);
            }}
          >
            <Plus aria-hidden className="size-4" />
            Add another medicine
          </Button>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prescriber" errors={state.fieldErrors?.practitionerId} optional>
              {(props) => (
                <Select {...props} name="practitionerId" defaultValue={defaultPractitionerId ?? ""}>
                  <option value="">Not recorded</option>
                  {practitioners.map((practitioner) => (
                    <option key={practitioner.id} value={practitioner.id}>
                      {practitioner.fullName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Notes" errors={state.fieldErrors?.notes} optional>
              {(props) => <Input {...props} name="notes" />}
            </Field>
          </div>

          <Alert tone="info">
            Issuing this creates the patient&apos;s reminder schedules automatically from the
            frequency and duration. They can adjust the times themselves.
          </Alert>

          <SubmitButton label="Issue prescription" />
        </form>
      </CardContent>
    </Card>
  );
}
