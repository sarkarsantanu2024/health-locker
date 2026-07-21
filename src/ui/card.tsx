import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { TONE_STYLES, type Tone as Hue } from "./tone";

/**
 * `tone` is the density switch:
 *   console  — 8px radius, tight padding, for provider screens
 *   consumer — 16px radius, generous padding, for patient screens
 */
const cardVariants = cva("bg-surface border border-border", {
  variants: {
    tone: {
      console: "rounded-console shadow-sm",
      consumer: "rounded-consumer shadow-md",
    },
    interactive: {
      true: "transition-shadow hover:shadow-lg",
      false: "",
    },
  },
  defaultVariants: { tone: "console", interactive: false },
});

export type CardProps = ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & {
    /**
     * Tints the card in one of the palette hues: a gradient hairline along the
     * top edge and a soft corner wash. Left off, the card is plain white — which
     * is still right for most of them. Colour every card and none of them
     * stands out.
     */
    hue?: Hue;
  };

export function Card({ className, tone, interactive, hue, ...props }: CardProps) {
  const style = hue ? TONE_STYLES[hue] : null;

  return (
    <div
      className={cn(
        cardVariants({ tone, interactive }),
        style && [style.gradientVars, "border-t-brand bg-hue-wash relative overflow-hidden"],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("space-y-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center gap-3 border-t border-border p-5", className)} {...props} />
  );
}
