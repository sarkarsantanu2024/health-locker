"use client";

import { Check, Pause, Pill, Play, Plus, X } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createScheduleAction,
  deleteScheduleAction,
  markDoseAction,
  setScheduleStatusAction,
  type PatientActionState,
} from "@/modules/patient/actions";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Field, Input, Label } from "@/ui/field";
import { EmptyState } from "@/ui/page-header";
import { TONE_STYLES, toneFor } from "@/ui/tone";

const initial: PatientActionState = { ok: false };

/** Rose is what a medicine is, on every screen in the app. */
const MEDICINE_TONE = toneFor("medicine");
const medicine = TONE_STYLES[MEDICINE_TONE];

export interface DoseItem {
  id: string;
  drugName: string;
  dose: string | null;
  dueAt: string;
  status: string;
}

export interface ScheduleItem {
  id: string;
  drugName: string;
  dose: string | null;
  times: string[];
  status: string;
  endDate: string | null;
  source: string | null;
  adherence: { taken: number; expected: number } | null;
}

/** The common times, so the usual case is two taps rather than a time picker. */
const PRESET_TIMES = ["08:00", "14:00", "20:00", "21:00"];

function DoseRow({ dose, readOnly }: { dose: DoseItem; readOnly: boolean }) {
  const [state, action] = useActionState(markDoseAction, initial);
  const done = state.ok || dose.status === "TAKEN" || dose.status === "SKIPPED";

  return (
    <li
      className={cn(
        "bg-hue-wash flex flex-wrap items-center gap-3 rounded-consumer border bg-surface p-4",
        // A dose still to take keeps its hue; one that is dealt with steps back.
        done ? "border-border opacity-80" : medicine.border,
        medicine.gradientVars,
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-2xl",
          done ? "bg-muted text-muted-foreground" : medicine.chipSolid,
        )}
      >
        <Pill aria-hidden className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {dose.drugName}
          {dose.dose ? <span className="text-muted-foreground"> · {dose.dose}</span> : null}
        </p>
        <p className="text-sm text-muted-foreground">
          <time dateTime={dose.dueAt}>{formatTime(dose.dueAt)}</time>
          {dose.status === "MISSED" ? " · missed" : ""}
        </p>
      </div>

      {done ? (
        <Badge tone={dose.status === "SKIPPED" ? "neutral" : "success"}>
          {state.ok ? "Saved" : dose.status === "SKIPPED" ? "Skipped" : "Taken"}
        </Badge>
      ) : readOnly ? null : (
        <div className="flex gap-2">
          <form action={action}>
            <input type="hidden" name="doseId" value={dose.id} />
            <input type="hidden" name="status" value="TAKEN" />
            <Button type="submit" size="sm">
              <Check aria-hidden className="size-4" />
              Taken
            </Button>
          </form>
          <form action={action}>
            <input type="hidden" name="doseId" value={dose.id} />
            <input type="hidden" name="status" value="SKIPPED" />
            <Button type="submit" variant="ghost" size="sm" aria-label={`Skip ${dose.drugName}`}>
              <X aria-hidden className="size-4" />
            </Button>
          </form>
        </div>
      )}
    </li>
  );
}

export function TodayDoses({ doses, readOnly }: { doses: DoseItem[]; readOnly: boolean }) {
  if (doses.length === 0) {
    return (
      <EmptyState
        art="medicine"
        tone={MEDICINE_TONE}
        title="Nothing due today"
        description="Doses appear here as their time comes round."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {doses.map((dose) => (
        <DoseRow key={dose.id} dose={dose} readOnly={readOnly} />
      ))}
    </ul>
  );
}

function ScheduleRow({ schedule, readOnly }: { schedule: ScheduleItem; readOnly: boolean }) {
  const [statusState, statusAction] = useActionState(setScheduleStatusAction, initial);
  const [deleteState, deleteAction] = useActionState(deleteScheduleAction, initial);

  if (deleteState.ok) return null;

  const paused = statusState.ok ? null : schedule.status === "PAUSED";

  return (
    <li
      className={cn(
        "bg-hue-wash rounded-consumer border border-border bg-surface p-4",
        medicine.gradientVars,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {schedule.drugName}
            {schedule.dose ? <span className="text-muted-foreground"> · {schedule.dose}</span> : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {schedule.times.join(", ")}
            {schedule.source ? ` · from ${schedule.source}` : ""}
          </p>
          {schedule.adherence ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Taken {schedule.adherence.taken} of {schedule.adherence.expected} doses so far
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={paused ? "warning" : "success"}>{paused ? "Paused" : "Active"}</Badge>
        </div>
      </div>

      {readOnly ? null : (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={statusAction}>
            <input type="hidden" name="scheduleId" value={schedule.id} />
            <input type="hidden" name="status" value={paused ? "ACTIVE" : "PAUSED"} />
            <Button type="submit" variant="secondary" size="sm">
              {paused ? (
                <Play aria-hidden className="size-4" />
              ) : (
                <Pause aria-hidden className="size-4" />
              )}
              {paused ? "Resume" : "Pause"}
            </Button>
          </form>
          <form action={deleteAction}>
            <input type="hidden" name="scheduleId" value={schedule.id} />
            <Button type="submit" variant="ghost" size="sm">
              Remove
            </Button>
          </form>
        </div>
      )}
    </li>
  );
}

export function ScheduleList({
  schedules,
  readOnly,
}: {
  schedules: ScheduleItem[];
  readOnly: boolean;
}) {
  if (schedules.length === 0) {
    return (
      <EmptyState
        art="medicine"
        tone={MEDICINE_TONE}
        title="No medicines yet"
        description="Add one below, or they appear here automatically when a doctor prescribes them."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {schedules.map((schedule) => (
        <ScheduleRow key={schedule.id} schedule={schedule} readOnly={readOnly} />
      ))}
    </ul>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Saving…" : "Set reminder"}
    </Button>
  );
}

export function AddScheduleForm() {
  const [state, action] = useActionState(createScheduleAction, initial);
  const [open, setOpen] = useState(false);
  const [times, setTimes] = useState<string[]>(["08:00"]);

  if (!open) {
    return (
      <div className="space-y-3">
        {state.message ? <Alert tone="success">{state.message}</Alert> : null}
        <Button type="button" size="lg" full onClick={() => setOpen(true)}>
          <Plus aria-hidden className="size-5" />
          Add a medicine
        </Button>
      </div>
    );
  }

  const toggle = (time: string) =>
    setTimes(times.includes(time) ? times.filter((t) => t !== time) : [...times, time].sort());

  return (
    <Card tone="consumer" hue={MEDICINE_TONE}>
      <CardContent className="p-5">
        <form action={action} className="space-y-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <Field label="Medicine" errors={state.fieldErrors?.drugName}>
            {(props) => <Input {...props} name="drugName" required autoFocus />}
          </Field>

          <Field label="Dose" errors={state.fieldErrors?.dose} optional>
            {(props) => <Input {...props} name="dose" placeholder="1 tablet, 5 ml…" />}
          </Field>

          <div className="space-y-2">
            <Label>When?</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_TIMES.map((time) => {
                const on = times.includes(time);
                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => toggle(time)}
                    aria-pressed={on}
                    className={cn(
                      "press min-h-11 rounded-xl border px-4 text-sm",
                      on
                        ? cn("font-medium", medicine.chipSolid, medicine.border)
                        : "border-border-strong bg-surface",
                    )}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
            {times.map((time) => (
              <input key={time} type="hidden" name="times" value={time} />
            ))}
            {state.fieldErrors?.times ? (
              <p className="text-xs font-medium text-danger" role="alert">
                {state.fieldErrors.times.join(" ")}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start" errors={state.fieldErrors?.startDate} optional>
              {(props) => <Input {...props} name="startDate" type="date" />}
            </Field>
            <Field
              label="Until"
              errors={state.fieldErrors?.endDate}
              optional
              hint="Leave blank if you take it ongoing."
            >
              {(props) => <Input {...props} name="endDate" type="date" />}
            </Field>
          </div>

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
