import { Prisma } from "@prisma/client";

import { audit, auditRead } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { AppError } from "@/shared/errors";
import type { BloodGroup, Gender } from "@/shared/enums";

/**
 * The provider-side patient register, shared by all four provider portals.
 *
 * Tenancy runs through `PatientOrgLink`, never through a column on Patient: a
 * patient legitimately belongs to several providers at once, so an `orgId` on
 * the patient row would make the second provider impossible. Every function here
 * takes an `orgId` that came from `requireTenant()` — never from the request.
 *
 * The consequence worth stating: a provider sees a patient's records *because
 * a link exists*, and revoking the link revokes the access without touching a
 * single medical row.
 */

export interface RegisterPatientInput {
  fullName: string;
  phone?: string | null;
  dateOfBirth?: Date | null;
  gender?: Gender;
  bloodGroup?: BloodGroup;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  notes?: string | null;
  /** Link an existing patient instead of creating a duplicate record. */
  existingPatientId?: string | null;
}

export interface PatientListItem {
  id: string;
  fullName: string;
  phone: string | null;
  mrn: string | null;
  gender: Gender;
  dateOfBirth: string | null;
  lastSeenAt: string | null;
  linkedAt: string;
}

/**
 * Search within the tenant's own register.
 *
 * Deliberately NOT a global patient search. Being able to type a phone number
 * and find any patient on the platform would turn every receptionist into a
 * directory of who is being treated where.
 */
export async function searchPatients(
  orgId: string,
  query: string,
  options: { take?: number } = {},
): Promise<PatientListItem[]> {
  const trimmed = query.trim();

  const links = await prisma.patientOrgLink.findMany({
    where: {
      orgId,
      deletedAt: null,
      patient: {
        deletedAt: null,
        ...(trimmed
          ? {
              OR: [
                { fullName: { contains: trimmed, mode: Prisma.QueryMode.insensitive } },
                { phone: { contains: trimmed } },
              ],
            }
          : {}),
      },
      ...(trimmed ? {} : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.take ?? 50, 200),
    select: {
      mrn: true,
      createdAt: true,
      patient: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          gender: true,
          dateOfBirth: true,
          encounters: {
            where: { orgId, deletedAt: null },
            orderBy: { occurredAt: "desc" },
            take: 1,
            select: { occurredAt: true },
          },
        },
      },
    },
  });

  // MRN is also a legitimate thing to search by, and it lives on the link.
  const byMrn = trimmed
    ? await prisma.patientOrgLink.findMany({
        where: { orgId, deletedAt: null, mrn: { contains: trimmed, mode: Prisma.QueryMode.insensitive } },
        take: 20,
        select: {
          mrn: true,
          createdAt: true,
          patient: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              gender: true,
              dateOfBirth: true,
              encounters: {
                where: { orgId, deletedAt: null },
                orderBy: { occurredAt: "desc" },
                take: 1,
                select: { occurredAt: true },
              },
            },
          },
        },
      })
    : [];

  const merged = [...links, ...byMrn];
  const seen = new Set<string>();

  return merged
    .filter((link) => {
      if (seen.has(link.patient.id)) return false;
      seen.add(link.patient.id);
      return true;
    })
    .map((link) => ({
      id: link.patient.id,
      fullName: link.patient.fullName,
      phone: link.patient.phone,
      mrn: link.mrn,
      gender: link.patient.gender,
      dateOfBirth: link.patient.dateOfBirth?.toISOString() ?? null,
      lastSeenAt: link.patient.encounters[0]?.occurredAt.toISOString() ?? null,
      linkedAt: link.createdAt.toISOString(),
    }));
}

/**
 * Asserts the patient is registered with this tenant and returns them.
 *
 * NOT_FOUND rather than FORBIDDEN when the link is missing — confirming that a
 * patient exists at another provider is itself a disclosure.
 */
export async function requirePatientOfOrg(orgId: string, patientId: string) {
  const link = await prisma.patientOrgLink.findFirst({
    where: { orgId, patientId, deletedAt: null, patient: { deletedAt: null } },
    select: {
      mrn: true,
      patient: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          gender: true,
          bloodGroup: true,
          dateOfBirth: true,
          addressLine: true,
          city: true,
          state: true,
          pincode: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          notes: true,
          userId: true,
        },
      },
    },
  });

  if (!link) throw new AppError("NOT_FOUND", "Not found.");

  return { ...link.patient, mrn: link.mrn };
}

/** Next file number for this tenant. Human-facing, so sequential, not a cuid. */
async function nextMrn(orgId: string): Promise<string> {
  const count = await prisma.patientOrgLink.count({ where: { orgId } });

  // The count can collide under concurrency; the caller retries on the unique
  // constraint rather than taking a lock for something this cheap.
  return `MRN${String(count + 1).padStart(5, "0")}`;
}

export async function registerPatient(
  orgId: string,
  input: RegisterPatientInput,
  actorId: string,
): Promise<{ patientId: string; mrn: string; linkedExisting: boolean }> {
  let patientId = input.existingPatientId ?? null;
  let linkedExisting = false;

  if (patientId) {
    const existing = await prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true },
    });

    if (!existing) throw new AppError("NOT_FOUND", "That patient record no longer exists.");

    const alreadyLinked = await prisma.patientOrgLink.findFirst({
      where: { orgId, patientId, deletedAt: null },
      select: { mrn: true },
    });

    if (alreadyLinked) {
      return { patientId, mrn: alreadyLinked.mrn ?? "", linkedExisting: true };
    }

    linkedExisting = true;
  } else {
    const patient = await prisma.patient.create({
      data: {
        fullName: input.fullName,
        phone: input.phone ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? "UNDISCLOSED",
        bloodGroup: input.bloodGroup ?? "UNKNOWN",
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        pincode: input.pincode ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });

    patientId = patient.id;
  }

  let mrn = await nextMrn(orgId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await prisma.patientOrgLink.create({ data: { orgId, patientId, mrn } });
      break;
    } catch (error) {
      const conflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

      if (!conflict || attempt === 4) throw error;

      // Someone else took that number between the count and the insert.
      mrn = `MRN${String(Number(mrn.slice(3)) + 1).padStart(5, "0")}`;
    }
  }

  // Registering someone at a provider is consent-relevant: the tenant can now
  // read that person's records, so it is recorded as a sharing grant.
  await prisma.consentRecord.create({
    data: {
      patientId,
      type: "PROVIDER_SHARING",
      version: "v1-provider-registration",
      granted: true,
      orgId,
      source: linkedExisting ? "provider-linked-existing" : "provider-registration",
    },
  });

  await audit({
    action: linkedExisting ? "patient:linked" : "patient:registered",
    entityType: "Patient",
    entityId: patientId,
    actorId,
    orgId,
    metadata: { mrn, linkedExisting },
  });

  return { patientId, mrn, linkedExisting };
}

/**
 * Finds patients already on the platform who look like the one being registered,
 * so a walk-in is linked rather than duplicated. Matched on phone only: name
 * matching across a whole platform would leak "someone called X exists".
 */
export async function findLinkCandidates(orgId: string, phone: string) {
  if (!phone || phone.replace(/\D/g, "").length < 10) return [];

  const patients = await prisma.patient.findMany({
    where: {
      deletedAt: null,
      phone: { contains: phone.replace(/\D/g, "").slice(-10) },
      // Already registered here — nothing to link.
      orgLinks: { none: { orgId, deletedAt: null } },
    },
    take: 5,
    select: { id: true, fullName: true, phone: true, dateOfBirth: true, gender: true },
  });

  return patients.map((patient) => ({
    id: patient.id,
    fullName: patient.fullName,
    phone: patient.phone,
    dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
    gender: patient.gender,
  }));
}

/**
 * The clinical summary a provider sees when they open a patient. Reading it is
 * an access to a medical record, so it is audited — that is a compliance
 * requirement, not an optional extra.
 */
export async function patientClinicalSummary(orgId: string, patientId: string, actorId: string) {
  const patient = await requirePatientOfOrg(orgId, patientId);

  const [allergies, conditions, encounters, prescriptions, reports, vitals, appointments, admissions, invoices] =
    await Promise.all([
      prisma.allergy.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { severity: "desc" },
        select: { id: true, substance: true, reaction: true, severity: true },
      }),
      prisma.condition.findMany({
        where: { patientId, deletedAt: null, status: { in: ["ACTIVE", "IN_REMISSION"] } },
        orderBy: { diagnosedAt: "desc" },
        select: { id: true, name: true, status: true, diagnosedAt: true },
      }),
      prisma.encounter.findMany({
        // Scoped to this tenant: a clinic does not get to read a hospital's notes.
        where: { patientId, orgId, deletedAt: null },
        orderBy: { occurredAt: "desc" },
        take: 10,
        select: {
          id: true,
          occurredAt: true,
          type: true,
          chiefComplaint: true,
          diagnosis: true,
          practitioner: { select: { fullName: true } },
        },
      }),
      prisma.prescription.findMany({
        where: { patientId, orgId, deletedAt: null },
        orderBy: { issuedAt: "desc" },
        take: 10,
        select: {
          id: true,
          issuedAt: true,
          practitioner: { select: { fullName: true } },
          items: { where: { deletedAt: null }, select: { drugName: true, dose: true, frequency: true } },
        },
      }),
      prisma.diagnosticReport.findMany({
        where: { patientId, deletedAt: null, status: "PUBLISHED" },
        orderBy: { reportedAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          reportedAt: true,
          org: { select: { name: true } },
          findings: { where: { flag: { in: ["HIGH", "LOW", "CRITICAL"] } }, select: { label: true, value: true, flag: true } },
        },
      }),
      prisma.vitalReading.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { recordedAt: "desc" },
        take: 12,
        select: { id: true, type: true, value: true, unit: true, recordedAt: true },
      }),
      prisma.appointment.findMany({
        where: { patientId, orgId, deletedAt: null, scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: "asc" },
        take: 5,
        select: { id: true, scheduledAt: true, status: true, reason: true },
      }),
      prisma.admission.findMany({
        where: { patientId, orgId, deletedAt: null },
        orderBy: { admittedAt: "desc" },
        take: 5,
        select: { id: true, admittedAt: true, dischargedAt: true, status: true, wardName: true, bedNo: true },
      }),
      prisma.invoice.findMany({
        where: { patientId, orgId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, number: true, status: true, totalMinor: true, issuedAt: true },
      }),
    ]);

  await auditRead({
    action: "patient.record.viewed",
    entityType: "Patient",
    entityId: patientId,
    actorId,
    orgId,
  });

  return { patient, allergies, conditions, encounters, prescriptions, reports, vitals, appointments, admissions, invoices };
}

/** Practitioners of this tenant, for the "seen by" picker. */
export async function listPractitioners(orgId: string) {
  return prisma.practitioner.findMany({
    where: { orgId, deletedAt: null, isActive: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, specialization: true, departmentId: true },
  });
}
