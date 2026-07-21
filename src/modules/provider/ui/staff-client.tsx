"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { CredentialsPanel } from "@/modules/admin/credentials-panel";
import { createUserAction, type ActionState } from "@/modules/identity/actions";
import { humanizeEnum } from "@/lib/format";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Field, Input, Select } from "@/ui/field";

const initial: ActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}

/**
 * Staff creation for a provider console.
 *
 * There is deliberately no organisation picker. The server takes the tenant from
 * the caller's session and ignores anything posted, so offering a choice here
 * would be offering one the server refuses — and the two roles listed are the
 * only ones a provider admin is allowed to hand out.
 */
export function CreateStaffForm({ roles }: { roles: string[] }) {
  const [state, action] = useActionState(createUserAction, initial);
  const [open, setOpen] = useState(false);

  if (state.ok && state.credentials) {
    return (
      <div className="space-y-3">
        <CredentialsPanel credentials={state.credentials} />
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden className="size-4" />
        Add a staff account
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form action={action} className="space-y-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" errors={state.fieldErrors?.displayName}>
              {(props) => <Input {...props} name="displayName" required autoFocus />}
            </Field>

            <Field label="Role" errors={state.fieldErrors?.role}>
              {(props) => (
                <Select {...props} name="role" required defaultValue={roles[0]}>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {humanizeEnum(role)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label="Username"
              errors={state.fieldErrors?.username}
              optional
              hint="Left blank, one is generated from the name."
            >
              {(props) => <Input {...props} name="username" autoComplete="off" />}
            </Field>

            <Field label="Mobile" errors={state.fieldErrors?.phone} optional>
              {(props) => <Input {...props} name="phone" type="tel" inputMode="numeric" />}
            </Field>
          </div>

          <Alert tone="info">
            They get a temporary password shown once on the next screen, and are forced to change it
            at first sign-in. You cannot set an exact password for anyone — that is what stops an
            admin signing in as someone else.
          </Alert>

          <div className="flex gap-3">
            <SubmitButton />
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
