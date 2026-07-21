import { Construction, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Illustration, type IllustrationName } from "./illustration";
import { TONE_STYLES, type Tone } from "./tone";
import { resolveTone, type StatTone } from "./stat";

export function PageHeader({
  title,
  description,
  action,
  icon: Icon,
  tone = "teal",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** A tinted mark beside the title, so screens are told apart at a glance. */
  icon?: LucideIcon;
  tone?: StatTone;
}) {
  const style = TONE_STYLES[resolveTone(tone)];

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span
            className={cn(
              "bg-hue-gradient mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-console text-white shadow-sm",
              style.gradientVars,
            )}
          >
            <Icon aria-hidden className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * Placeholder for a screen a later phase builds. Names the phase explicitly, so
 * an unfinished area is never mistaken for a broken one.
 */
export function ComingInPhase({ phase, what }: { phase: number; what: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-console border border-dashed border-border-strong bg-surface-2 px-6 py-10 text-center">
      <Construction aria-hidden className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">{what}</p>
      <p className="text-sm text-muted-foreground">Built in Phase {phase}.</p>
    </div>
  );
}

/**
 * Empty state for a list that legitimately has nothing in it yet.
 *
 * The drawing is the point: a blank panel with one line of grey text is the
 * same thing a failed fetch looks like. Pass the `art` that matches the screen
 * — `calendar` for a diary, `records` for a list of documents — and the tone
 * of the section it sits in.
 */
export function EmptyState({
  title,
  description,
  action,
  art = "records",
  tone = "teal",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  art?: IllustrationName | null;
  tone?: StatTone;
}) {
  const resolved: Tone = resolveTone(tone);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-console border border-dashed border-border-strong px-6 py-10 text-center",
      )}
    >
      {art ? <Illustration name={art} tone={resolved} className="mb-1 h-28" /> : null}
      <p className="text-base font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
