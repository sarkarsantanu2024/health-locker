import { audit, auditRead } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { AppError } from "@/shared/errors";
import type { ConsentType } from "@prisma/client";
import type { AddFamilyMemberInput, UpdateProfileInput } from "@/shared/schemas/patient";

/**
 * Patient profile, family graph and consent.
 *
 * Every function takes an already-authorised `patientId` — resolving a session
 * into a patient is context.ts's job, and mixing the two is how tenancy bugs
 * happen.
 */

export async function getProfile(patientId: string, actorId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      phone: true,
      addressLine: true,
      city: true,
      state: true,
      pincode: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      heightCm: true,
      userId: true,
    },
  });

  if (!patient) throw new AppError("NOT_FOUND", "Not found.");

  // Reading a medical record is itself an auditable event.
  await auditRead({ entityType: "Patient", entityId: patientId, actorId });

  return patient;
}

export async function updateProfile(
  patientId: string,
  input: UpdateProfileInput,
  actorId: string,
): Promise<void> {
  await prisma.patient.update({
    where: { id: patientId },
    data: {
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth ?? null,
      gender: input.gender,
      bloodGroup: input.bloodGroup,
      phone: input.phone ?? null,
      addressLine: input.addressLine ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      emergencyContactName: input.emergencyContactName ?? null,
      emergencyContactPhone: input.emergencyContactPhone ?? null,
      heightCm: input.heightCm ?? null,
    },
  });

  await audit({
    action: "patient.updated",
    entityType: "Patient",
    entityId: patientId,
    actorId,
    metadata: { fields: Object.keys(input) },
  });
}

export async function listFamily(ownerPatientId: string) {
  return prisma.familyLink.findMany({
    where: { ownerId: ownerPatientId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      relationship: true,
      accessLevel: true,
      confirmedAt: true,
      member: {
        select: { id: true, fullName: true, dateOfBirth: true, bloodGroup: true, userId: true },
      },
    },
  });
}

/**
 * Creates a dependent's record and links it. Used for children and elderly
 * parents who will never have their own login — which is why `Patient` was made
 * separable from `User` in Phase 1.
 */
export async function addFamilyMember(
  ownerPatientId: string,
  input: AddFamilyMemberInput,
  actorId: string,
): Promise<string> {
  const existing = await prisma.familyLink.count({
    where: { ownerId: ownerPatientId, deletedAt: null },
  });

  // Guard-rail against runaway creation; the real per-plan cap arrives with the
  // Phase 6 entitlement guard.
  if (existing >= 15) {
    throw new AppError("BAD_REQUEST", "You have reached the maximum number of family members.");
  }

  const link = await prisma.$transaction(async (tx) => {
    const member = await tx.patient.create({
      data: {
        fullName: input.fullName,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender,
        bloodGroup: input.bloodGroup,
        phone: input.phone ?? null,
      },
      select: { id: true },
    });

    return tx.familyLink.create({
      data: {
        ownerId: ownerPatientId,
        memberId: member.id,
        relationship: input.relationship,
        accessLevel: input.accessLevel,
        // The owner created this record, so there is nobody else to accept it.
        confirmedAt: new Date(),
      },
      select: { id: true, memberId: true },
    });
  });

  await audit({
    action: "family_link.created",
    entityType: "FamilyLink",
    entityId: link.id,
    actorId,
    metadata: { ownerPatientId, memberId: link.memberId, relationship: input.relationship },
  });

  return link.memberId;
}

/**
 * Removes the LINK, not the record. Soft-deleting the person's health data
 * because a relationship ended would be destroying medical history.
 */
export async function removeFamilyMember(
  ownerPatientId: string,
  linkId: string,
  actorId: string,
): Promise<void> {
  const link = await prisma.familyLink.findFirst({
    where: { id: linkId, ownerId: ownerPatientId, deletedAt: null },
    select: { id: true, memberId: true },
  });

  if (!link) throw new AppError("NOT_FOUND", "Not found.");

  await prisma.familyLink.update({ where: { id: link.id }, data: { deletedAt: new Date() } });

  await audit({
    action: "family_link.removed",
    entityType: "FamilyLink",
    entityId: link.id,
    actorId,
    metadata: { ownerPatientId, memberId: link.memberId },
  });
}

// --- consent (DPDP) --------------------------------------------------------

/** Bump when the wording of a notice changes — old consent no longer applies. */
export const CONSENT_VERSION = "2026-07-v1";

export async function recordConsent(
  patientId: string,
  type: ConsentType,
  granted: boolean,
  context: { source: string; orgId?: string | null; ip?: string | null; userAgent?: string | null },
): Promise<void> {
  if (granted) {
    await prisma.consentRecord.create({
      data: {
        patientId,
        type,
        version: CONSENT_VERSION,
        granted: true,
        orgId: context.orgId ?? null,
        source: context.source,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  } else {
    // Withdrawal marks the existing grant revoked. The row survives, because
    // "was there consent when this record was created?" must stay answerable.
    await prisma.consentRecord.updateMany({
      where: { patientId, type, revokedAt: null, ...(context.orgId ? { orgId: context.orgId } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  await audit({
    action: granted ? "consent.granted" : "consent.withdrawn",
    entityType: "ConsentRecord",
    entityId: patientId,
    metadata: { type, version: CONSENT_VERSION, source: context.source },
  });
}

export async function hasConsent(patientId: string, type: ConsentType): Promise<boolean> {
  const record = await prisma.consentRecord.findFirst({
    where: { patientId, type, granted: true, revokedAt: null, version: CONSENT_VERSION },
    select: { id: true },
  });

  return Boolean(record);
}

export async function listConsents(patientId: string) {
  return prisma.consentRecord.findMany({
    where: { patientId },
    orderBy: { grantedAt: "desc" },
    select: {
      id: true,
      type: true,
      version: true,
      granted: true,
      grantedAt: true,
      revokedAt: true,
      source: true,
    },
  });
}
