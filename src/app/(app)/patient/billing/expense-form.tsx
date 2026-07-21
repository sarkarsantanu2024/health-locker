"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { humanizeEnum } from "@/lib/format";
import { addExpenseAction, type PatientActionState } from "@/modules/patient/actions";
import { EXPENSE_CATEGORIES } from "@/shared/enums";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Field, Input, Select } from "@/ui/field";

const initial: PatientActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Saving…" : "Save expense"}
    </Button>
  );
}

/**
 * Out-of-pocket spend, tracked separately from invoices on purpose: most health
 * spending in India never touches a platform invoice, and a "spend" total that
 * only counted our own bills would be wrong by an order of magnitude.
 */
export function AddExpenseForm() {
  const [state, action] = useActionState(addExpenseAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="space-y-3">
        {state.message ? <Alert tone="success">{state.message}</Alert> : null}
        <Button type="button" variant="secondary" size="lg" full onClick={() => setOpen(true)}>
          <Plus aria-hidden className="size-5" />
          Record an expense
        </Button>
      </div>
    );
  }

  return (
    <Card tone="consumer">
      <CardContent className="p-5">
        <form action={action} className="space-y-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What was it for?" errors={state.fieldErrors?.category}>
              {(props) => (
                <Select {...props} name="category" defaultValue="MEDICINE">
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {humanizeEnum(category)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Amount (₹)" errors={state.fieldErrors?.amountMinor}>
              {(props) => (
                <Input {...props} name="amountMinor" inputMode="decimal" required autoFocus />
              )}
            </Field>

            <Field label="Date" errors={state.fieldErrors?.incurredAt} optional>
              {(props) => <Input {...props} name="incurredAt" type="date" />}
            </Field>

            <Field label="Where" errors={state.fieldErrors?.vendor} optional>
              {(props) => <Input {...props} name="vendor" placeholder="Chemist, clinic…" />}
            </Field>
          </div>

          <Field label="Note" errors={state.fieldErrors?.note} optional>
            {(props) => <Input {...props} name="note" />}
          </Field>

          <div className="flex gap-3">
            <SubmitButton />
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
