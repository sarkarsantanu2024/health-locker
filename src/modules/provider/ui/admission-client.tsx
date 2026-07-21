"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  addOperationNoteAction,
  admitPatientAction,
  createDepartmentAction,
  deleteDepartmentAction,
  dischargeAdmissionAction,
  transferAdmissionAction,
  emptyProviderState,
} from "@/modules/provider/actions";
import type { PatientOption, PractitionerOption } from "@/modules/provider/ui/appointment-client";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Field, Input, Select, Textarea } from "@/ui/field";

export interface DepartmentOption {
  id: string;
  name: string;
}

function SubmitButton({ label, variant }: { label: string; variant?: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function CreateDepartmentForm() {
  const [state, action] = useActionState(createDepartmentAction, emptyProviderState);

  return (
    <form action={action} className="space-y-3">
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field label="Department" errors={state.fieldErrors?.name}>
          {(props) => <Input {...props} name="name" required placeholder="Cardiology" />}
        </Field>
        <Field label="Code" errors={state.fieldErrors?.code} optional>
          {(props) => <Input {...props} name="code" placeholder="CARD" />}
        </Field>
        <SubmitButton label="Add department" />
      </div>
    </form>
  );
}

export function DeleteDepartmentButton({ departmentId }: { departmentId: string }) {
  const [state, action] = useActionState(deleteDepartmentAction, emptyProviderState);

  if (state.ok) return <span className="text-sm text-muted-foreground">Removed</span>;

  return (
    <form action={action}>
      <input type="hidden" name="departmentId" value={departmentId} />
      <Button type="submit" variant="ghost" size="xs">
        Remove
      </Button>
      {state.error ? (
        <span className="block text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/**
 * Admission form.
 *
 * Ward and bed are free text rather than a bed-management picker: a real bed
 * board is its own product, and pretending to have one that is not kept in sync
 * with the ward whiteboard is worse than plain text. The service still refuses
 * to put two admitted patients in the same bed.
 */
export function AdmitPatientForm({
  patients,
  practitioners,
  departments,
  defaultPatientId,
}: {
  patients: PatientOption[];
  practitioners: PractitionerOption[];
  departments: DepartmentOption[];
  defaultPatientId?: string;
}) {
  const [state, action] = useActionState(admitPatientAction, emptyProviderState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admit a patient</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
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

            <Field label="Department" errors={state.fieldErrors?.departmentId} optional>
              {(props) => (
                <Select {...props} name="departmentId" defaultValue="">
                  <option value="">Not assigned</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Consultant" errors={state.fieldErrors?.practitionerId} optional>
              {(props) => (
                <Select {...props} name="practitionerId" defaultValue="">
                  <option value="">Not assigned</option>
                  {practitioners.map((practitioner) => (
                    <option key={practitioner.id} value={practitioner.id}>
                      {practitioner.fullName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Ward" errors={state.fieldErrors?.wardName} optional>
              {(props) => <Input {...props} name="wardName" placeholder="General ward" />}
            </Field>

            <Field label="Bed" errors={state.fieldErrors?.bedNo} optional>
              {(props) => <Input {...props} name="bedNo" placeholder="12" />}
            </Field>

            <div className="sm:col-span-2">
              <Field label="Reason for admission" errors={state.fieldErrors?.admissionReason} optional>
                {(props) => <Textarea {...props} name="admissionReason" rows={2} />}
              </Field>
            </div>
          </div>

          <SubmitButton label="Admit patient" />
        </form>
      </CardContent>
    </Card>
  );
}

export function AdmissionActions({
  admissionId,
  departments,
}: {
  admissionId: string;
  departments: DepartmentOption[];
}) {
  const [transferState, transferAction] = useActionState(transferAdmissionAction, emptyProviderState);
  const [dischargeState, dischargeAction] = useActionState(
    dischargeAdmissionAction,
    emptyProviderState,
  );
  const [mode, setMode] = useState<"none" | "transfer" | "discharge">("none");

  const message = transferState.message ?? dischargeState.message;
  const error = transferState.error ?? dischargeState.error;

  return (
    <div className="space-y-3">
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {mode === "transfer" ? (
        <form action={transferAction} className="space-y-3">
          <input type="hidden" name="admissionId" value={admissionId} />
          <Field label="Move to department" errors={transferState.fieldErrors?.departmentId} optional>
            {(props) => (
              <Select {...props} name="departmentId" defaultValue="">
                <option value="">Unchanged</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ward" errors={transferState.fieldErrors?.wardName} optional>
              {(props) => <Input {...props} name="wardName" />}
            </Field>
            <Field label="Bed" errors={transferState.fieldErrors?.bedNo} optional>
              {(props) => <Input {...props} name="bedNo" />}
            </Field>
          </div>
          <div className="flex gap-2">
            <SubmitButton label="Transfer" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : mode === "discharge" ? (
        <form action={dischargeAction} className="space-y-3">
          <input type="hidden" name="admissionId" value={admissionId} />
          <Field
            label="Discharge summary"
            errors={dischargeState.fieldErrors?.dischargeSummary}
            hint="The patient sees this in their timeline, so write it for them as well as for the next clinician."
          >
            {(props) => <Textarea {...props} name="dischargeSummary" rows={6} required autoFocus />}
          </Field>
          <Field label="Outcome" errors={dischargeState.fieldErrors?.status}>
            {(props) => (
              <Select {...props} name="status" defaultValue="DISCHARGED">
                <option value="DISCHARGED">Discharged</option>
                <option value="DECEASED">Deceased</option>
              </Select>
            )}
          </Field>
          <div className="flex gap-2">
            <SubmitButton label="Complete discharge" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setMode("transfer")}>
            Transfer
          </Button>
          <Button type="button" size="sm" onClick={() => setMode("discharge")}>
            Discharge
          </Button>
        </div>
      )}
    </div>
  );
}

export function OperationNoteForm({ admissionId }: { admissionId: string }) {
  const [state, action] = useActionState(addOperationNoteAction, emptyProviderState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="space-y-2">
        {state.message ? <Alert tone="success">{state.message}</Alert> : null}
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Add an operation note
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="admissionId" value={admissionId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Procedure" errors={state.fieldErrors?.procedure}>
          {(props) => <Input {...props} name="procedure" required autoFocus />}
        </Field>
        <Field label="Performed on" errors={state.fieldErrors?.performedAt} optional>
          {(props) => <Input {...props} name="performedAt" type="date" />}
        </Field>
        <Field label="Surgeon" errors={state.fieldErrors?.surgeonName} optional>
          {(props) => <Input {...props} name="surgeonName" />}
        </Field>
        <Field label="Anaesthesia" errors={state.fieldErrors?.anaesthesia} optional>
          {(props) => <Input {...props} name="anaesthesia" />}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Findings" errors={state.fieldErrors?.findings} optional>
            {(props) => <Textarea {...props} name="findings" rows={3} />}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notes" errors={state.fieldErrors?.notes} optional>
            {(props) => <Textarea {...props} name="notes" rows={3} />}
          </Field>
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitButton label="Save note" />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
