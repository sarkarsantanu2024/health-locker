import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A single number with its label. The value carries the visual weight and the
 * label sits above it in muted small caps — reading order matches scanning
 * order, so the eye lands on the number.
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
  tone?: "neutral" | "primary" | "warning" | "danger";
  className?: string;
}) {
  const accent = {
    neutral: "text-muted-foreground",
    primary: "text-primary",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  return (
    <div
      className={cn(
        "rounded-console border border-border bg-surface p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? <Icon aria-hidden className={cn("size-4 shrink-0", accent)} /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Consumer-portal variant: bigger, rounder, tappable. */
export function TileLink({
  href,
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  href: string;
  label: string;
  value?: ReactNode;
  icon: LucideIcon;
  tone?: "primary" | "accent" | "info" | "success";
}) {
  const tones = {
    primary: "bg-primary-subtle text-primary",
    accent: "bg-accent-subtle text-accent",
    info: "bg-info-subtle text-info",
    success: "bg-success-subtle text-success",
  }[tone];

  return (
    <a
      href={href}
      className="group flex items-center gap-4 rounded-consumer border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-lg"
    >
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", tones)}>
        <Icon aria-hidden className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {value ? <span className="block text-sm text-muted-foreground">{value}</span> : null}
      </span>
    </a>
  );
}
