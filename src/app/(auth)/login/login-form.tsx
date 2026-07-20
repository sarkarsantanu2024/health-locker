"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type ActionState } from "@/modules/identity/actions";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { PasswordInput } from "@/ui/password-input";

const initialState: ActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ passwordChanged }: { passwordChanged: boolean }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  // Controlled: React 19 resets an uncontrolled form after a server action, which
  // would clear both fields at the exact moment the 2FA step appears and force
  // the user to type everything again.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      {passwordChanged ? (
        <Alert tone="success">Password updated. Sign in with your new password.</Alert>
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Username" errors={state.fieldErrors?.username}>
        {(props) => (
          <Input
            {...props}
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
          />
        )}
      </Field>

      <Field label="Password" errors={state.fieldErrors?.password}>
        {(props) => (
          <PasswordInput
            {...props}
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        )}
      </Field>

      {/*
        Revealed only once the server says this account has 2FA. Asking everyone
        for a code up front would tell an attacker which accounts have it.
      */}
      {state.needsTotp ? (
        <Field
          label="Authenticator code"
          errors={state.fieldErrors?.totp}
          hint="6-digit code from your authenticator app."
        >
          {(props) => (
            <Input
              {...props}
              name="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
            />
          )}
        </Field>
      ) : null}

      <SubmitButton />
    </form>
  );
}
