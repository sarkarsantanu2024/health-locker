import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Status pills. Every tone pairs a subtle background with its own foreground so
 * contrast holds in both themes — and each carries a dot, so status is never
 * conveyed by colour alone (WCAG 1.4.1).
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        primary: "bg-primary-subtle text-primary",
        success: "bg-success-subtle text-success",
        warning: "bg-warning-subtle text-warning",
        danger: "bg-danger-subtle text-danger",
        info: "bg-info-subtle text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

const dotTone: Record<string, string> = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { dot?: boolean };

export function Badge({ className, tone, dot = true, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? (
        <span aria-hidden className={cn("size-1.5 rounded-full", dotTone[tone ?? "neutral"])} />
      ) : null}
      {children}
    </span>
  );
}
