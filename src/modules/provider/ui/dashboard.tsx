import { Banknote, CalendarDays, LayoutDashboard, Stethoscope, Users } from "lucide-react";
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
import { Stat, StatHero } from "@/ui/stat";
import { toneFor } from "@/ui/tone";

/**
 * The landing screen for a provider console.
 *
 * Today's list is the whole point: the first question anyone opening this at
 * 9am has is "who is coming in", and making them navigate for it is the
 * difference between a dashboard and a decoration. `extra` lets each portal add
 * the one thing that is specific to it (beds, samples, expiring stock).
 *
 * Exactly one number on this screen is promoted to a gradient `StatHero`. For a
 * clinic that is the day's appointment count; the other three portals have a
 * number that beats it (beds, the verification queue, the expiry shelf), so
 * they pass `hero="extra"` and raise their own inside `extra`. Two heroes would
 * mean neither is one.
 */
export async function ProviderDashboard({
  title,
  base,
  extra,
  hero = "appointments",
}: {
  title: string;
  base: string;
  extra?: ReactNode;
  hero?: "appointments" | "extra";
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
        icon={LayoutDashboard}
        tone="teal"
        description={org ? [org.name, org.city].filter(Boolean).join(" · ") : undefined}
        action={
          <Link href={`${base}/patients/new`} className={buttonVariants({ size: "sm" })}>
            Register patient
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {hero === "appointments" ? (
          <StatHero
            label="Today's appointments"
            value={counts.todayAppointments}
            hint={today.length > 0 ? `First at ${formatTime(today[0].scheduledAt)}` : "Diary is clear"}
            icon={CalendarDays}
            tone={toneFor("appointment")}
          />
        ) : (
          <Stat
            label="Today's appointments"
            value={counts.todayAppointments}
            icon={CalendarDays}
            tone={toneFor("appointment")}
          />
        )}
        <Stat
          label="Waiting now"
          value={counts.checkedIn}
          hint={counts.checkedIn > 0 ? "Checked in, not yet seen" : "Nobody in the waiting room"}
          icon={Stethoscope}
          tone={counts.checkedIn > 0 ? toneFor("alert") : "neutral"}
        />
        <Stat
          label="Registered patients"
          value={counts.patients}
          icon={Users}
          tone={toneFor("patient")}
        />
        <Stat
          label="Outstanding"
          value={money(counts.outstandingMinor)}
          hint={`${counts.outstandingCount} unpaid invoice(s)`}
          icon={Banknote}
          tone={toneFor("billing")}
        />
      </div>

      {extra}

      <Card className="mt-6" hue={toneFor("appointment")}>
        <CardHeader>
          <CardTitle>Today</CardTitle>
        </CardHeader>
        <CardContent>
          {today.length === 0 ? (
            <EmptyState
              title="Nothing booked today"
              description="Appointments booked for today show up here, in time order, the moment they are made."
              art="calendar"
              tone={toneFor("appointment")}
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
