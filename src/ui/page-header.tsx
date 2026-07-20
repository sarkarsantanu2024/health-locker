import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Placeholder for a screen a later phase builds. Explicit about which phase, so
 * a stub is never mistaken for finished work.
 */
export function ComingInPhase({ phase, what }: { phase: number; what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <p className="text-sm font-medium">{what}</p>
      <p className="mt-1 text-sm text-muted-foreground">Built in Phase {phase}.</p>
    </div>
  );
}
