import type { Metadata } from "next";
import Link from "next/link";

import { getPatientContext } from "@/modules/patient/context";
import { listDosesForDay, listSchedules } from "@/modules/patient/medication.service";
import { Alert } from "@/ui/alert";
import { PageHeader } from "@/ui/page-header";

import { AddScheduleForm, ScheduleList, TodayDoses } from "./medicines-client";

export const metadata: Metadata = { title: "Medicines" };
export const dynamic = "force-dynamic";

/**
 * Today's doses come first and the full list of schedules second.
 *
 * The question a patient opens this screen to answer is "have I taken it?", not
 * "what am I on" — and a list of schedules cannot answer the first one.
 */
export default async function MedicinesPage() {
  const context = await getPatientContext();
  const readOnly = context.accessLevel !== "MANAGE";

  const [doses, schedules] = await Promise.all([
    listDosesForDay(context.patientId),
    listSchedules(context.patientId),
  ]);

  return (
    <>
      <PageHeader
        title="Medicines"
        description={
          context.isActingForOther
            ? `${context.patientName}'s medicines`
            : "What to take, and when."
        }
      />

      {readOnly ? (
        <Alert tone="info" className="mb-4">
          You have view-only access to {context.patientName}&apos;s record, so you can see the
          schedule but not change it or mark doses.
        </Alert>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold tracking-tight">Today</h2>
        <TodayDoses doses={doses} readOnly={readOnly} />
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold tracking-tight">All medicines</h2>
        <ScheduleList schedules={schedules} readOnly={readOnly} />
        {readOnly ? null : <AddScheduleForm />}
      </section>

      <p className="mt-8 text-sm text-muted-foreground">
        Reminders arrive as notifications. Turn push on per device in{" "}
        <Link href="/notifications/settings" className="underline underline-offset-4">
          notification settings
        </Link>
        .
      </p>
    </>
  );
}
