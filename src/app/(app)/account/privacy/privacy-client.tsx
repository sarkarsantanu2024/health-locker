"use client";

import { LogOut, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { formatDateTime, humanizeEnum } from "@/lib/format";
import {
  requestErasureAction,
  revokeSessionAction,
  setConsentFormAction,
  type PatientActionState,
} from "@/modules/patient/actions";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Field, Textarea } from "@/ui/field";

const initial: PatientActionState = { ok: false };

export interface ConsentRow {
  type: string;
  label: string;
  description: string;
  granted: boolean;
  /** Withdrawing this one would break the product, so it is explained not offered. */
  required: boolean;
}

export interface SessionRow {
  id: string;
  isCurrent: boolean;
  device: string;
  ip: string | null;
  createdAt: string;
}

function Busy({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export function ConsentToggle({ consent }: { consent: ConsentRow }) {
  const [state, action] = useActionState(setConsentFormAction, initial);
  const granted = state.ok ? !consent.granted : consent.granted;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{consent.label}</p>
        <p className="text-sm text-muted-foreground">{consent.description}</p>
        {state.error ? (
          <p className="mt-1 text-xs text-danger" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Badge tone={granted ? "success" : "neutral"}>{granted ? "Given" : "Withdrawn"}</Badge>

        {consent.required ? (
          <span className="text-xs text-muted-foreground">Required</span>
        ) : (
          <form action={action}>
            <input type="hidden" name="type" value={consent.type} />
            <input type="hidden" name="granted" value={granted ? "false" : "true"} />
            <Busy label={granted ? "Withdraw" : "Give consent"} busy="Saving…" />
          </form>
        )}
      </div>
    </div>
  );
}

export function SessionRowItem({ session }: { session: SessionRow }) {
  const [state, action] = useActionState(revokeSessionAction, initial);

  if (state.ok) return null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium">
          {session.device}
          {session.isCurrent ? (
            <Badge tone="primary" className="ml-2">
              This device
            </Badge>
          ) : null}
        </p>
        <p className="text-sm text-muted-foreground">
          Signed in {formatDateTime(session.createdAt)}
          {session.ip ? ` · ${session.ip}` : ""}
        </p>
      </div>

      {session.isCurrent ? null : (
        <form action={action}>
          <input type="hidden" name="sessionId" value={session.id} />
          <Button type="submit" variant="ghost" size="sm">
            <LogOut aria-hidden className="size-4" />
            Sign out
          </Button>
        </form>
      )}

      {state.error ? (
        <p className="w-full text-xs text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Erasure is behind a confirmation and a free-text reason, and the copy states
 * plainly that not everything can be deleted. Promising total erasure and then
 * keeping records for a retention obligation would be the worse outcome.
 */
export function ErasureRequest() {
  const [state, action] = useActionState(requestErasureAction, initial);
  const [open, setOpen] = useState(false);

  if (state.ok) return <Alert tone="success">{state.message}</Alert>;

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden className="size-4" />
        Request deletion of my data
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Alert tone="warning">
        We will delete everything we are legally allowed to. Some records — invoices, and clinical
        notes a provider is required to retain — have to be kept for a statutory period, and we will
        tell you exactly which.
      </Alert>

      <Field label="Anything you want us to know?" optional>
        {(props) => <Textarea {...props} name="reason" rows={3} />}
      </Field>

      <div className="flex gap-2">
        <Busy label="Send request" busy="Sending…" />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ConsentList({ consents }: { consents: ConsentRow[] }) {
  return (
    <div className="divide-y divide-border">
      {consents.map((consent) => (
        <ConsentToggle key={consent.type} consent={consent} />
      ))}
    </div>
  );
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No other devices are signed in.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {sessions.map((session) => (
        <SessionRowItem key={session.id} session={session} />
      ))}
    </ul>
  );
}

export { humanizeEnum };
