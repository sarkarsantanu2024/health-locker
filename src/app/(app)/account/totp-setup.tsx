"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  beginTotpAction,
  confirmTotpAction,
  disableTotpAction,
  type ActionState,
  type TotpEnrolmentState,
} from "@/modules/identity/actions";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

const initialState: ActionState = { ok: false };

function Submit({ label, busyLabel }: { label: string; busyLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busyLabel : label}
    </Button>
  );
}

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [enrolment, setEnrolment] = useState<TotpEnrolmentState | null>(null);
  const [starting, startEnrolment] = useTransition();
  const [confirmState, confirmAction] = useActionState(confirmTotpAction, initialState);
  const [disableState, disableAction] = useActionState(disableTotpAction, initialState);
  const [copied, setCopied] = useState(false);

  if (confirmState.ok) {
    return <Alert tone="success">Two-factor authentication is now on.</Alert>;
  }

  if (enabled) {
    return (
      <div className="space-y-4">
        <Alert tone="success">Two-factor authentication is on.</Alert>

        {disableState.error ? <Alert tone="danger">{disableState.error}</Alert> : null}

        <form action={disableAction} className="space-y-3">
          <Field label="Confirm with your password" errors={disableState.fieldErrors?.password}>
            {(props) => (
              <Input
                {...props}
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            )}
          </Field>
          <Submit label="Turn off two-factor" busyLabel="Turning off…" />
        </form>
      </div>
    );
  }

  if (!enrolment?.secret) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Protect your account with a code from an authenticator app.
        </p>
        {enrolment?.error ? <Alert tone="danger">{enrolment.error}</Alert> : null}
        <Button
          type="button"
          variant="secondary"
          disabled={starting}
          onClick={() => startEnrolment(async () => setEnrolment(await beginTotpAction()))}
        >
          {starting ? "Preparing…" : "Set up two-factor"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add this key to an authenticator app (Google Authenticator, Authy, 1Password), then
        enter the 6-digit code it shows.
      </p>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {/* Grouped in fours: this gets typed by hand into a phone. */}
          <code className="flex-1 wrap-break-word rounded-md bg-muted px-3 py-2 font-mono text-sm">
            {enrolment.secret.match(/.{1,4}/g)?.join(" ")}
          </code>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(enrolment.secret!);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        {enrolment.uri ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Setup link (for apps that accept a URI)</summary>
            <code className="mt-2 block wrap-break-word">{enrolment.uri}</code>
          </details>
        ) : null}
      </div>

      {confirmState.error ? <Alert tone="danger">{confirmState.error}</Alert> : null}

      <form action={confirmAction} className="space-y-3">
        <Field label="6-digit code" errors={confirmState.fieldErrors?.code}>
          {(props) => (
            <Input
              {...props}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          )}
        </Field>
        <Submit label="Turn on two-factor" busyLabel="Verifying…" />
      </form>
    </div>
  );
}
