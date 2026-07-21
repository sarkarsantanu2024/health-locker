"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { submitPaymentAction, type BillingActionState } from "@/modules/billing/actions";
import { PAYMENT_METHODS } from "@/shared/enums";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";

const initial: BillingActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full size="lg" disabled={pending}>
      {pending ? "Sending…" : "I have paid — send reference"}
    </Button>
  );
}

export function SubmitPaymentForm({
  refCode,
  alreadySubmitted,
}: {
  refCode: string;
  alreadySubmitted: boolean;
}) {
  const [state, formAction] = useActionState(submitPaymentAction, initial);

  if (state.ok || alreadySubmitted) {
    return (
      <Alert tone="success">
        {state.message ?? "We have your reference and are checking it."}
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="refCode" value={refCode} />

      <Field
        label="Transaction / UTR reference"
        errors={state.fieldErrors?.utr}
        hint="On your receipt it may be called UTR, RRN, or transaction ID."
      >
        {(props) => (
          <Input
            {...props}
            name="utr"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="e.g. 412345678901"
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How did you pay?" errors={state.fieldErrors?.method}>
          {(props) => (
            <Select {...props} name="method" defaultValue="UPI">
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="When?" errors={state.fieldErrors?.paidAt} optional>
          {(props) => <Input {...props} name="paidAt" type="date" />}
        </Field>
      </div>

      <Field
        label="Screenshot of the payment"
        errors={state.fieldErrors?.screenshot}
        hint="The confirmation screen from PhonePe, Google Pay, Paytm or your bank. JPG, PNG or PDF, up to 5 MB."
      >
        {(props) => (
          <Input
            {...props}
            name="screenshot"
            type="file"
            // capture lets a phone open the camera directly for a paper receipt.
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            required
            className="py-2 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        )}
      </Field>

      <Field
        label="Your mobile number"
        errors={state.fieldErrors?.submitterPhone}
        hint="So we can reach you on WhatsApp when it is confirmed."
        optional
      >
        {(props) => <Input {...props} name="submitterPhone" type="tel" inputMode="tel" />}
      </Field>

      <SubmitButton />

      <p className="text-xs text-muted-foreground">
        Send the reference only after the money has actually left your account. A wrong
        reference just delays activation.
      </p>
    </form>
  );
}
