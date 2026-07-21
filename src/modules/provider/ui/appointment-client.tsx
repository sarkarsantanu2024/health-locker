"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { formatTime, humanizeEnum } from "@/lib/format";
import {
  bookAppointmentAction,
  setAppointmentStatusAction,
  emptyProviderState,
} from "@/modules/provider/actions";
import { StatusBadge } from "@/modules/provider/ui/status";
import { ENCOUNTER_TYPES } from "@/shared/enums";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Field, Input, Select } from "@/ui/field";
import { Td, Tr } from "@/ui/table";

export interface PatientOption {
  id: string;
  fullName: string;
  mrn: string | null;
  phone: string | null;
}

export interface PractitionerOption {
  id: string;
  fullName: string;
  specialization: string | null;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * Booking form. The patient list is a `<select>` fed from the tenant's own
 * register rather than a free-text field — a booking against a patient who is
 * not registered here would be a cross-tenant write, and the server refuses it
 * anyway, so offering it in the UI would only produce a confusing error.
 */
export function BookAppointmentForm({
  patients,
  practitioners,
  defaultPatientId,
  defaultDate,
}: {
  patients: PatientOption[];
  practitioners: PractitionerOption[];
  defaultPatientId?: string;
  defaultDate: string;
}) {
  const [state, action] = useActionState(bookAppointmentAction, emptyProviderState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Book an appointment</CardTitle>
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

            <Field label="Date and time" errors={state.fieldErrors?.scheduledAt}>
              {(props) => (
                <Input {...props} name="scheduledAt" type="datetime-local" required defaultValue={defaultDate} />
              )}
            </Field>

            <Field label="With" errors={state.fieldErrors?.practitionerId} optional>
              {(props) => (
                <Select {...props} name="practitionerId" defaultValue="">
                  <option value="">Not assigned</option>
                  {practitioners.map((practitioner) => (
                    <option key={practitioner.id} value={practitioner.id}>
                      {practitioner.fullName}
                      {practitioner.specialization ? ` · ${practitioner.specialization}` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Type" errors={state.fieldErrors?.type}>
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

            <Field label="Minutes" errors={state.fieldErrors?.durationMin} optional>
              {(props) => <Input {...props} name="durationMin" inputMode="numeric" defaultValue="15" />}
            </Field>

            <Field label="Reason" errors={state.fieldErrors?.reason} optional>
              {(props) => <Input {...props} name="reason" placeholder="Fever, follow-up…" />}
            </Field>
          </div>

          <SubmitButton label="Book appointment" />
        </form>
      </CardContent>
    </Card>
  );
}

export interface AppointmentRowData {
  id: string;
  scheduledAt: string;
  status: string;
  type: string;
  reason: string | null;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  practitionerName: string | null;
  encounterId: string | null;
}

/**
 * One row of the day list, with the status transitions a receptionist actually
 * performs. Only the next sensible step is offered rather than a dropdown of all
 * seven statuses — a list where "no show" sits next to "check in" gets misclicked.
 */
export function AppointmentRow({ appointment, base }: { appointment: AppointmentRowData; base: string }) {
  const [state, action] = useActionState(setAppointmentStatusAction, emptyProviderState);
  const [cancelling, setCancelling] = useState(false);

  const status = state.ok ? null : appointment.status;

  const next =
    appointment.status === "SCHEDULED" || appointment.status === "REQUESTED"
      ? { status: "CHECKED_IN", label: "Check in" }
      : appointment.status === "CHECKED_IN"
        ? { status: "IN_PROGRESS", label: "Start" }
        : null;

  return (
    <Tr>
      <Td className="whitespace-nowrap font-medium">{formatTime(appointment.scheduledAt)}</Td>
      <Td>
        <a
          href={`${base}/patients/${appointment.patientId}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {appointment.patientName}
        </a>
        <p className="text-xs text-muted-foreground">
          {[appointment.reason, appointment.patientPhone].filter(Boolean).join(" · ")}
        </p>
      </Td>
      <Td className="text-muted-foreground">{appointment.practitionerName ?? "—"}</Td>
      <Td>
        {state.ok ? (
          <span className="text-sm text-success">Updated</span>
        ) : (
          <StatusBadge value={status!} />
        )}
        {state.error ? (
          <span className="block text-xs text-danger" role="alert">
            {state.error}
          </span>
        ) : null}
      </Td>
      <Td>
        {cancelling ? (
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <input type="hidden" name="status" value="CANCELLED" />
            <Input
              name="cancelledReason"
              placeholder="Reason"
              required
              autoFocus
              className="h-9 w-40 text-sm"
              aria-label="Cancellation reason"
            />
            <Button type="submit" variant="danger" size="xs">
              Confirm
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => setCancelling(false)}>
              Back
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {next ? (
              <form action={action}>
                <input type="hidden" name="appointmentId" value={appointment.id} />
                <input type="hidden" name="status" value={next.status} />
                <Button type="submit" size="xs" variant="secondary">
                  {next.label}
                </Button>
              </form>
            ) : null}

            {appointment.encounterId ? (
              <a
                href={`${base}/encounters/${appointment.encounterId}`}
                className="text-xs font-medium text-primary underline underline-offset-4"
              >
                Open visit
              </a>
            ) : appointment.status !== "CANCELLED" && appointment.status !== "COMPLETED" ? (
              <a
                href={`${base}/encounters/new?patientId=${appointment.patientId}&appointmentId=${appointment.id}`}
                className="text-xs font-medium text-primary underline underline-offset-4"
              >
                Record visit
              </a>
            ) : null}

            {appointment.status !== "CANCELLED" && appointment.status !== "COMPLETED" ? (
              <Button type="button" variant="ghost" size="xs" onClick={() => setCancelling(true)}>
                Cancel
              </Button>
            ) : null}
          </div>
        )}
      </Td>
    </Tr>
  );
}
