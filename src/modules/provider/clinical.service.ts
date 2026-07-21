import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { dayRange, formatDate, formatTime } from "@/lib/format";
import { notifyPatient } from "@/modules/notify/notify.service";
import { schedulesFromPrescription } from "@/modules/patient/medication.service";
import { requirePatientOfOrg } from "@/modules/provider/patients.service";
import { AppError } from "@/shared/errors";
import type {
  AppointmentStatus,
  ConditionStatus,
  EncounterType,
  Severity,
  VitalType,
} from "@/shared/enums";

/**
 * The clinical workflow shared by the clinic and hospital consoles:
 * appointment → encounter → prescription, plus the record edits (vitals,
 * conditions, allergies) that happen during a visit.
 *
 * Every function takes an `orgId` from `requireTenant()`. Rows are read back
 * with the orgId in the WHERE rather than loaded-then-checked, so a stray id
 * from a form finds nothing instead of finding someone else's patient.
 */

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export interface AppointmentListItem {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: AppointmentStatus;
  type: EncounterType;
  reason: string | null;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  practitionerName: string | null;
  encounterId: string | null;
}

export async function listAppointments(
  orgId: string,
  filters: { day?: Date; status?: AppointmentStatus; practitionerId?: string; patientId?: string } = {},
): Promise<AppointmentListItem[]> {
  const range = filters.day ? dayRange(filters.day) : null;

  const appointments = await prisma.appointment.findMany({
    where: {
      orgId,
      deletedAt: null,
      ...(range ? { scheduledAt: { gte: range.start, lt: range.end } } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.practitionerId ? { practitionerId: filters.practitionerId } : {}),
      ...(filters.patientId ? { patientId: filters.patientId } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    take: 200,
    select: {
      id: true,
      scheduledAt: true,
      durationMin: true,
      status: true,
      type: true,
      reason: true,
      patientId: true,
      patient: { select: { fullName: true, phone: true } },
      practitioner: { select: { fullName: true } },
      encounter: { select: { id: true } },
    },
  });

  return appointments.map((appointment) => ({
    id: appointment.id,
    scheduledAt: appointment.scheduledAt.toISOString(),
    durationMin: appointment.durationMin,
    status: appointment.status,
    type: appointment.type,
    reason: appointment.reason,
    patientId: appointment.patientId,
    patientName: appointment.patient.fullName,
    patientPhone: appointment.patient.phone,
    practitionerName: appointment.practitioner?.fullName ?? null,
    encounterId: appointment.encounter?.id ?? null,
  }));
}

export interface BookAppointmentInput {
  patientId: string;
  practitionerId?: string | null;
  scheduledAt: Date;
  durationMin?: number;
  type?: EncounterType;
  reason?: string | null;
}

export async function bookAppointment(
  orgId: string,
  input: BookAppointmentInput,
  actorId: string,
): Promise<{ id: string }> {
  // Proves the patient is registered here before anything is written.
  const patient = await requirePatientOfOrg(orgId, input.patientId);

  if (input.practitionerId) {
    const practitioner = await prisma.practitioner.findFirst({
      where: { id: input.practitionerId, orgId, deletedAt: null },
      select: { id: true },
    });

    if (!practitioner) throw new AppError("NOT_FOUND", "That practitioner is not in your team.");
  }

  if (input.scheduledAt.getTime() < Date.now() - 60 * 60 * 1000) {
    throw new AppError("VALIDATION_FAILED", "That time is in the past.", { field: "scheduledAt" });
  }

  const appointment = await prisma.appointment.create({
    data: {
      orgId,
      patientId: input.patientId,
      practitionerId: input.practitionerId ?? null,
      scheduledAt: input.scheduledAt,
      durationMin: input.durationMin ?? 15,
      type: input.type ?? "OPD",
      reason: input.reason ?? null,
      status: "SCHEDULED",
    },
    select: { id: true },
  });

  await audit({
    action: "appointment:booked",
    entityType: "Appointment",
    entityId: appointment.id,
    actorId,
    orgId,
    metadata: { patientId: input.patientId, scheduledAt: input.scheduledAt.toISOString() },
  });

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });

  await notifyPatient(input.patientId, {
    type: "APPOINTMENT_REMINDER",
    title: "Appointment booked",
    body: `${org?.name ?? "Your provider"} on ${formatDate(input.scheduledAt)} at ${formatTime(input.scheduledAt)}.`,
    data: { url: "/patient/timeline?kinds=visit", appointmentId: appointment.id },
    dedupeKey: `appointment-booked:${appointment.id}`,
  });

  void patient;
  return { id: appointment.id };
}

export async function setAppointmentStatus(
  orgId: string,
  appointmentId: string,
  status: AppointmentStatus,
  actorId: string,
  cancelledReason?: string,
): Promise<void> {
  const result = await prisma.appointment.updateMany({
    where: { id: appointmentId, orgId, deletedAt: null },
    data: {
      status,
      ...(status === "CANCELLED" ? { cancelledReason: cancelledReason ?? null } : {}),
    },
  });

  if (result.count === 0) throw new AppError("NOT_FOUND", "Not found.");

  await audit({
    action: "appointment:status-changed",
    entityType: "Appointment",
    entityId: appointmentId,
    actorId,
    orgId,
    metadata: { status, cancelledReason },
  });
}

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------

export interface RecordEncounterInput {
  patientId: string;
  appointmentId?: string | null;
  practitionerId?: string | null;
  type?: EncounterType;
  occurredAt?: Date;
  chiefComplaint?: string | null;
  examination?: string | null;
  diagnosis?: string | null;
  advice?: string | null;
  followUpAt?: Date | null;
}

export async function recordEncounter(
  orgId: string,
  input: RecordEncounterInput,
  actorId: string,
): Promise<{ id: string }> {
  await requirePatientOfOrg(orgId, input.patientId);

  if (input.appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: input.appointmentId, orgId, deletedAt: null },
      select: { id: true, encounter: { select: { id: true } } },
    });

    if (!appointment) throw new AppError("NOT_FOUND", "Not found.");
    if (appointment.encounter) {
      throw new AppError("CONFLICT", "This appointment already has a consultation recorded.");
    }
  }

  const encounter = await prisma.encounter.create({
    data: {
      orgId,
      patientId: input.patientId,
      appointmentId: input.appointmentId ?? null,
      practitionerId: input.practitionerId ?? null,
      type: input.type ?? "OPD",
      occurredAt: input.occurredAt ?? new Date(),
      chiefComplaint: input.chiefComplaint ?? null,
      examination: input.examination ?? null,
      diagnosis: input.diagnosis ?? null,
      advice: input.advice ?? null,
      followUpAt: input.followUpAt ?? null,
    },
    select: { id: true },
  });

  // Recording the consultation is what closes the appointment — leaving it
  // "scheduled" is the single most common source of a wrong day-list.
  if (input.appointmentId) {
    await prisma.appointment.update({
      where: { id: input.appointmentId },
      data: { status: "COMPLETED" },
    });
  }

  await audit({
    action: "encounter:recorded",
    entityType: "Encounter",
    entityId: encounter.id,
    actorId,
    orgId,
    metadata: { patientId: input.patientId, hasDiagnosis: Boolean(input.diagnosis) },
  });

  return { id: encounter.id };
}

export async function getEncounter(orgId: string, encounterId: string) {
  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, orgId, deletedAt: null },
    select: {
      id: true,
      occurredAt: true,
      type: true,
      chiefComplaint: true,
      examination: true,
      diagnosis: true,
      advice: true,
      followUpAt: true,
      patientId: true,
      patient: { select: { fullName: true, phone: true, dateOfBirth: true, gender: true } },
      practitioner: { select: { id: true, fullName: true, qualification: true, registrationNo: true } },
      prescriptions: {
        where: { deletedAt: null },
        select: {
          id: true,
          issuedAt: true,
          notes: true,
          items: {
            where: { deletedAt: null },
            select: { id: true, drugName: true, dose: true, frequency: true, duration: true, instructions: true },
          },
        },
      },
      invoices: { where: { deletedAt: null }, select: { id: true, number: true, status: true, totalMinor: true } },
    },
  });

  if (!encounter) throw new AppError("NOT_FOUND", "Not found.");

  return encounter;
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

export interface PrescriptionItemInput {
  drugName: string;
  dose?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
}

export async function issuePrescription(
  orgId: string,
  input: {
    patientId: string;
    encounterId?: string | null;
    practitionerId?: string | null;
    notes?: string | null;
    items: PrescriptionItemInput[];
  },
  actorId: string,
): Promise<{ id: string; schedulesCreated: number }> {
  await requirePatientOfOrg(orgId, input.patientId);

  if (input.items.length === 0) {
    throw new AppError("VALIDATION_FAILED", "Add at least one medicine.", { field: "items" });
  }

  if (input.encounterId) {
    const encounter = await prisma.encounter.findFirst({
      where: { id: input.encounterId, orgId, deletedAt: null },
      select: { id: true },
    });

    if (!encounter) throw new AppError("NOT_FOUND", "Not found.");
  }

  const prescription = await prisma.prescription.create({
    data: {
      orgId,
      patientId: input.patientId,
      encounterId: input.encounterId ?? null,
      practitionerId: input.practitionerId ?? null,
      issuedAt: new Date(),
      notes: input.notes ?? null,
      items: {
        create: input.items.map((item) => ({
          drugName: item.drugName,
          dose: item.dose ?? null,
          frequency: item.frequency ?? null,
          duration: item.duration ?? null,
          instructions: item.instructions ?? null,
          // A human typed these, so there is no AI confidence and they are
          // confirmed from the moment they are written.
          confirmedAt: new Date(),
          confirmedById: actorId,
        })),
      },
    },
    select: { id: true },
  });

  // Turn the drug lines into reminder schedules so the patient does not have to
  // retype what the doctor just wrote.
  const schedulesCreated = await schedulesFromPrescription(prescription.id, actorId);

  await audit({
    action: "prescription:issued",
    entityType: "Prescription",
    entityId: prescription.id,
    actorId,
    orgId,
    metadata: { patientId: input.patientId, drugCount: input.items.length, schedulesCreated },
  });

  await notifyPatient(input.patientId, {
    type: "MEDICINE_REMINDER",
    title: "New prescription added",
    body: `${input.items.length} medicine(s) were added to your record. Check the times and adjust if needed.`,
    data: { url: "/patient/medicines", prescriptionId: prescription.id },
    dedupeKey: `prescription:${prescription.id}`,
  });

  return { id: prescription.id, schedulesCreated };
}

export async function listPrescriptions(orgId: string, filters: { patientId?: string } = {}) {
  return prisma.prescription.findMany({
    where: { orgId, deletedAt: null, ...(filters.patientId ? { patientId: filters.patientId } : {}) },
    orderBy: { issuedAt: "desc" },
    take: 100,
    select: {
      id: true,
      issuedAt: true,
      notes: true,
      patientId: true,
      patient: { select: { fullName: true } },
      practitioner: { select: { fullName: true } },
      items: { where: { deletedAt: null }, select: { drugName: true, dose: true, frequency: true, duration: true } },
    },
  });
}

export async function getPrescriptionForPrint(orgId: string, prescriptionId: string, actorId: string) {
  const prescription = await prisma.prescription.findFirst({
    where: { id: prescriptionId, orgId, deletedAt: null },
    select: {
      id: true,
      issuedAt: true,
      notes: true,
      patient: {
        select: { id: true, fullName: true, dateOfBirth: true, gender: true, phone: true },
      },
      practitioner: { select: { fullName: true, qualification: true, registrationNo: true, specialization: true } },
      org: { select: { name: true, addressLine: true, city: true, phone: true, licenceNo: true } },
      items: {
        where: { deletedAt: null },
        select: { id: true, drugName: true, dose: true, frequency: true, duration: true, instructions: true },
      },
    },
  });

  if (!prescription) throw new AppError("NOT_FOUND", "Not found.");

  await audit({
    action: "prescription.printed",
    entityType: "Prescription",
    entityId: prescriptionId,
    actorId,
    orgId,
  });

  return prescription;
}

// ---------------------------------------------------------------------------
// Record edits made during a visit
// ---------------------------------------------------------------------------

export async function addVital(
  orgId: string,
  input: { patientId: string; type: VitalType; value: string; unit?: string | null; recordedAt?: Date },
  actorId: string,
): Promise<void> {
  await requirePatientOfOrg(orgId, input.patientId);

  await prisma.vitalReading.create({
    data: {
      patientId: input.patientId,
      type: input.type,
      value: input.value,
      unit: input.unit ?? null,
      recordedAt: input.recordedAt ?? new Date(),
    },
  });

  await audit({
    action: "vital:recorded",
    entityType: "VitalReading",
    actorId,
    orgId,
    metadata: { patientId: input.patientId, type: input.type },
  });
}

export async function addAllergy(
  orgId: string,
  input: { patientId: string; substance: string; reaction?: string | null; severity?: Severity },
  actorId: string,
): Promise<void> {
  await requirePatientOfOrg(orgId, input.patientId);

  await prisma.allergy.create({
    data: {
      patientId: input.patientId,
      substance: input.substance,
      reaction: input.reaction ?? null,
      severity: input.severity ?? "MEDIUM",
    },
  });

  await audit({
    action: "allergy:recorded",
    entityType: "Allergy",
    actorId,
    orgId,
    metadata: { patientId: input.patientId, substance: input.substance },
  });
}

export async function addCondition(
  orgId: string,
  input: {
    patientId: string;
    name: string;
    code?: string | null;
    status?: ConditionStatus;
    diagnosedAt?: Date | null;
    notes?: string | null;
  },
  actorId: string,
): Promise<void> {
  await requirePatientOfOrg(orgId, input.patientId);

  await prisma.condition.create({
    data: {
      patientId: input.patientId,
      name: input.name,
      code: input.code ?? null,
      status: input.status ?? "ACTIVE",
      diagnosedAt: input.diagnosedAt ?? new Date(),
      notes: input.notes ?? null,
    },
  });

  await audit({
    action: "condition:recorded",
    entityType: "Condition",
    actorId,
    orgId,
    metadata: { patientId: input.patientId, name: input.name },
  });
}

export async function addVaccination(
  orgId: string,
  input: {
    patientId: string;
    vaccineName: string;
    doseNumber?: number | null;
    administeredAt?: Date | null;
    nextDueAt?: Date | null;
    batchNo?: string | null;
  },
  actorId: string,
): Promise<void> {
  await requirePatientOfOrg(orgId, input.patientId);

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });

  await prisma.vaccination.create({
    data: {
      patientId: input.patientId,
      vaccineName: input.vaccineName,
      doseNumber: input.doseNumber ?? null,
      administeredAt: input.administeredAt ?? new Date(),
      nextDueAt: input.nextDueAt ?? null,
      administeredBy: org?.name ?? null,
      batchNo: input.batchNo ?? null,
    },
  });

  await audit({
    action: "vaccination:recorded",
    entityType: "Vaccination",
    actorId,
    orgId,
    metadata: { patientId: input.patientId, vaccineName: input.vaccineName },
  });
}

// ---------------------------------------------------------------------------
// Dashboard counts
// ---------------------------------------------------------------------------

export async function providerDashboard(orgId: string) {
  const today = dayRange();

  const [todayAppointments, checkedIn, patients, openInvoices, recentEncounters] = await Promise.all([
    prisma.appointment.count({
      where: {
        orgId,
        deletedAt: null,
        scheduledAt: { gte: today.start, lt: today.end },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
    }),
    prisma.appointment.count({
      where: { orgId, deletedAt: null, status: { in: ["CHECKED_IN", "IN_PROGRESS"] } },
    }),
    prisma.patientOrgLink.count({ where: { orgId, deletedAt: null } }),
    prisma.invoice.aggregate({
      where: { orgId, deletedAt: null, status: { in: ["ISSUED", "OVERDUE"] } },
      _sum: { totalMinor: true },
      _count: true,
    }),
    prisma.encounter.count({
      where: { orgId, deletedAt: null, occurredAt: { gte: today.start, lt: today.end } },
    }),
  ]);

  return {
    todayAppointments,
    checkedIn,
    patients,
    outstandingMinor: openInvoices._sum.totalMinor ?? 0,
    outstandingCount: openInvoices._count,
    encountersToday: recentEncounters,
  };
}
