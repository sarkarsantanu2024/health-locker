import {
  Activity,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  FlaskConical,
  Pill,
  Receipt,
  ScrollText,
  ShieldAlert,
  Syringe,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APP_TIME_ZONE, formatDate, formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listDosesForDay } from "@/modules/patient/medication.service";
import { InstallPrompt } from "@/modules/pwa/install-prompt";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Illustration } from "@/ui/illustration";
import { TileLink } from "@/ui/stat";
import { TONE_STYLES, toneFor } from "@/ui/tone";

export const metadata: Metadata = { title: "My health" };
export const dynamic = "force-dynamic";

function greeting(date = new Date()): string {
  // The hour is read in Asia/Kolkata rather than the server's zone: a Vercel
  // function runs in UTC and would wish someone in Kolkata "good morning" at
  // half past five in the evening.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: APP_TIME_ZONE,
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function today(date = new Date()): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

/**
 * The home screen.
 *
 * It answers one question — "is there anything I have to do?" — and then offers
 * the six kinds of thing in the locker, each in the hue it wears everywhere
 * else, so the grid can be found by colour rather than read word by word. That
 * matters for the audience: often elderly, often anxious, often in a hurry.
 */
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

  const [doses, nextAppointment, latestReport, prescriptions, vaccinations, documents] = patient
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
        prisma.prescription.count({ where: { patientId: patient.id, deletedAt: null } }),
        prisma.vaccination.count({
          where: { patientId: patient.id, deletedAt: null, administeredAt: { not: null } },
        }),
        prisma.document.count({
          where: {
            patientId: patient.id,
            deletedAt: null,
            status: { in: ["UPLOADED", "PROCESSING", "PROCESSED"] },
          },
        }),
      ])
    : ([[], null, null, 0, 0, 0] as const);

  const due = doses.filter((dose) => dose.status === "DUE");
  const firstName = user.displayName.split(" ")[0];

  const medicine = TONE_STYLES[toneFor("medicine")];
  const appointment = TONE_STYLES[toneFor("appointment")];
  const family = TONE_STYLES[toneFor("family")];

  const counted = (n: number, one: string, many = `${one}s`) =>
    `${n} ${n === 1 ? one : many}`;

  return (
    <>
      {/*
       * The greeting is the only place in the app that is decorative on purpose.
       * `.bg-mesh` is four low-opacity radials, so it never shifts the contrast
       * of the text sitting on it — the heading is still --foreground on
       * --background as far as a contrast checker is concerned.
       */}
      <header className="bg-mesh relative mb-4 overflow-hidden rounded-consumer border border-border p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{greeting()},</p>
            <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{today()}</p>
          </div>

          <Illustration
            name={due.length > 0 ? "medicine" : nextAppointment ? "calendar" : "records"}
            tone={due.length > 0 ? toneFor("medicine") : toneFor("appointment")}
            className="hidden h-20 shrink-0 sm:block"
          />
        </div>
      </header>

      <InstallPrompt />

      {/* --- what has to happen today ---------------------------------------- */}

      {due.length > 0 ? (
        /* The one thing worth interrupting the grid for. Rose, because rose is
           what medicines are everywhere else in the app. */
        <Card tone="consumer" hue={toneFor("medicine")} className="mb-4">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-2xl",
                  medicine.chipSolid,
                )}
              >
                <Pill aria-hidden className="size-6" />
              </span>

              <div className="min-w-0 flex-1">
                <p className={cn("text-xs font-semibold uppercase tracking-wide", medicine.text)}>
                  Due now
                </p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight">
                  {counted(due.length, "dose")} to take today
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {due.slice(0, 3).map((dose) => (
                    <li key={dose.id} className="truncate">
                      {dose.drugName} at <time dateTime={dose.dueAt}>{formatTime(dose.dueAt)}</time>
                    </li>
                  ))}
                  {due.length > 3 ? <li>and {due.length - 3} more</li> : null}
                </ul>
              </div>
            </div>

            <Link
              href="/patient/medicines"
              className={cn(buttonVariants({ size: "lg", full: true }), "mt-4")}
            >
              <Check aria-hidden className="size-5" />
              Mark them off
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {nextAppointment ? (
        <Card tone="consumer" hue={toneFor("appointment")} className="mb-4">
          <CardContent className="flex flex-wrap items-center gap-4 p-5">
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-2xl",
                appointment.chipSolid,
              )}
            >
              <CalendarDays aria-hidden className="size-6" />
            </span>

            <div className="min-w-0 flex-1">
              <p className={cn("text-xs font-semibold uppercase tracking-wide", appointment.text)}>
                Next appointment
              </p>
              <p className="mt-0.5 text-lg font-semibold tracking-tight">
                {formatDateTime(nextAppointment.scheduledAt)}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {nextAppointment.org.name}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {due.length === 0 && !nextAppointment ? (
        <Card tone="consumer" hue={toneFor("vaccination")} className="mb-4">
          <CardContent className="flex items-center gap-4 p-5">
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-2xl",
                TONE_STYLES[toneFor("vaccination")].chipSolid,
              )}
            >
              <Check aria-hidden className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight">Nothing due today</p>
              <p className="text-sm text-muted-foreground">
                No doses to take and no appointments booked.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* --- the locker, by kind ---------------------------------------------
       * Six tiles, six hues, one per kind of thing a patient stores. The colour
       * is the index: a patient who has learned "violet is a report" finds it
       * without reading the grid.
       */}
      <h2 className="mb-3 mt-6 text-base font-semibold tracking-tight">Your locker</h2>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <TileLink
          href="/patient/timeline?kind=PRESCRIPTION"
          label="Prescriptions"
          value={prescriptions > 0 ? counted(prescriptions, "prescription") : "From your doctors"}
          icon={ScrollText}
          tone={toneFor("prescription")}
        />
        <TileLink
          href="/patient/reports"
          label="Reports"
          value={latestReport ? latestReport.title : "Lab results and scans"}
          icon={FlaskConical}
          tone={toneFor("report")}
        />
        <TileLink
          href="/patient/medicines"
          label="Medicines"
          value={due.length > 0 ? `${counted(due.length, "dose")} due today` : "Schedules and reminders"}
          icon={Pill}
          tone={toneFor("medicine")}
        />
        <TileLink
          href="/patient/timeline?kind=VACCINATION"
          label="Vaccinations"
          value={vaccinations > 0 ? counted(vaccinations, "dose") : "Your vaccination record"}
          icon={Syringe}
          tone={toneFor("vaccination")}
        />
        <TileLink
          href="/patient/timeline?kind=DOCUMENT"
          label="Documents"
          value={documents > 0 ? counted(documents, "file") : "Scans and uploads"}
          icon={FileText}
          tone={toneFor("document")}
        />
        <TileLink
          href="/patient/billing"
          label="Bills and spending"
          value="Plan, invoices and expenses"
          icon={Receipt}
          tone={toneFor("expense")}
        />
      </div>

      {/* --- family ----------------------------------------------------------- */}

      <Card tone="consumer" hue={toneFor("family")} className="mb-4">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-2xl",
                family.chipSolid,
              )}
            >
              <Users aria-hidden className="size-6" />
            </span>

            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold tracking-tight">Family</h2>
              <p className="text-sm text-muted-foreground">People you can view or manage.</p>

              {patient?.familyOf.length ? (
                <ul className="mt-3 divide-y divide-border">
                  {patient.familyOf.map((link) => (
                    <li
                      key={link.member.fullName}
                      className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="min-w-0 truncate font-medium">{link.member.fullName}</span>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {link.relationship.toLowerCase()} · {link.accessLevel.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {patient
                    ? "No family members linked yet."
                    : "No patient profile is linked to this account yet."}
                </p>
              )}

              <Link
                href="/patient/family"
                className={cn(
                  "press mt-3 inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium",
                  family.chipSolid,
                )}
              >
                Manage family
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- the two screens that are not a record kind ----------------------- */}

      <div className="grid gap-3 sm:grid-cols-2">
        <TileLink
          href="/patient/timeline"
          label="Health timeline"
          value="Everything, in order"
          icon={Activity}
          tone={toneFor("document")}
        />
        <TileLink
          href="/patient/emergency"
          label="Emergency card"
          value="For when you cannot speak"
          icon={ShieldAlert}
          tone={toneFor("alert")}
        />
      </div>

      {latestReport ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Latest report: {latestReport.title} on {formatDate(latestReport.reportedAt)}.{" "}
          <Link href="/patient/reports" className="font-medium text-primary underline underline-offset-4">
            See all results
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}
