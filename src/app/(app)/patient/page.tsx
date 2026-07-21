import { Activity, CalendarDays, CreditCard, FileText, Pill, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { listDosesForDay } from "@/modules/patient/medication.service";
import { InstallPrompt } from "@/modules/pwa/install-prompt";
import { Badge } from "@/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { TileLink } from "@/ui/stat";

export const metadata: Metadata = { title: "My health" };
export const dynamic = "force-dynamic";

function greeting(date = new Date()): string {
  // The hour is read in Asia/Kolkata rather than the server's zone: a Vercel
  // function runs in UTC and would wish someone in Kolkata "good morning" at
  // half past five in the evening.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function PatientHomePage() {
  const user = await requireUser();

  // Scoped by the session's user id — never by an id from the URL.
  const patient = await prisma.patient.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: {
      id: true,
      familyOf: {
        where: { deletedAt: null },
        select: {
          relationship: true,
          accessLevel: true,
          member: { select: { fullName: true } },
        },
      },
    },
  });

  const [doses, nextAppointment, latestReport] = patient
    ? await Promise.all([
        listDosesForDay(patient.id),
        prisma.appointment.findFirst({
          where: {
            patientId: patient.id,
            deletedAt: null,
            scheduledAt: { gte: new Date() },
            status: { notIn: ["CANCELLED", "NO_SHOW", "COMPLETED"] },
          },
          orderBy: { scheduledAt: "asc" },
          select: { id: true, scheduledAt: true, org: { select: { name: true } } },
        }),
        prisma.diagnosticReport.findFirst({
          where: { patientId: patient.id, deletedAt: null, status: "PUBLISHED" },
          orderBy: { reportedAt: "desc" },
          select: { id: true, title: true, reportedAt: true },
        }),
      ])
    : ([[], null, null] as const);

  const due = doses.filter((dose) => dose.status === "DUE");
  const firstName = user.displayName.split(" ")[0];

  return (
    <>
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">{greeting()},</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{firstName}</h1>
      </header>

      <InstallPrompt />

      {/* The one thing worth interrupting the tile grid for: something is due
          now, and everything else can wait until it has been dealt with. */}
      {due.length > 0 ? (
        <Card tone="consumer" className="mb-4 border-primary/30 bg-primary-subtle/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="font-medium">
                {due.length} dose{due.length === 1 ? "" : "s"} due today
              </p>
              <p className="text-sm text-muted-foreground">
                {due
                  .slice(0, 3)
                  .map((dose) => `${dose.drugName} at ${formatTime(dose.dueAt)}`)
                  .join(" · ")}
              </p>
            </div>
            <Link
              href="/patient/medicines"
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Mark them off
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <TileLink
          href="/patient/medicines"
          label="Medicines"
          value={due.length > 0 ? `${due.length} due today` : "Schedules and reminders"}
          icon={Pill}
          tone="primary"
        />
        <TileLink
          href="/patient/reports"
          label="Reports"
          value={latestReport ? latestReport.title : "Lab results and scans"}
          icon={FileText}
          tone="info"
        />
        <TileLink
          href="/patient/timeline"
          label="Timeline"
          value="Everything, in order"
          icon={Activity}
          tone="success"
        />
        <TileLink
          href="/patient/billing"
          label="Billing"
          value="Plan and payments"
          icon={CreditCard}
          tone="accent"
        />
      </div>

      {nextAppointment ? (
        <Card tone="consumer" className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
              Next appointment
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{formatDateTime(nextAppointment.scheduledAt)}</p>
              <p className="text-sm text-muted-foreground">{nextAppointment.org.name}</p>
            </div>
            <Badge tone="primary">Booked</Badge>
          </CardContent>
        </Card>
      ) : null}

      <Card tone="consumer" className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users aria-hidden className="size-4 text-muted-foreground" />
            Family
          </CardTitle>
          <CardDescription>People you can view or manage.</CardDescription>
        </CardHeader>
        <CardContent>
          {patient?.familyOf.length ? (
            <ul className="divide-y divide-border">
              {patient.familyOf.map((link) => (
                <li
                  key={link.member.fullName}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <span className="font-medium">{link.member.fullName}</span>
                  <span className="text-sm text-muted-foreground">
                    {link.relationship.toLowerCase()} · {link.accessLevel.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {patient
                ? "No family members linked yet."
                : "No patient profile is linked to this account yet."}
            </p>
          )}
        </CardContent>
      </Card>

      {latestReport ? (
        <p className="text-sm text-muted-foreground">
          Latest report: {latestReport.title} on {formatDate(latestReport.reportedAt)}.{" "}
          <Link href="/patient/reports" className="underline underline-offset-4">
            See all results
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}
