"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { registerPatientAction, emptyProviderState } from "@/modules/provider/actions";
import { BLOOD_GROUPS, BLOOD_GROUP_LABELS, GENDERS } from "@/shared/enums";
import { humanizeEnum } from "@/lib/format";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Field, Input, Select, Textarea } from "@/ui/field";

/**
 * Registration is deliberately short: a name is the only hard requirement.
 *
 * A walk-in at a busy reception will not stand there while someone types an
 * address, and a form that demands it gets filled with "-" — which is worse
 * than an empty column, because it looks like data.
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Registering…" : "Register patient"}
    </Button>
  );
}

export function RegisterPatientForm({ cancelHref }: { cancelHref: string }) {
  const [state, action] = useActionState(registerPatientAction, emptyProviderState);

  return (
    <Card>
      <CardContent className="p-5">
        <form action={action} className="space-y-5">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Full name" errors={state.fieldErrors?.fullName}>
                {(props) => <Input {...props} name="fullName" required autoFocus autoComplete="off" />}
              </Field>
            </div>

            <Field
              label="Mobile"
              errors={state.fieldErrors?.phone}
              optional
              hint="Used to send them their records and reminders."
            >
              {(props) => <Input {...props} name="phone" type="tel" inputMode="numeric" />}
            </Field>

            <Field label="Date of birth" errors={state.fieldErrors?.dateOfBirth} optional>
              {(props) => <Input {...props} name="dateOfBirth" type="date" />}
            </Field>

            <Field label="Gender" errors={state.fieldErrors?.gender}>
              {(props) => (
                <Select {...props} name="gender" defaultValue="UNDISCLOSED">
                  {GENDERS.map((gender) => (
                    <option key={gender} value={gender}>
                      {humanizeEnum(gender)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Blood group" errors={state.fieldErrors?.bloodGroup}>
              {(props) => (
                <Select {...props} name="bloodGroup" defaultValue="UNKNOWN">
                  {BLOOD_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {BLOOD_GROUP_LABELS[group]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <div className="sm:col-span-2">
              <Field label="Address" errors={state.fieldErrors?.addressLine} optional>
                {(props) => <Input {...props} name="addressLine" />}
              </Field>
            </div>

            <Field label="City" errors={state.fieldErrors?.city} optional>
              {(props) => <Input {...props} name="city" />}
            </Field>

            <Field label="PIN code" errors={state.fieldErrors?.pincode} optional>
              {(props) => <Input {...props} name="pincode" inputMode="numeric" maxLength={6} />}
            </Field>

            <div className="sm:col-span-2">
              <Field label="Notes" errors={state.fieldErrors?.notes} optional>
                {(props) => <Textarea {...props} name="notes" rows={2} />}
              </Field>
            </div>
          </div>

          <Alert tone="info">
            Registering someone records a sharing consent for your organisation. They keep ownership
            of their record — it stays theirs if they later use HealthLocker themselves.
          </Alert>

          <div className="flex gap-3">
            <SubmitButton />
            <a
              href={cancelHref}
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm text-muted-foreground hover:bg-muted"
            >
              Cancel
            </a>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
