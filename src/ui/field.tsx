import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Accessible form primitives. The `Field` wrapper is what guarantees compliance
 * rather than leaving it to each form: it wires label, hint and error together
 * by id and marks the control invalid — so a screen reader announces the error
 * instead of it being a visual-only red line.
 */

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-sm font-medium", className)} {...props} />;
}

const controlClasses =
  "w-full rounded-lg border border-border-strong bg-surface px-3.5 text-base shadow-sm transition-colors " +
  "placeholder:text-muted-foreground hover:border-muted-foreground/50 " +
  "disabled:cursor-not-allowed disabled:opacity-55 " +
  // aria-invalid drives the error styling, so it can never disagree with what
  // assistive technology is told.
  "aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClasses, "h-11", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlClasses, "h-11 pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClasses, "min-h-24 py-2.5", className)} {...props} />;
}

interface FieldProps {
  label: string;
  /** Field-level messages from the server action's zod result. */
  errors?: string[];
  hint?: ReactNode;
  optional?: boolean;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean;
  }) => ReactNode;
}

export function Field({ label, errors, hint, optional, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const hasError = Boolean(errors?.length);

  const describedBy = [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
      </div>

      {children({ id, "aria-describedby": describedBy || undefined, "aria-invalid": hasError })}

      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {hasError ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {errors!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
