"use client";

import { Plus } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { humanizeEnum } from "@/lib/format";
import {
  addAllergyAction,
  addConditionAction,
  addVaccinationAction,
  addVitalAction,
  emptyProviderState,
  type ProviderActionState,
} from "@/modules/provider/actions";
import { CONDITION_STATUSES, SEVERITIES, VITAL_TYPES } from "@/shared/enums";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";

/**
 * The small record-entry forms a clinician uses mid-consultation.
 *
 * Each one is collapsed behind an "Add" button rather than shown open: on a
 * patient page these four forms open at once would push the actual record —
 * the allergies and conditions someone needs to read before prescribing — below
 * the fold.
 */

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Disclosure({
  label,
  state,
  children,
}: {
  label: string;
  state: ProviderActionState;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="space-y-2">
        {state.message ? <Alert tone="success">{state.message}</Alert> : null}
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Plus aria-hidden className="size-4" />
          {label}
        </Button>
      </div>
    );
  }

  return <>{children(() => setOpen(false))}</>;
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick}>
      Cancel
    </Button>
  );
}

export function AddVitalForm({ patientId }: { patientId: string }) {
  const [state, action] = useActionState(addVitalAction, emptyProviderState);

  return (
    <Disclosure label="Record a reading" state={state}>
      {(close) => (
        <form action={action} className="space-y-3">
          <input type="hidden" name="patientId" value={patientId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Type" errors={state.fieldErrors?.type}>
              {(props) => (
                <Select {...props} name="type" defaultValue="BLOOD_PRESSURE">
                  {VITAL_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {humanizeEnum(type)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Reading"
              errors={state.fieldErrors?.value}
              hint="Composite readings like 120/80 are fine."
            >
              {(props) => <Input {...props} name="value" required autoFocus />}
            </Field>
            <Field label="Unit" errors={state.fieldErrors?.unit} optional>
              {(props) => <Input {...props} name="unit" placeholder="mmHg, kg, °C" />}
            </Field>
          </div>

          <div className="flex gap-2">
            <SubmitButton label="Save reading" />
            <CancelButton onClick={close} />
          </div>
        </form>
      )}
    </Disclosure>
  );
}

export function AddAllergyForm({ patientId }: { patientId: string }) {
  const [state, action] = useActionState(addAllergyAction, emptyProviderState);

  return (
    <Disclosure label="Add an allergy" state={state}>
      {(close) => (
        <form action={action} className="space-y-3">
          <input type="hidden" name="patientId" value={patientId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Substance" errors={state.fieldErrors?.substance}>
              {(props) => <Input {...props} name="substance" required autoFocus />}
            </Field>
            <Field label="Reaction" errors={state.fieldErrors?.reaction} optional>
              {(props) => <Input {...props} name="reaction" placeholder="Rash, swelling…" />}
            </Field>
            <Field label="Severity" errors={state.fieldErrors?.severity}>
              {(props) => (
                <Select {...props} name="severity" defaultValue="MEDIUM">
                  {SEVERITIES.map((severity) => (
                    <option key={severity} value={severity}>
                      {humanizeEnum(severity)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="flex gap-2">
            <SubmitButton label="Save allergy" />
            <CancelButton onClick={close} />
          </div>
        </form>
      )}
    </Disclosure>
  );
}

export function AddConditionForm({ patientId }: { patientId: string }) {
  const [state, action] = useActionState(addConditionAction, emptyProviderState);

  return (
    <Disclosure label="Add a condition" state={state}>
      {(close) => (
        <form action={action} className="space-y-3">
          <input type="hidden" name="patientId" value={patientId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Condition" errors={state.fieldErrors?.name}>
              {(props) => <Input {...props} name="name" required autoFocus />}
            </Field>
            <Field label="ICD-10 code" errors={state.fieldErrors?.code} optional>
              {(props) => <Input {...props} name="code" />}
            </Field>
            <Field label="Status" errors={state.fieldErrors?.status}>
              {(props) => (
                <Select {...props} name="status" defaultValue="ACTIVE">
                  {CONDITION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {humanizeEnum(status)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Diagnosed on" errors={state.fieldErrors?.diagnosedAt} optional>
              {(props) => <Input {...props} name="diagnosedAt" type="date" />}
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes" errors={state.fieldErrors?.notes} optional>
                {(props) => <Textarea {...props} name="notes" rows={2} />}
              </Field>
            </div>
          </div>

          <div className="flex gap-2">
            <SubmitButton label="Save condition" />
            <CancelButton onClick={close} />
          </div>
        </form>
      )}
    </Disclosure>
  );
}

export function AddVaccinationForm({ patientId }: { patientId: string }) {
  const [state, action] = useActionState(addVaccinationAction, emptyProviderState);

  return (
    <Disclosure label="Record a vaccination" state={state}>
      {(close) => (
        <form action={action} className="space-y-3">
          <input type="hidden" name="patientId" value={patientId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vaccine" errors={state.fieldErrors?.vaccineName}>
              {(props) => <Input {...props} name="vaccineName" required autoFocus />}
            </Field>
            <Field label="Dose number" errors={state.fieldErrors?.doseNumber} optional>
              {(props) => <Input {...props} name="doseNumber" inputMode="numeric" />}
            </Field>
            <Field label="Given on" errors={state.fieldErrors?.administeredAt} optional>
              {(props) => <Input {...props} name="administeredAt" type="date" />}
            </Field>
            <Field
              label="Next dose due"
              errors={state.fieldErrors?.nextDueAt}
              optional
              hint="Setting this schedules a reminder for the patient."
            >
              {(props) => <Input {...props} name="nextDueAt" type="date" />}
            </Field>
            <Field label="Batch number" errors={state.fieldErrors?.batchNo} optional>
              {(props) => <Input {...props} name="batchNo" />}
            </Field>
          </div>

          <div className="flex gap-2">
            <SubmitButton label="Save vaccination" />
            <CancelButton onClick={close} />
          </div>
        </form>
      )}
    </Disclosure>
  );
}
