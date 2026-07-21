import { Prisma } from "@prisma/client";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { notifyPatient } from "@/modules/notify/notify.service";
import { requirePatientOfOrg } from "@/modules/provider/patients.service";
import { AppError } from "@/shared/errors";
import type { AdmissionStatus } from "@/shared/enums";

/**
 * Inpatient care: departments, admissions, transfers, discharge and operation
 * notes.
 *
 * The rule that shapes this module: **an admission is never deleted and never
 * silently edited**. A transfer keeps the same admission and changes the ward; a
 * discharge sets `dischargedAt` and a summary. The stay is a continuous clinical
 * record, and a hospital that can rewrite one has no defensible history.
 */

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function listDepartments(orgId: string) {
  return prisma.department.findMany({
    where: { orgId, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      _count: { select: { practitioners: true, admissions: true } },
    },
  });
}

export async function createDepartment(
  orgId: string,
  input: { name: string; code?: string | null },
  actorId: string,
): Promise<{ id: string }> {
  try {
    const department = await prisma.department.create({
      data: { orgId, name: input.name, code: input.code ?? null },
      select: { id: true },
    });

    await audit({
      action: "department:created",
      entityType: "Department",
      entityId: department.id,
      actorId,
      orgId,
      metadata: { name: input.name },
    });

    return department;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "A department with that name already exists.", {
        field: "name",
      });
    }
    throw error;
  }
}

export async function deleteDepartment(
  orgId: string,
  departmentId: string,
  actorId: string,
): Promise<void> {
  const inUse = await prisma.admission.count({
    where: { departmentId, orgId, deletedAt: null, status: "ADMITTED" },
  });

  if (inUse > 0) {
    throw new AppError("CONFLICT", "That department still has admitted patients.");
  }

  const result = await prisma.department.updateMany({
    where: { id: departmentId, orgId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) throw new AppError("NOT_FOUND", "Not found.");

  await audit({
    action: "department:deleted",
    entityType: "Department",
    entityId: departmentId,
    actorId,
    orgId,
  });
}

// ---------------------------------------------------------------------------
// Admissions
// ---------------------------------------------------------------------------

export interface AdmitInput {
  patientId: string;
  departmentId?: string | null;
  practitionerId?: string | null;
  wardName?: string | null;
  bedNo?: string | null;
  admissionReason?: string | null;
  admittedAt?: Date;
}

export async function admitPatient(
  orgId: string,
  input: AdmitInput,
  actorId: string,
): Promise<{ id: string }> {
  await requirePatientOfOrg(orgId, input.patientId);

  // Two open admissions for one patient at one hospital is always a mistake —
  // usually a second person admitting someone already on a ward.
  const open = await prisma.admission.findFirst({
    where: { orgId, patientId: input.patientId, deletedAt: null, status: "ADMITTED" },
    select: { id: true },
  });

  if (open) {
    throw new AppError("CONFLICT", "This patient is already admitted here.");
  }

  if (input.bedNo) {
    const occupied = await prisma.admission.findFirst({
      where: {
        orgId,
        deletedAt: null,
        status: "ADMITTED",
        bedNo: input.bedNo,
        ...(input.wardName ? { wardName: input.wardName } : {}),
      },
      select: { id: true },
    });

    if (occupied) {
      throw new AppError("CONFLICT", "That bed is already occupied.", { field: "bedNo" });
    }
  }

  const admission = await prisma.admission.create({
    data: {
      orgId,
      patientId: input.patientId,
      departmentId: input.departmentId ?? null,
      practitionerId: input.practitionerId ?? null,
      wardName: input.wardName ?? null,
      bedNo: input.bedNo ?? null,
      admissionReason: input.admissionReason ?? null,
      admittedAt: input.admittedAt ?? new Date(),
      status: "ADMITTED",
    },
    select: { id: true },
  });

  await audit({
    action: "admission:created",
    entityType: "Admission",
    entityId: admission.id,
    actorId,
    orgId,
    metadata: { patientId: input.patientId, ward: input.wardName, bed: input.bedNo },
  });

  return admission;
}

export async function transferAdmission(
  orgId: string,
  admissionId: string,
  input: { departmentId?: string | null; wardName?: string | null; bedNo?: string | null },
  actorId: string,
): Promise<void> {
  const admission = await prisma.admission.findFirst({
    where: { id: admissionId, orgId, deletedAt: null, status: "ADMITTED" },
    select: { id: true, wardName: true, bedNo: true, departmentId: true },
  });

  if (!admission) throw new AppError("NOT_FOUND", "Not found.");

  await prisma.admission.update({
    where: { id: admissionId },
    data: {
      departmentId: input.departmentId ?? admission.departmentId,
      wardName: input.wardName ?? admission.wardName,
      bedNo: input.bedNo ?? admission.bedNo,
    },
  });

  // The audit row carries both sides, because "where was this patient on
  // Tuesday" is answerable only from the trail once the column is overwritten.
  await audit({
    action: "admission:transferred",
    entityType: "Admission",
    entityId: admissionId,
    actorId,
    orgId,
    metadata: {
      from: { ward: admission.wardName, bed: admission.bedNo, departmentId: admission.departmentId },
      to: { ward: input.wardName, bed: input.bedNo, departmentId: input.departmentId },
    },
  });
}

export async function dischargeAdmission(
  orgId: string,
  admissionId: string,
  input: { dischargeSummary: string; status?: Extract<AdmissionStatus, "DISCHARGED" | "DECEASED"> },
  actorId: string,
): Promise<void> {
  const admission = await prisma.admission.findFirst({
    where: { id: admissionId, orgId, deletedAt: null, status: "ADMITTED" },
    select: { id: true, patientId: true, admittedAt: true },
  });

  if (!admission) throw new AppError("NOT_FOUND", "Not found.");

  await prisma.admission.update({
    where: { id: admissionId },
    data: {
      status: input.status ?? "DISCHARGED",
      dischargedAt: new Date(),
      dischargeSummary: input.dischargeSummary,
    },
  });

  await audit({
    action: "admission:discharged",
    entityType: "Admission",
    entityId: admissionId,
    actorId,
    orgId,
    metadata: { patientId: admission.patientId, status: input.status ?? "DISCHARGED" },
  });

  // Not sent for a death: an automated "your stay has ended" push to the
  // deceased person's account would be indefensible.
  if ((input.status ?? "DISCHARGED") === "DISCHARGED") {
    await notifyPatient(admission.patientId, {
      type: "ACCOUNT_NOTICE",
      title: "Discharge summary available",
      body: `Your stay from ${formatDate(admission.admittedAt)} has been closed and the summary is in your timeline.`,
      data: { url: "/patient/timeline?kinds=visit", admissionId },
      dedupeKey: `discharge:${admissionId}`,
    });
  }
}

export async function listAdmissions(
  orgId: string,
  filters: { status?: AdmissionStatus; departmentId?: string } = {},
) {
  return prisma.admission.findMany({
    where: {
      orgId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    },
    orderBy: [{ status: "asc" }, { admittedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      admittedAt: true,
      dischargedAt: true,
      status: true,
      wardName: true,
      bedNo: true,
      admissionReason: true,
      patientId: true,
      patient: { select: { fullName: true, phone: true } },
      department: { select: { name: true } },
      practitioner: { select: { fullName: true } },
      _count: { select: { operationNotes: true } },
    },
  });
}

export async function getAdmission(orgId: string, admissionId: string) {
  const admission = await prisma.admission.findFirst({
    where: { id: admissionId, orgId, deletedAt: null },
    select: {
      id: true,
      admittedAt: true,
      dischargedAt: true,
      status: true,
      wardName: true,
      bedNo: true,
      admissionReason: true,
      dischargeSummary: true,
      patientId: true,
      patient: { select: { fullName: true, phone: true, dateOfBirth: true, gender: true } },
      department: { select: { id: true, name: true } },
      practitioner: { select: { fullName: true } },
      operationNotes: {
        where: { deletedAt: null },
        orderBy: { performedAt: "desc" },
        select: {
          id: true,
          procedure: true,
          performedAt: true,
          surgeonName: true,
          anaesthesia: true,
          findings: true,
          notes: true,
        },
      },
      invoices: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, totalMinor: true },
      },
    },
  });

  if (!admission) throw new AppError("NOT_FOUND", "Not found.");

  return admission;
}

export async function addOperationNote(
  orgId: string,
  admissionId: string,
  input: {
    procedure: string;
    performedAt?: Date;
    surgeonName?: string | null;
    anaesthesia?: string | null;
    findings?: string | null;
    notes?: string | null;
  },
  actorId: string,
): Promise<void> {
  const admission = await prisma.admission.findFirst({
    where: { id: admissionId, orgId, deletedAt: null },
    select: { id: true },
  });

  if (!admission) throw new AppError("NOT_FOUND", "Not found.");

  const note = await prisma.operationNote.create({
    data: {
      admissionId,
      procedure: input.procedure,
      performedAt: input.performedAt ?? new Date(),
      surgeonName: input.surgeonName ?? null,
      anaesthesia: input.anaesthesia ?? null,
      findings: input.findings ?? null,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });

  await audit({
    action: "operation-note:created",
    entityType: "OperationNote",
    entityId: note.id,
    actorId,
    orgId,
    metadata: { admissionId, procedure: input.procedure },
  });
}

/** Ward occupancy for the hospital dashboard. */
export async function occupancySummary(orgId: string) {
  const [admitted, dischargedToday, byDepartment] = await Promise.all([
    prisma.admission.count({ where: { orgId, deletedAt: null, status: "ADMITTED" } }),
    prisma.admission.count({
      where: {
        orgId,
        deletedAt: null,
        dischargedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.admission.groupBy({
      by: ["departmentId"],
      where: { orgId, deletedAt: null, status: "ADMITTED" },
      _count: true,
    }),
  ]);

  return { admitted, dischargedToday, departments: byDepartment.length };
}
