import { Activity, Download, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getPatientContext } from "@/modules/patient/context";
import { getTimeline, groupByDay, TIMELINE_KINDS, type TimelineKind } from "@/modules/patient/timeline.service";
import { KIND_LABEL, KindChip, kindTone } from "@/modules/patient/ui/record-kind";
import { buttonVariants } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { Card, CardContent } from "@/ui/card";
import { Input } from "@/ui/field";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { TONE_STYLES } from "@/ui/tone";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Timeline" };
export const dynamic = "force-dynamic";

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const today = new Date().toISOString().slice(0, 10);

  if (iso === today) return "Today";

  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * The timeline is where the palette earns its keep: nine kinds of record in one
 * feed. Each row opens with its kind's chip — hue plus icon plus (for a screen
 * reader) the word — and the filter chips are painted in the same hues, so
 * ticking "Reports" and then scanning for violet is one gesture.
 */
export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[]; q?: string }>;
}) {
  const params = await searchParams;
  const context = await getPatientContext();

  const selected = (Array.isArray(params.kind) ? params.kind : params.kind ? [params.kind] : []).filter(
    (k): k is TimelineKind => (TIMELINE_KINDS as readonly string[]).includes(k),
  );

  const entries = await getTimeline(context.patientId, {
    kinds: selected.length ? selected : undefined,
    query: params.q,
  });

  const groups = groupByDay(entries);
  const hasFilter = selected.length > 0 || Boolean(params.q);

  return (
    <>
      <PageHeader
        title="Health timeline"
        icon={Activity}
        tone="sky"
        description={
          context.isActingForOther
            ? `Everything recorded for ${context.patientName}, newest first.`
            : "Everything recorded for you, newest first."
        }
        action={
          <Link
            href="/api/v1/patient/export"
            prefetch={false}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Download aria-hidden className="size-4" />
            Export PDF
          </Link>
        }
      />

      <form method="get" className="mb-4 space-y-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search your records"
            aria-label="Search your records"
            className="pl-9"
          />
        </div>

        {/* Checkboxes inside a GET form: filters end up in the URL, so a filtered
            timeline is shareable, bookmarkable and survives a refresh. */}
        <fieldset>
          <legend className="sr-only">Filter by type</legend>
          <div className="flex flex-wrap gap-2">
            {TIMELINE_KINDS.map((kind) => {
              const active = selected.includes(kind);
              const style = TONE_STYLES[kindTone(kind)];

              return (
                <label
                  key={kind}
                  className={cn(
                    // A tinted dot marks the hue even when the chip is off, so
                    // the legend is learnable before anything is selected.
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm transition-colors",
                    active
                      ? cn("font-medium", style.chipSolid, style.border)
                      : "border-border bg-surface text-muted-foreground hover:bg-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    name="kind"
                    value={kind}
                    defaultChecked={active}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 rounded-full",
                      active ? "bg-current" : style.chip,
                    )}
                  />
                  {KIND_LABEL[kind]}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex gap-2">
          <button type="submit" className={buttonVariants({ size: "sm" })}>
            Apply
          </button>
          {hasFilter ? (
            <Link href="/patient/timeline" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {groups.length === 0 ? (
        <EmptyState
          art={hasFilter ? "search" : "records"}
          tone="sky"
          title={hasFilter ? "Nothing matches those filters" : "Your timeline is empty"}
          description={
            hasFilter
              ? "Try clearing a filter or searching for something else."
              : "Prescriptions, reports and medicines will appear here as they are added."
          }
          action={
            hasFilter ? (
              <Link href="/patient/timeline" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Clear filters
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.day}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                {formatDay(group.day)}
              </h2>

              <Card tone="consumer">
                <CardContent className="divide-y divide-border p-0">
                  {group.entries.map((entry) => (
                    <article key={entry.id} className="flex items-start gap-3.5 p-4">
                      <KindChip kind={entry.kind} />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{entry.title}</h3>
                          {entry.flag === "CRITICAL" ? (
                            <Badge tone="danger">Needs attention</Badge>
                          ) : entry.flag === "ATTENTION" ? (
                            <Badge tone="warning">Check this</Badge>
                          ) : null}
                          {entry.needsReview ? <Badge tone="info">Unconfirmed</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          <span className={cn("font-medium", TONE_STYLES[kindTone(entry.kind)].text)}>
                            {KIND_LABEL[entry.kind]}
                          </span>
                          {[entry.detail, entry.source].filter(Boolean).length
                            ? ` · ${[entry.detail, entry.source].filter(Boolean).join(" · ")}`
                            : ""}
                        </p>
                      </div>
                    </article>
                  ))}
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
