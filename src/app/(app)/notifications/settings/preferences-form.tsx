"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  setPreferenceAction,
  setQuietHoursAction,
  type NotifyActionState,
} from "@/modules/notify/actions";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

const initial: NotifyActionState = { ok: false };

export interface PreferenceRow {
  type: string;
  label: string;
  description: string;
  webPush: boolean;
}

function SaveOnChange() {
  const { pending } = useFormStatus();
  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      {pending ? "Saving…" : ""}
    </span>
  );
}

function PreferenceToggle({ row }: { row: PreferenceRow }) {
  const [state, action] = useActionState(setPreferenceAction, initial);

  return (
    <form action={action} className="flex items-start justify-between gap-4 py-3">
      <input type="hidden" name="type" value={row.type} />

      <label className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-medium">{row.label}</span>
        <span className="block text-sm text-muted-foreground">{row.description}</span>
        {state.error ? (
          <span className="mt-1 block text-xs text-danger" role="alert">
            {state.error}
          </span>
        ) : null}
      </label>

      <div className="flex shrink-0 items-center gap-2">
        <SaveOnChange />
        <input
          type="checkbox"
          name="webPush"
          defaultChecked={row.webPush}
          aria-label={`Push notifications for ${row.label}`}
          // Submits on toggle: a separate Save button for a row of switches is
          // the classic way to lose someone's change.
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="size-5 accent-[var(--color-primary)]"
        />
      </div>
    </form>
  );
}

export function PreferencesForm({
  rows,
  quietHours,
}: {
  rows: PreferenceRow[];
  quietHours: { start: string | null; end: string | null };
}) {
  const [quietState, quietAction] = useActionState(setQuietHoursAction, initial);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-semibold tracking-tight">What you get pushed</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          Turning one off stops the push only. It is still recorded in your notifications list, so
          you never lose a notice about your own health.
        </p>
        <div className="divide-y divide-border rounded-console border border-border bg-surface px-4">
          {rows.map((row) => (
            <PreferenceToggle key={row.type} row={row} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold tracking-tight">Quiet hours</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Pushes are held back inside this window. Urgent alerts — drug interactions and account
          notices — still come through.
        </p>

        <form action={quietAction} className="space-y-3">
          {quietState.message ? <Alert tone="success">{quietState.message}</Alert> : null}
          {quietState.error ? <Alert tone="danger">{quietState.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" errors={quietState.fieldErrors?.start} optional>
              {(props) => (
                <Input {...props} type="time" name="start" defaultValue={quietHours.start ?? ""} />
              )}
            </Field>
            <Field label="Until" errors={quietState.fieldErrors?.end} optional>
              {(props) => (
                <Input {...props} type="time" name="end" defaultValue={quietHours.end ?? ""} />
              )}
            </Field>
          </div>

          <Button type="submit" variant="secondary" size="sm">
            Save quiet hours
          </Button>
        </form>
      </section>
    </div>
  );
}
