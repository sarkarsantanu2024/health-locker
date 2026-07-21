"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { money } from "@/lib/format";
import {
  createInvoiceAction,
  issueInvoiceAction,
  voidInvoiceAction,
  emptyProviderState,
} from "@/modules/provider/actions";
import type { PatientOption } from "@/modules/provider/ui/appointment-client";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Field, Input, Label, Select } from "@/ui/field";

interface LineRow {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
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
 * Invoice entry.
 *
 * The running total is shown live, but it is **not** what gets saved: the server
 * recomputes every total from the line items. This number is a courtesy to the
 * person typing, not an input.
 */
export function CreateInvoiceForm({
  patients,
  departments,
  defaultPatientId,
  encounterId,
  admissionId,
}: {
  patients: PatientOption[];
  departments?: { id: string; name: string }[];
  defaultPatientId?: string;
  encounterId?: string;
  admissionId?: string;
}) {
  const [state, action] = useActionState(createInvoiceAction, emptyProviderState);
  const [rows, setRows] = useState<LineRow[]>([
    { key: 0, description: "", quantity: "1", unitPrice: "" },
  ]);
  const [nextKey, setNextKey] = useState(1);
  const [discount, setDiscount] = useState("");
  const [tax, setTax] = useState("");

  const toPaise = (value: string) => Math.round(Number(value.replace(/[,\s₹]/g, "") || "0") * 100);

  const subtotal = rows.reduce(
    (sum, row) => sum + (Number(row.quantity) || 0) * toPaise(row.unitPrice),
    0,
  );
  const total = Math.max(0, subtotal - toPaise(discount) + toPaise(tax));

  const update = (key: number, patch: Partial<LineRow>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <Card>
      <CardContent className="p-5">
        <form action={action} className="space-y-5">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.fieldErrors?.items ? (
            <Alert tone="danger">{state.fieldErrors.items.join(" ")}</Alert>
          ) : null}

          {encounterId ? <input type="hidden" name="encounterId" value={encounterId} /> : null}
          {admissionId ? <input type="hidden" name="admissionId" value={admissionId} /> : null}

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

          <div className="space-y-3">
            <Label>Lines</Label>
            {rows.map((row, index) => (
              <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
                <input
                  name="description"
                  value={row.description}
                  onChange={(event) => update(row.key, { description: event.target.value })}
                  placeholder="Consultation, dressing, X-ray…"
                  aria-label={`Description ${index + 1}`}
                  className="h-11 rounded-lg border border-border-strong bg-surface px-3 text-base"
                />
                <input
                  name="quantity"
                  value={row.quantity}
                  onChange={(event) => update(row.key, { quantity: event.target.value })}
                  inputMode="numeric"
                  aria-label={`Quantity ${index + 1}`}
                  className="h-11 rounded-lg border border-border-strong bg-surface px-3 text-base"
                />
                <input
                  name="unitPrice"
                  value={row.unitPrice}
                  onChange={(event) => update(row.key, { unitPrice: event.target.value })}
                  inputMode="decimal"
                  placeholder="₹ price"
                  aria-label={`Unit price ${index + 1}`}
                  className="h-11 rounded-lg border border-border-strong bg-surface px-3 text-base"
                />
                {departments && departments.length > 0 ? (
                  <select
                    name="departmentId"
                    aria-label={`Department ${index + 1}`}
                    className="h-11 rounded-lg border border-border-strong bg-surface px-3 text-sm"
                  >
                    <option value="">No department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="hidden" name="departmentId" value="" />
                )}
                {rows.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                    aria-label={`Remove line ${index + 1}`}
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
                setRows([...rows, { key: nextKey, description: "", quantity: "1", unitPrice: "" }]);
                setNextKey(nextKey + 1);
              }}
            >
              <Plus aria-hidden className="size-4" />
              Add line
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Discount (₹)" errors={state.fieldErrors?.discountMinor} optional>
              {(props) => (
                <Input
                  {...props}
                  name="discountMinor"
                  inputMode="decimal"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              )}
            </Field>
            <Field label="Tax (₹)" errors={state.fieldErrors?.taxMinor} optional>
              {(props) => (
                <Input
                  {...props}
                  name="taxMinor"
                  inputMode="decimal"
                  value={tax}
                  onChange={(event) => setTax(event.target.value)}
                />
              )}
            </Field>
            <Field label="Due date" errors={state.fieldErrors?.dueAt} optional>
              {(props) => <Input {...props} name="dueAt" type="date" />}
            </Field>
          </div>

          <Field label="Notes" errors={state.fieldErrors?.notes} optional>
            {(props) => <Input {...props} name="notes" />}
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3">
            <span className="text-sm text-muted-foreground">
              Subtotal {money(subtotal)} · saved as a draft first
            </span>
            <span className="text-lg font-semibold">{money(total)}</span>
          </div>

          <SubmitButton label="Save draft invoice" />
        </form>
      </CardContent>
    </Card>
  );
}

export function InvoiceActions({ invoiceId, status }: { invoiceId: string; status: string }) {
  const [issueState, issueAction] = useActionState(issueInvoiceAction, emptyProviderState);
  const [voidState, voidAction] = useActionState(voidInvoiceAction, emptyProviderState);
  const [voiding, setVoiding] = useState(false);

  const message = issueState.message ?? voidState.message;
  const error = issueState.error ?? voidState.error;

  return (
    <div className="space-y-3">
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {voiding ? (
        <form action={voidAction} className="space-y-3">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <Field
            label="Why is this being voided?"
            errors={voidState.fieldErrors?.reason}
            hint="Kept on the record — a financial row is never deleted."
          >
            {(props) => <Input {...props} name="reason" required autoFocus />}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" size="sm">
              Void invoice
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status === "DRAFT" && !issueState.ok ? (
            <form action={issueAction}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <SubmitButton label="Issue invoice" />
            </form>
          ) : null}

          {["DRAFT", "ISSUED", "OVERDUE"].includes(status) && !voidState.ok ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setVoiding(true)}>
              Void
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
