import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { APP_TIME_ZONE, zonedTimeToUtc } from "@/lib/format";
import { AppError } from "@/shared/errors";
import type { DoseStatus, MedicationScheduleStatus } from "@/shared/enums";

/**
 * Medicine schedules and the individual doses they generate.
 *
 * Doses are **materialised rows**, not computed on the fly. Three reasons:
 *   - a reminder needs something idempotent to key against, and
 *     `@@unique([scheduleId, dueAt])` gives the cron an at-least-once guarantee
 *     for free;
 *   - adherence ("you took 22 of 28") is unanswerable without a record of the
 *     doses that were *expected*;
 *   - marking one dose skipped must not alter the schedule.
 *
 * Only a bounded horizon is materialised, so an open-ended schedule does not
 * write rows until the end of time.
 */

const HORIZON_DAYS = 3;

export interface ScheduleInput {
  drugName: string;
  dose?: string | null;
  times: string[];
  startDate: Date;
  endDate?: Date | null;
  notes?: string | null;
  prescriptionItemId?: string | null;
}

export async function createSchedule(
  patientId: string,
  input: ScheduleInput,
  actorId: string,
): Promise<{ id: string; dosesCreated: number }> {
  if (input.times.length === 0) {
    throw new AppError("VALIDATION_FAILED", "Add at least one time of day.", { field: "times" });
  }

  if (input.endDate && input.endDate < input.startDate) {
    throw new AppError("VALIDATION_FAILED", "The end date is before the start date.", {
      field: "endDate",
    });
  }

  const schedule = await prisma.medicationSchedule.create({
    data: {
      patientId,
      prescriptionItemId: input.prescriptionItemId ?? null,
      drugName: input.drugName,
      dose: input.dose ?? null,
      // Sorted and de-duplicated here rather than in the form, so a schedule
      // created by the AI pipeline or a clinic gets the same treatment.
      times: [...new Set(input.times)].sort(),
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const dosesCreated = await materialiseDoses(schedule.id);

  await audit({
    action: "medication-schedule:created",
    entityType: "MedicationSchedule",
    entityId: schedule.id,
    actorId,
    metadata: { patientId, drugName: input.drugName, times: input.times },
  });

  return { id: schedule.id, dosesCreated };
}

export async function setScheduleStatus(
  scheduleId: string,
  patientId: string,
  status: MedicationScheduleStatus,
  actorId: string,
): Promise<void> {
  const result = await prisma.medicationSchedule.updateMany({
    where: { id: scheduleId, patientId, deletedAt: null },
    data: { status },
  });

  if (result.count === 0) throw new AppError("NOT_FOUND", "Not found.");

  // Pausing or stopping must clear what has not happened yet, or the reminders
  // keep firing for a drug the patient was told to stop.
  if (status !== "ACTIVE") {
    await prisma.medicationDose.deleteMany({
      where: { scheduleId, status: "DUE", dueAt: { gt: new Date() } },
    });
  } else {
    await materialiseDoses(scheduleId);
  }

  await audit({
    action: "medication-schedule:status-changed",
    entityType: "MedicationSchedule",
    entityId: scheduleId,
    actorId,
    metadata: { status },
  });
}

export async function deleteSchedule(
  scheduleId: string,
  patientId: string,
  actorId: string,
): Promise<void> {
  const result = await prisma.medicationSchedule.updateMany({
    where: { id: scheduleId, patientId, deletedAt: null },
    data: { deletedAt: new Date(), status: "STOPPED" },
  });

  if (result.count === 0) throw new AppError("NOT_FOUND", "Not found.");

  await prisma.medicationDose.deleteMany({
    where: { scheduleId, status: "DUE", dueAt: { gt: new Date() } },
  });

  await audit({
    action: "medication-schedule:deleted",
    entityType: "MedicationSchedule",
    entityId: scheduleId,
    actorId,
  });
}

/**
 * Writes the dose rows for the next `HORIZON_DAYS` for one schedule.
 * Safe to call repeatedly: the unique constraint makes duplicates a no-op.
 */
export async function materialiseDoses(scheduleId: string, timeZone = APP_TIME_ZONE): Promise<number> {
  const schedule = await prisma.medicationSchedule.findFirst({
    where: { id: scheduleId, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      times: true,
      startDate: true,
      endDate: true,
      patient: { select: { user: { select: { timezone: true } } } },
    },
  });

  if (!schedule) return 0;

  const zone = schedule.patient.user?.timezone ?? timeZone;
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const rows: { scheduleId: string; dueAt: Date }[] = [];

  for (let dayOffset = 0; dayOffset <= HORIZON_DAYS; dayOffset += 1) {
    const day = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(day)
      .split("-")
      .map(Number);

    for (const time of schedule.times) {
      const [hour, minute] = time.split(":").map(Number);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;

      const dueAt = zonedTimeToUtc(y, m, d, hour, minute, zone);

      // Past times are skipped: writing a dose that was already due would
      // immediately fire a reminder for a moment that has gone.
      if (dueAt < now || dueAt > horizonEnd) continue;
      if (dueAt < schedule.startDate) continue;
      if (schedule.endDate && dueAt > schedule.endDate) continue;

      rows.push({ scheduleId: schedule.id, dueAt });
    }
  }

  if (rows.length === 0) return 0;

  const result = await prisma.medicationDose.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

/** Materialises for every active schedule. Called by the reminder cron. */
export async function materialiseAllDue(): Promise<number> {
  const schedules = await prisma.medicationSchedule.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      startDate: { lte: new Date(Date.now() + HORIZON_DAYS * 24 * 60 * 60 * 1000) },
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
    },
    select: { id: true },
  });

  let created = 0;
  for (const schedule of schedules) created += await materialiseDoses(schedule.id);

  return created;
}

export async function markDose(
  doseId: string,
  patientId: string,
  status: Extract<DoseStatus, "TAKEN" | "SKIPPED">,
  actorId: string,
): Promise<void> {
  // Scoped through the schedule so a dose id from another patient cannot be
  // marked — the id in the form is attacker-controlled.
  const dose = await prisma.medicationDose.findFirst({
    where: { id: doseId, schedule: { patientId, deletedAt: null } },
    select: { id: true },
  });

  if (!dose) throw new AppError("NOT_FOUND", "Not found.");

  await prisma.medicationDose.update({
    where: { id: doseId },
    data: { status, takenAt: status === "TAKEN" ? new Date() : null },
  });

  await audit({
    action: "medication-dose:marked",
    entityType: "MedicationDose",
    entityId: doseId,
    actorId,
    metadata: { status, patientId },
  });
}

/** Doses whose time has passed without being marked become MISSED. */
export async function expireOverdueDoses(graceMinutes = 120): Promise<number> {
  const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000);

  const result = await prisma.medicationDose.updateMany({
    where: { status: "DUE", dueAt: { lt: cutoff } },
    data: { status: "MISSED" },
  });

  return result.count;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface ScheduleView {
  id: string;
  drugName: string;
  dose: string | null;
  times: string[];
  status: MedicationScheduleStatus;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  source: string | null;
  adherence: { taken: number; expected: number } | null;
}

export async function listSchedules(patientId: string): Promise<ScheduleView[]> {
  const schedules = await prisma.medicationSchedule.findMany({
    where: { patientId, deletedAt: null },
    orderBy: [{ status: "asc" }, { drugName: "asc" }],
    select: {
      id: true,
      drugName: true,
      dose: true,
      times: true,
      status: true,
      startDate: true,
      endDate: true,
      notes: true,
      prescriptionItem: {
        select: { prescription: { select: { prescriberName: true, org: { select: { name: true } } } } },
      },
      doses: {
        where: { dueAt: { lt: new Date() } },
        select: { status: true },
        take: 200,
        orderBy: { dueAt: "desc" },
      },
    },
  });

  return schedules.map((schedule) => {
    const expected = schedule.doses.length;
    const taken = schedule.doses.filter((dose) => dose.status === "TAKEN").length;
    const prescription = schedule.prescriptionItem?.prescription;

    return {
      id: schedule.id,
      drugName: schedule.drugName,
      dose: schedule.dose,
      times: schedule.times,
      status: schedule.status,
      startDate: schedule.startDate.toISOString(),
      endDate: schedule.endDate?.toISOString() ?? null,
      notes: schedule.notes,
      source: prescription?.org?.name ?? prescription?.prescriberName ?? null,
      adherence: expected > 0 ? { taken, expected } : null,
    };
  });
}

export interface DoseView {
  id: string;
  scheduleId: string;
  drugName: string;
  dose: string | null;
  dueAt: string;
  status: DoseStatus;
}

/** Everything due today plus anything still unmarked from earlier. */
export async function listDosesForDay(patientId: string, day = new Date()): Promise<DoseView[]> {
  const start = new Date(day);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const doses = await prisma.medicationDose.findMany({
    where: {
      schedule: { patientId, deletedAt: null },
      OR: [
        { dueAt: { gte: start, lt: end } },
        { status: "DUE", dueAt: { lt: start } },
      ],
    },
    orderBy: { dueAt: "asc" },
    take: 100,
    select: {
      id: true,
      dueAt: true,
      status: true,
      scheduleId: true,
      schedule: { select: { drugName: true, dose: true } },
    },
  });

  return doses.map((dose) => ({
    id: dose.id,
    scheduleId: dose.scheduleId,
    drugName: dose.schedule.drugName,
    dose: dose.schedule.dose,
    dueAt: dose.dueAt.toISOString(),
    status: dose.status,
  }));
}

/**
 * Turns the drug lines of a prescription into schedules. Called when a clinician
 * issues a prescription, so the patient's reminders exist without them retyping
 * anything.
 *
 * Frequency text is deliberately mapped conservatively: anything not recognised
 * gets a single morning dose the patient can edit, rather than a guess that
 * over-doses the reminder.
 */
export async function schedulesFromPrescription(
  prescriptionId: string,
  actorId: string,
): Promise<number> {
  const prescription = await prisma.prescription.findFirst({
    where: { id: prescriptionId, deletedAt: null },
    select: {
      patientId: true,
      issuedAt: true,
      items: { where: { deletedAt: null }, select: { id: true, drugName: true, dose: true, frequency: true, duration: true } },
    },
  });

  if (!prescription) throw new AppError("NOT_FOUND", "Not found.");

  let created = 0;

  for (const item of prescription.items) {
    const existing = await prisma.medicationSchedule.count({
      where: { prescriptionItemId: item.id, deletedAt: null },
    });
    if (existing > 0) continue;

    const times = timesFromFrequency(item.frequency);
    const days = daysFromDuration(item.duration);

    await createSchedule(
      prescription.patientId,
      {
        drugName: item.drugName,
        dose: item.dose,
        times,
        startDate: prescription.issuedAt,
        endDate: days ? new Date(prescription.issuedAt.getTime() + days * 24 * 60 * 60 * 1000) : null,
        prescriptionItemId: item.id,
      },
      actorId,
    );

    created += 1;
  }

  return created;
}

/** "1-0-1", "twice daily", "BD" → times of day. Unrecognised → one morning dose. */
export function timesFromFrequency(frequency: string | null | undefined): string[] {
  const text = (frequency ?? "").trim().toLowerCase();

  // The Indian prescription convention: morning-afternoon-night counts.
  const pattern = text.match(/^([0-9½]+)\s*[-–]\s*([0-9½]+)\s*[-–]\s*([0-9½]+)$/);
  if (pattern) {
    const slots = ["08:00", "14:00", "20:00"];
    return slots.filter((_, index) => {
      const value = pattern[index + 1];
      return value !== "0";
    });
  }

  if (/\bqid\b|four times/.test(text)) return ["08:00", "12:00", "16:00", "20:00"];
  if (/\btds\b|\btid\b|thrice|three times/.test(text)) return ["08:00", "14:00", "20:00"];
  if (/\bbd\b|\bbid\b|twice/.test(text)) return ["08:00", "20:00"];
  if (/\bhs\b|bedtime|night/.test(text)) return ["21:00"];
  if (/\bod\b|once|daily|morning/.test(text)) return ["08:00"];

  return ["08:00"];
}

/** "5 days", "2 weeks", "1 month" → a day count, or null for open-ended. */
export function daysFromDuration(duration: string | null | undefined): number | null {
  const text = (duration ?? "").trim().toLowerCase();
  const match = text.match(/(\d+)\s*(day|week|month)/);

  if (!match) return null;

  const count = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(count) || count <= 0) return null;

  return unit === "week" ? count * 7 : unit === "month" ? count * 30 : count;
}
