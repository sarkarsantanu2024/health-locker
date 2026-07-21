import { prisma } from "@/lib/db";
import { formatDate, formatTime, money } from "@/lib/format";
import { expireOverdueDoses, materialiseAllDue } from "@/modules/patient/medication.service";
import { notify, notifyPatient } from "@/modules/notify/notify.service";

/**
 * Everything the reminder cron does. Each function is independently safe to
 * re-run: every send carries a `dedupeKey` derived from the row it is about, so
 * an at-least-once queue never nags a patient twice about the same dose.
 *
 * Windows are deliberately wider than the cron interval. A cron that fires every
 * 15 minutes but looks at a 15-minute window drops anything that lands in a
 * skipped run; overlapping the window and relying on dedupe is the safer shape.
 */

export interface ReminderRun {
  dosesMaterialised: number;
  dosesMissed: number;
  medicineReminders: number;
  appointmentReminders: number;
  vaccinationReminders: number;
  paymentReminders: number;
  stockExpiryAlerts: number;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export async function runMedicineReminders(now = new Date()): Promise<number> {
  const doses = await prisma.medicationDose.findMany({
    where: {
      status: "DUE",
      dueAt: { gte: new Date(now.getTime() - 30 * MINUTE), lte: new Date(now.getTime() + 30 * MINUTE) },
      schedule: { deletedAt: null, status: "ACTIVE" },
    },
    take: 500,
    select: {
      id: true,
      dueAt: true,
      schedule: { select: { drugName: true, dose: true, patientId: true } },
    },
  });

  let sent = 0;

  for (const dose of doses) {
    const result = await notifyPatient(dose.schedule.patientId, {
      type: "MEDICINE_REMINDER",
      title: `Time for ${dose.schedule.drugName}`,
      body: [dose.schedule.dose, `due at ${formatTime(dose.dueAt)}`].filter(Boolean).join(" · "),
      data: { url: "/patient/medicines", doseId: dose.id },
      dedupeKey: `dose:${dose.id}`,
    });

    if (result && !result.deduped) sent += 1;
  }

  return sent;
}

export async function runAppointmentReminders(now = new Date()): Promise<number> {
  // A day out, with a generous window so a missed cron run still catches it.
  const appointments = await prisma.appointment.findMany({
    where: {
      deletedAt: null,
      status: { in: ["SCHEDULED", "REQUESTED"] },
      scheduledAt: { gte: new Date(now.getTime() + 20 * HOUR), lte: new Date(now.getTime() + 28 * HOUR) },
    },
    take: 500,
    select: {
      id: true,
      scheduledAt: true,
      patientId: true,
      org: { select: { name: true } },
      practitioner: { select: { fullName: true } },
    },
  });

  let sent = 0;

  for (const appointment of appointments) {
    const result = await notifyPatient(appointment.patientId, {
      type: "APPOINTMENT_REMINDER",
      title: `Appointment tomorrow at ${formatTime(appointment.scheduledAt)}`,
      body: [appointment.org.name, appointment.practitioner?.fullName]
        .filter(Boolean)
        .join(" · "),
      data: { url: "/patient/timeline?kinds=visit", appointmentId: appointment.id },
      dedupeKey: `appointment:${appointment.id}`,
    });

    if (result && !result.deduped) sent += 1;
  }

  return sent;
}

export async function runVaccinationReminders(now = new Date()): Promise<number> {
  const vaccinations = await prisma.vaccination.findMany({
    where: {
      deletedAt: null,
      nextDueAt: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 7 * DAY) },
    },
    take: 500,
    select: { id: true, vaccineName: true, nextDueAt: true, patientId: true },
  });

  let sent = 0;

  for (const vaccination of vaccinations) {
    const result = await notifyPatient(vaccination.patientId, {
      type: "VACCINATION_DUE",
      title: `${vaccination.vaccineName} is due`,
      body: `Next dose due ${formatDate(vaccination.nextDueAt!)}.`,
      data: { url: "/patient/timeline?kinds=vaccination", vaccinationId: vaccination.id },
      dedupeKey: `vaccination:${vaccination.id}:${vaccination.nextDueAt!.toISOString().slice(0, 10)}`,
    });

    if (result && !result.deduped) sent += 1;
  }

  return sent;
}

export async function runPaymentReminders(now = new Date()): Promise<number> {
  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ["ISSUED", "OVERDUE"] },
      dueAt: { not: null, lte: new Date(now.getTime() + 3 * DAY) },
    },
    take: 300,
    select: { id: true, number: true, totalMinor: true, dueAt: true, patientId: true, org: { select: { name: true } } },
  });

  let sent = 0;

  for (const invoice of invoices) {
    const overdue = invoice.dueAt! < now;

    const result = await notifyPatient(invoice.patientId, {
      type: "PAYMENT_DUE",
      title: overdue ? `Invoice ${invoice.number} is overdue` : `Invoice ${invoice.number} is due soon`,
      body: `${money(invoice.totalMinor)} · ${invoice.org?.name ?? "HealthLocker"} · due ${formatDate(invoice.dueAt!)}`,
      data: { url: "/patient/billing", invoiceId: invoice.id },
      // Keyed by day so an unpaid invoice is chased again tomorrow, not once ever.
      dedupeKey: `invoice:${invoice.id}:${now.toISOString().slice(0, 10)}`,
    });

    if (result && !result.deduped) sent += 1;
  }

  return sent;
}

export async function runStockExpiryAlerts(now = new Date()): Promise<number> {
  const batches = await prisma.stockBatch.findMany({
    where: {
      deletedAt: null,
      quantity: { gt: 0 },
      expiryAt: { lte: new Date(now.getTime() + 30 * DAY) },
      product: { deletedAt: null, isActive: true },
    },
    take: 300,
    select: {
      id: true,
      batchNo: true,
      expiryAt: true,
      quantity: true,
      product: { select: { name: true, orgId: true } },
    },
  });

  if (batches.length === 0) return 0;

  // One lookup of who to tell per tenant, rather than per batch.
  const orgIds = [...new Set(batches.map((batch) => batch.product.orgId))];
  const staff = await prisma.user.findMany({
    where: {
      orgId: { in: orgIds },
      deletedAt: null,
      status: "ACTIVE",
      role: { in: ["PHARMACY_ADMIN", "PHARMACY_STAFF"] },
    },
    select: { id: true, orgId: true },
  });

  const byOrg = new Map<string, string[]>();
  for (const person of staff) {
    if (!person.orgId) continue;
    byOrg.set(person.orgId, [...(byOrg.get(person.orgId) ?? []), person.id]);
  }

  let sent = 0;

  for (const batch of batches) {
    const expired = batch.expiryAt < now;
    const recipients = byOrg.get(batch.product.orgId) ?? [];

    for (const userId of recipients) {
      const result = await notify({
        userId,
        type: "STOCK_EXPIRY",
        title: expired
          ? `${batch.product.name} has expired`
          : `${batch.product.name} expires ${formatDate(batch.expiryAt)}`,
        body: `Batch ${batch.batchNo} · ${batch.quantity} unit(s) remaining.`,
        data: { url: "/pharmacy/inventory", batchId: batch.id },
        dedupeKey: `batch:${batch.id}:${expired ? "expired" : "expiring"}`,
      });

      if (!result.deduped && result.notificationId) sent += 1;
    }
  }

  return sent;
}

/** The whole scheduled pass, in dependency order. */
export async function runAllReminders(now = new Date()): Promise<ReminderRun> {
  // Materialise first: a dose that does not exist yet cannot be reminded about.
  const dosesMaterialised = await materialiseAllDue();

  const [
    medicineReminders,
    appointmentReminders,
    vaccinationReminders,
    paymentReminders,
    stockExpiryAlerts,
  ] = [
    await runMedicineReminders(now),
    await runAppointmentReminders(now),
    await runVaccinationReminders(now),
    await runPaymentReminders(now),
    await runStockExpiryAlerts(now),
  ];

  // Expire last, so a dose is not marked MISSED in the same pass that reminds
  // about it.
  const dosesMissed = await expireOverdueDoses();

  return {
    dosesMaterialised,
    dosesMissed,
    medicineReminders,
    appointmentReminders,
    vaccinationReminders,
    paymentReminders,
    stockExpiryAlerts,
  };
}
