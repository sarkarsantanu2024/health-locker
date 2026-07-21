import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { resolveTone, type StatTone } from "./stat";
import { TONE_STYLES } from "./tone";

/**
 * Status pills.
 *
 * The tone names are the semantic ones the app already speaks — `success`,
 * `warning`, `danger`, `info` — but the colours behind them are the six hues in
 * src/ui/tone.ts rather than a second, nearly-identical palette. `resolveTone`
 * is the single mapping (success → emerald, warning → amber, danger → rose,
 * info → sky, primary → teal), so a "Paid" badge is the same green as an
 * emerald stat tile, and a hue name can be passed directly where a badge is
 * labelling a category rather than a state.
 *
 * Every tone pairs a subtle background with its own foreground, which is a
 * documented AA pair in both themes — and each carries a dot, so status is
 * never conveyed by colour alone (WCAG 1.4.1).
 */
export type BadgeProps = Omit<ComponentProps<"span">, "color"> & {
  tone?: StatTone;
  dot?: boolean;
};

export function Badge({ className, tone = "neutral", dot = true, children, ...props }: BadgeProps) {
  const style = TONE_STYLES[resolveTone(tone)];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        style.chipSolid,
        className,
      )}
      {...props}
    >
      {/* `bg-current` takes the tone's own foreground, so the dot can never
          drift out of step with the text beside it. */}
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
