"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signupAction, type ActionState } from "@/modules/identity/actions";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Field, Input, Label, Select } from "@/ui/field";

const initialState: ActionState = { ok: false };

export interface SignupPlan {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  interval: string;
}

function formatPrice(plan: SignupPlan): string {
  if (plan.priceMinor === 0) return "Free";
  // Paise → rupees, in the reader's own numbering system.
  const rupees = plan.priceMinor / 100;
  return `${new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees)} / ${plan.interval.toLowerCase()}`;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full disabled={pending}>
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}

export function SignupForm({ plans }: { plans: SignupPlan[] }) {
  const [state, formAction] = useActionState(signupAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Your details</legend>

        <Field label="Full name" errors={state.fieldErrors?.fullName}>
          {(props) => <Input {...props} name="fullName" autoComplete="name" required autoFocus />}
        </Field>

        <Field
          label="Phone / WhatsApp number"
          errors={state.fieldErrors?.phone}
          hint="We contact you on WhatsApp about your account. Indian mobile numbers only."
        >
          {(props) => (
            <Input {...props} name="phone" type="tel" inputMode="tel" autoComplete="tel" required />
          )}
        </Field>

        <Field label="Address" errors={state.fieldErrors?.addressLine}>
          {(props) => (
            <Input {...props} name="addressLine" autoComplete="street-address" required />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" errors={state.fieldErrors?.city}>
            {(props) => <Input {...props} name="city" autoComplete="address-level2" required />}
          </Field>

          <Field label="State" errors={state.fieldErrors?.state}>
            {(props) => <Input {...props} name="state" autoComplete="address-level1" required />}
          </Field>
        </div>

        <Field label="PIN code" errors={state.fieldErrors?.pincode}>
          {(props) => (
            <Input
              {...props}
              name="pincode"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              required
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Choose your sign-in</legend>

        <Field
          label="Username"
          errors={state.fieldErrors?.username}
          hint="Letters, numbers, dot, underscore or hyphen. This is how you sign in."
        >
          {(props) => (
            <Input
              {...props}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          )}
        </Field>

        <Field
          label="Password"
          errors={state.fieldErrors?.password}
          hint="At least 8 characters. No capitals or symbols required — a phrase you will remember is best."
        >
          {(props) => (
            <Input {...props} name="password" type="password" autoComplete="new-password" required />
          )}
        </Field>

        <Field label="Confirm password" errors={state.fieldErrors?.confirmPassword}>
          {(props) => (
            <Input
              {...props}
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Plan</legend>

        <Field label="Choose a plan" errors={state.fieldErrors?.planId}>
          {(props) => (
            <Select {...props} name="planId" required defaultValue={plans[0]?.id}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {formatPrice(plan)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </fieldset>

      <div className="space-y-1.5">
        <div className="flex items-start gap-3">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            required
            className="mt-1 size-4 shrink-0 rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-invalid={Boolean(state.fieldErrors?.consent?.length)}
          />
          <Label htmlFor="consent" className="text-sm font-normal text-muted-foreground">
            I agree that HealthLocker may store my health records and contact me on WhatsApp
            about my account.
          </Label>
        </div>
        {state.fieldErrors?.consent?.length ? (
          <p className="text-xs font-medium text-danger">{state.fieldErrors.consent.join(" ")}</p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
