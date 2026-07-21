import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { TONE_STYLES, type Tone } from "./tone";

/**
 * The legacy tone names, kept working because they are spelled across every
 * provider dashboard. They are aliases onto the hue palette rather than a
 * second colour system.
 */
const TONE_ALIASES = {
  primary: "teal",
  warning: "amber",
  danger: "rose",
  info: "sky",
  success: "emerald",
  accent: "amber",
} as const;

export type StatTone = Tone | keyof typeof TONE_ALIASES;

export function resolveTone(tone: StatTone): Tone {
  return (TONE_ALIASES as Record<string, Tone>)[tone] ?? (tone as Tone);
}

/**
 * A single number with its label.
 *
 * The value carries the visual weight; the label sits above it in muted small
 * caps, so reading order matches scanning order and the eye lands on the
 * number. The hue is what makes a row of six of these scannable — the icon
 * chip and the corner wash are the same colour that kind of thing has
 * everywhere else in the product (see src/ui/tone.ts).
 */
export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  className?: string;
}) {
  const resolved = resolveTone(tone);
  const style = TONE_STYLES[resolved];

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-console border border-border bg-surface p-4 shadow-sm",
        "transition-shadow hover:shadow-md",
        style.gradientVars,
        className,
      )}
    >
      {/* The wash sits behind everything and never touches text contrast. */}
      <span aria-hidden className="bg-hue-wash pointer-events-none absolute inset-0" />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              style.chipSolid,
            )}
          >
            <Icon aria-hidden className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="relative mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="relative mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * A hero stat — one number that matters more than the others on the screen,
 * rendered on the hue gradient itself. Use at most one per screen; the point
 * is that it is the only thing shouting.
 */
export function StatHero({
  label,
  value,
  hint,
  icon: Icon,
  tone = "teal",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  className?: string;
}) {
  const style = TONE_STYLES[resolveTone(tone)];

  return (
    <div
      className={cn(
        "bg-hue-gradient relative overflow-hidden rounded-console p-4 text-white shadow-md",
        style.gradientVars,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-white/80">{label}</p>
        {Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/20">
            <Icon aria-hidden className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/80">{hint}</p> : null}
    </div>
  );
}

/** Consumer-portal variant: bigger, rounder, tappable. */
export function TileLink({
  href,
  label,
  value,
  icon: Icon,
  tone = "teal",
}: {
  href: string;
  label: string;
  value?: ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
}) {
  const style = TONE_STYLES[resolveTone(tone)];

  return (
    <a
      href={href}
      className={cn(
        "press group relative flex items-center gap-4 overflow-hidden rounded-consumer border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-lg",
        style.gradientVars,
      )}
    >
      <span aria-hidden className="bg-hue-wash pointer-events-none absolute inset-0" />
      <span
        className={cn(
          "bg-hue-gradient relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm",
        )}
      >
        <Icon aria-hidden className="size-6" />
      </span>
      <span className="relative min-w-0">
        <span className="block font-medium">{label}</span>
        {value ? <span className="block text-sm text-muted-foreground">{value}</span> : null}
      </span>
    </a>
  );
}
