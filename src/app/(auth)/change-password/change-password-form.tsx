"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { changePasswordAction, type ActionState } from "@/modules/identity/actions";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

const initialState: ActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full disabled={pending}>
      {pending ? "Updating…" : "Update password"}
    </Button>
  );
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {forced ? (
        <Alert tone="warning">
          Your account uses a temporary password. Choose your own to continue.
        </Alert>
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Current password" errors={state.fieldErrors?.currentPassword}>
        {(props) => (
          <Input
            {...props}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        )}
      </Field>

      <Field
        label="New password"
        errors={state.fieldErrors?.newPassword}
        hint="At least 12 characters. A memorable phrase beats a short complex one."
      >
        {(props) => (
          <Input {...props} name="newPassword" type="password" autoComplete="new-password" required />
        )}
      </Field>

      <Field label="Confirm new password" errors={state.fieldErrors?.confirmPassword}>
        {(props) => (
          <Input {...props} name="confirmPassword" type="password" autoComplete="new-password" required />
        )}
      </Field>

      <SubmitButton />

      <p className="text-xs text-muted-foreground">
        Changing your password signs you out everywhere else.
      </p>
    </form>
  );
}
