import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

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

export type CardProps = ComponentProps<"div"> & VariantProps<typeof cardVariants>;

export function Card({ className, tone, interactive, ...props }: CardProps) {
  return <div className={cn(cardVariants({ tone, interactive }), className)} {...props} />;
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
