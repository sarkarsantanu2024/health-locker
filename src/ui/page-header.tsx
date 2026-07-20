import { Construction } from "lucide-react";
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
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Placeholder for a screen a later phase builds. Names the phase explicitly, so
 * an unfinished area is never mistaken for a broken one.
 */
export function ComingInPhase({ phase, what }: { phase: number; what: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-console border border-dashed border-border-strong bg-surface-2 px-6 py-10 text-center">
      <Construction aria-hidden className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">{what}</p>
      <p className="text-sm text-muted-foreground">Built in Phase {phase}.</p>
    </div>
  );
}

/** Empty state for a list that legitimately has nothing in it yet. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-console border border-dashed border-border-strong px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
