import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-md border px-4 py-3 text-sm", {
  variants: {
    tone: {
      info: "border-border bg-muted text-foreground",
      success: "border-success/40 bg-success/10 text-foreground",
      warning: "border-warning/40 bg-warning/10 text-foreground",
      danger: "border-danger/40 bg-danger/10 text-foreground",
    },
  },
  defaultVariants: { tone: "info" },
});

export type AlertProps = ComponentProps<"div"> & VariantProps<typeof alertVariants>;

/**
 * `role="alert"` on error tones so assistive technology announces a failed
 * submission immediately; other tones are polite status text.
 */
export function Alert({ className, tone, ...props }: AlertProps) {
  const assertive = tone === "danger" || tone === "warning";

  return (
    <div
      role={assertive ? "alert" : "status"}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    />
  );
}
