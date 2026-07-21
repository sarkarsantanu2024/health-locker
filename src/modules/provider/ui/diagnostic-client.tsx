"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { humanizeEnum } from "@/lib/format";
import {
  createBookingAction,
  createCatalogItemAction,
  createReportAction,
  publishReportAction,
  setBookingStatusAction,
  toggleCatalogItemAction,
  emptyProviderState,
} from "@/modules/provider/actions";
import type { PatientOption } from "@/modules/provider/ui/appointment-client";
import { FINDING_FLAGS } from "@/shared/enums";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Field, Input, Label, Select } from "@/ui/field";

export interface CatalogOption {
  id: string;
  name: string;
  sampleType: string | null;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function CatalogItemForm() {
  const [state, action] = useActionState(createCatalogItemAction, emptyProviderState);

  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Test name" errors={state.fieldErrors?.name}>
          {(props) => <Input {...props} name="name" required placeholder="Complete blood count" />}
        </Field>
        <Field label="Code" errors={state.fieldErrors?.code} optional>
          {(props) => <Input {...props} name="code" placeholder="CBC" />}
        </Field>
        <Field label="Price (₹)" errors={state.fieldErrors?.priceMinor}>
          {(props) => <Input {...props} name="priceMinor" inputMode="decimal" required />}
        </Field>
        <Field label="Sample" errors={state.fieldErrors?.sampleType} optional>
          {(props) => <Input {...props} name="sampleType" placeholder="Blood, urine…" />}
        </Field>
        <Field
          label="Turnaround (hours)"
          errors={state.fieldErrors?.tatHours}
          optional
        >
          {(props) => <Input {...props} name="tatHours" inputMode="numeric" placeholder="24" />}
        </Field>
        <Field
          label="Preparation"
          errors={state.fieldErrors?.preparation}
          optional
          hint="Sent to the patient when they book."
        >
          {(props) => <Input {...props} name="preparation" placeholder="12 hours fasting" />}
        </Field>
      </div>

      <SubmitButton label="Add test" />
    </form>
  );
}

export function ToggleCatalogItem({ itemId, isActive }: { itemId: string; isActive: boolean }) {
  const [state, action] = useActionState(toggleCatalogItemAction, emptyProviderState);

  return (
    <form action={action}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="isActive" value={String(!isActive)} />
      <Button type="submit" variant="ghost" size="xs">
        {isActive ? "Retire" : "Re-activate"}
      </Button>
      {state.error ? (
        <span className="block text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function CreateBookingForm({
  patients,
  catalog,
  defaultPatientId,
}: {
  patients: PatientOption[];
  catalog: CatalogOption[];
  defaultPatientId?: string;
}) {
  const [state, action] = useActionState(createBookingAction, emptyProviderState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Book a test</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {state.message ? <Alert tone="success">{state.message}</Alert> : null}
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Patient" errors={state.fieldErrors?.patientId}>
              {(props) => (
                <Select {...props} name="patientId" required defaultValue={defaultPatientId ?? ""}>
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

            <Field label="Test" errors={state.fieldErrors?.catalogItemId}>
              {(props) => (
                <Select {...props} name="catalogItemId" required defaultValue="">
                  <option value="" disabled>
                    Choose a test
                  </option>
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.sampleType ? ` · ${item.sampleType}` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Scheduled for" errors={state.fieldErrors?.scheduledAt} optional>
              {(props) => <Input {...props} name="scheduledAt" type="date" />}
            </Field>

            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="homeCollection" className="size-4" />
              Home collection
            </label>
          </div>

          <SubmitButton label="Book test" />
        </form>
      </CardContent>
    </Card>
  );
}

export function BookingStatusForm({
  bookingId,
  status,
}: {
  bookingId: string;
  status: string;
}) {
  const [state, action] = useActionState(setBookingStatusAction, emptyProviderState);

  // Only the next step in the pipeline is offered. A free dropdown of six
  // statuses on a busy sample-collection desk gets misclicked.
  const next =
    status === "BOOKED" || status === "SAMPLE_PENDING"
      ? { status: "SAMPLE_COLLECTED", label: "Sample collected" }
      : status === "SAMPLE_COLLECTED"
        ? { status: "PROCESSING", label: "Start processing" }
        : null;

  if (state.ok) return <span className="text-sm text-success">Updated</span>;
  if (!next) return null;

  return (
    <form action={action}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="status" value={next.status} />
      <Button type="submit" variant="secondary" size="xs">
        {next.label}
      </Button>
      {state.error ? (
        <span className="block text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

interface FindingRow {
  key: number;
}

/**
 * Result entry.
 *
 * The flag (normal / high / low / critical) is chosen by the person entering
 * the result rather than derived from the reference range: ranges are text like
 * "3.5–5.1" or "<200" or "Negative", and a parser that quietly got one wrong
 * would mislabel a result as normal.
 */
export function CreateReportForm({
  patients,
  defaultPatientId,
  bookingId,
  defaultTitle,
}: {
  patients: PatientOption[];
  defaultPatientId?: string;
  bookingId?: string;
  defaultTitle?: string;
}) {
  const [state, action] = useActionState(createReportAction, emptyProviderState);
  const [rows, setRows] = useState<FindingRow[]>([{ key: 0 }, { key: 1 }, { key: 2 }]);
  const [nextKey, setNextKey] = useState(3);

  const cellClass = "h-11 rounded-lg border border-border-strong bg-surface px-3 text-base";

  return (
    <Card>
      <CardContent className="p-5">
        <form action={action} className="space-y-5">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.fieldErrors?.findings ? (
            <Alert tone="danger">{state.fieldErrors.findings.join(" ")}</Alert>
          ) : null}

          {bookingId ? <input type="hidden" name="bookingId" value={bookingId} /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Patient" errors={state.fieldErrors?.patientId}>
              {(props) => (
                <Select {...props} name="patientId" required defaultValue={defaultPatientId ?? ""}>
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

            <Field label="Report title" errors={state.fieldErrors?.title}>
              {(props) => (
                <Input {...props} name="title" required defaultValue={defaultTitle ?? ""} />
              )}
            </Field>

            <Field label="Type" errors={state.fieldErrors?.reportType} optional>
              {(props) => <Input {...props} name="reportType" placeholder="Haematology, imaging…" />}
            </Field>

            <Field label="Reported on" errors={state.fieldErrors?.reportedAt} optional>
              {(props) => <Input {...props} name="reportedAt" type="date" />}
            </Field>
          </div>

          <div className="space-y-3">
            <Label>Results</Label>
            {rows.map((row, index) => (
              <div key={row.key} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_0.7fr_1fr_0.9fr_auto]">
                <input
                  name="label"
                  placeholder="Haemoglobin"
                  aria-label={`Result name ${index + 1}`}
                  className={cellClass}
                />
                <input
                  name="value"
                  placeholder="13.2"
                  aria-label={`Value ${index + 1}`}
                  className={cellClass}
                />
                <input
                  name="unit"
                  placeholder="g/dL"
                  aria-label={`Unit ${index + 1}`}
                  className={cellClass}
                />
                <input
                  name="referenceRange"
                  placeholder="12.0–15.5"
                  aria-label={`Reference range ${index + 1}`}
                  className={cellClass}
                />
                <select
                  name="flag"
                  defaultValue="NORMAL"
                  aria-label={`Flag ${index + 1}`}
                  className={cellClass}
                >
                  {FINDING_FLAGS.map((flag) => (
                    <option key={flag} value={flag}>
                      {humanizeEnum(flag)}
                    </option>
                  ))}
                </select>
                {rows.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                    aria-label={`Remove result ${index + 1}`}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                ) : null}
              </div>
            ))}

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
              Add result line
            </Button>
          </div>

          <Alert tone="info">
            Saving puts this in the verification queue. The patient sees nothing until someone with
            sign-off rights publishes it.
          </Alert>

          <SubmitButton label="Save for verification" />
        </form>
      </CardContent>
    </Card>
  );
}

export function PublishReportButton({ reportId }: { reportId: string }) {
  const [state, action] = useActionState(publishReportAction, emptyProviderState);

  if (state.ok) return <Alert tone="success">{state.message}</Alert>;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="reportId" value={reportId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Alert tone="warning">
        Check every value against the analyser output before publishing. Publishing notifies the
        patient immediately and cannot be undone.
      </Alert>
      <SubmitButton label="Verify and publish" />
    </form>
  );
}
