import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-lg border px-4 py-3 text-sm", {
  variants: {
    tone: {
      info: "border-info/25 bg-info-subtle text-foreground",
      success: "border-success/25 bg-success-subtle text-foreground",
      warning: "border-warning/25 bg-warning-subtle text-foreground",
      danger: "border-danger/25 bg-danger-subtle text-foreground",
    },
  },
  defaultVariants: { tone: "info" },
});

const icons: Record<string, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

const iconTone: Record<string, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export type AlertProps = ComponentProps<"div"> & VariantProps<typeof alertVariants>;

/**
 * `role="alert"` on the urgent tones so assistive technology announces a failed
 * submission immediately; the calmer tones are polite status text. The icon
 * means the tone is never carried by colour alone (WCAG 1.4.1).
 */
export function Alert({ className, tone, children, ...props }: AlertProps) {
  const key = tone ?? "info";
  const Icon = icons[key];
  const assertive = key === "danger" || key === "warning";

  return (
    <div
      role={assertive ? "alert" : "status"}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", iconTone[key])} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
