import { Banknote, CalendarDays, Stethoscope, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { requireTenant } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatTime, money } from "@/lib/format";
import { listAppointments, providerDashboard } from "@/modules/provider/clinical.service";
import { StatusBadge } from "@/modules/provider/ui/status";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { Stat } from "@/ui/stat";

/**
 * The landing screen for a provider console.
 *
 * Today's list is the whole point: the first question anyone opening this at
 * 9am has is "who is coming in", and making them navigate for it is the
 * difference between a dashboard and a decoration. `extra` lets each portal add
 * the one thing that is specific to it (beds, samples, expiring stock).
 */
export async function ProviderDashboard({
  title,
  base,
  extra,
}: {
  title: string;
  base: string;
  extra?: ReactNode;
}) {
  const { user, orgId } = await requireTenant();

  const [org, counts, today] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { name: true, city: true },
    }),
    providerDashboard(orgId),
    listAppointments(orgId, { day: new Date() }),
  ]);

  return (
    <>
      <PageHeader
        title={title}
        description={org ? [org.name, org.city].filter(Boolean).join(" · ") : undefined}
        action={
          <Link href={`${base}/patients/new`} className={buttonVariants({ size: "sm" })}>
            Register patient
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today's appointments" value={counts.todayAppointments} icon={CalendarDays} />
        <Stat label="Waiting now" value={counts.checkedIn} icon={Stethoscope} tone={counts.checkedIn > 0 ? "warning" : "neutral"} />
        <Stat label="Registered patients" value={counts.patients} icon={Users} />
        <Stat
          label="Outstanding"
          value={money(counts.outstandingMinor)}
          hint={`${counts.outstandingCount} unpaid invoice(s)`}
          icon={Banknote}
          tone={counts.outstandingMinor > 0 ? "warning" : "neutral"}
        />
      </div>

      {extra}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Today</CardTitle>
        </CardHeader>
        <CardContent>
          {today.length === 0 ? (
            <EmptyState
              title="Nothing booked today"
              action={
                <Link
                  href={`${base}/appointments`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Open the diary
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {today.slice(0, 10).map((appointment) => (
                <li key={appointment.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="w-16 shrink-0 font-medium">
                    {formatTime(appointment.scheduledAt)}
                  </span>
                  <Link
                    href={`${base}/patients/${appointment.patientId}`}
                    className="min-w-0 flex-1 truncate text-primary underline-offset-4 hover:underline"
                  >
                    {appointment.patientName}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {appointment.practitionerName ?? ""}
                  </span>
                  <StatusBadge value={appointment.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        Signed in as {user.username} · everything on this page is scoped to {org?.name ?? orgId}
      </p>
    </>
  );
}
