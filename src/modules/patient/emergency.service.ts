import { randomBytes } from "node:crypto";

import QRCode from "qrcode";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/shared/errors";
import { BLOOD_GROUP_LABELS, type BloodGroup } from "@/shared/enums";

/**
 * Emergency card: a read-only, scoped snapshot behind an unguessable link,
 * printed as a QR code.
 *
 * Three properties matter and are enforced here rather than in the UI:
 *   1. READ-ONLY — the public route only ever reads, and this module exposes no
 *      way to mutate anything through a token.
 *   2. SCOPED — only the sections the patient opted into, and only the
 *      currently-relevant subset. Never the full history.
 *   3. REVOCABLE — rotating the token invalidates every printed copy.
 */

export interface EmergencyCardView {
  fullName: string;
  bloodGroup: string | null;
  dateOfBirth: Date | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  allergies: Array<{ substance: string; reaction: string | null; severity: string }>;
  conditions: Array<{ name: string; status: string }>;
  medications: Array<{ drugName: string; dose: string | null }>;
  updatedAt: Date;
}

/** 32 hex chars — 128 bits, far beyond guessing, and still fits a small QR. */
function generateShareToken(): string {
  return randomBytes(16).toString("hex");
}

export async function issueEmergencyCard(
  patientId: string,
  options: {
    includeAllergies?: boolean;
    includeConditions?: boolean;
    includeMedications?: boolean;
    includeBloodGroup?: boolean;
    expiresAt?: Date | null;
  },
  actorId: string,
): Promise<{ shareToken: string; url: string }> {
  const shareToken = generateShareToken();

  // One active card per patient: re-issuing revokes the previous token, which is
  // what makes a lost printout recoverable.
  await prisma.emergencyCard.updateMany({
    where: { patientId, isActive: true },
    data: { isActive: false },
  });

  const card = await prisma.emergencyCard.create({
    data: {
      patientId,
      shareToken,
      includeAllergies: options.includeAllergies ?? true,
      includeConditions: options.includeConditions ?? true,
      includeMedications: options.includeMedications ?? true,
      includeBloodGroup: options.includeBloodGroup ?? true,
      expiresAt: options.expiresAt ?? null,
      isActive: true,
    },
    select: { id: true },
  });

  await audit({
    action: "emergency_card.issued",
    entityType: "EmergencyCard",
    entityId: card.id,
    actorId,
    // The token is a credential — it is never written to the audit trail.
    metadata: { patientId, sections: options },
  });

  return { shareToken, url: emergencyUrl(shareToken) };
}

export async function revokeEmergencyCard(patientId: string, actorId: string): Promise<void> {
  const result = await prisma.emergencyCard.updateMany({
    where: { patientId, isActive: true },
    data: { isActive: false },
  });

  if (result.count === 0) throw new AppError("NOT_FOUND", "There is no active emergency card.");

  await audit({
    action: "emergency_card.revoked",
    entityType: "EmergencyCard",
    entityId: patientId,
    actorId,
    metadata: { patientId },
  });
}

export function emergencyUrl(shareToken: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/emergency/${shareToken}`;
}

/** QR as an inline SVG string, so nothing has to be uploaded or fetched. */
export async function emergencyQrSvg(shareToken: string): Promise<string> {
  return QRCode.toString(emergencyUrl(shareToken), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });
}

export async function getActiveCard(patientId: string) {
  return prisma.emergencyCard.findFirst({
    where: { patientId, isActive: true, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      shareToken: true,
      includeAllergies: true,
      includeConditions: true,
      includeMedications: true,
      includeBloodGroup: true,
      expiresAt: true,
      viewCount: true,
      lastViewedAt: true,
      createdAt: true,
    },
  });
}

/**
 * Resolves a public token to the card's contents. Called by the unauthenticated
 * /emergency/[token] route, so it is deliberately narrow: it returns only the
 * opted-in sections and nothing that could identify an account.
 *
 * Returns null for an unknown, revoked or expired token — the caller shows the
 * same "not available" page either way, so a token cannot be probed for validity.
 */
export async function resolveEmergencyCard(token: string): Promise<EmergencyCardView | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;

  const card = await prisma.emergencyCard.findFirst({
    where: { shareToken: token, isActive: true, deletedAt: null },
    select: {
      id: true,
      expiresAt: true,
      includeAllergies: true,
      includeConditions: true,
      includeMedications: true,
      includeBloodGroup: true,
      patient: {
        select: {
          id: true,
          fullName: true,
          dateOfBirth: true,
          bloodGroup: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!card || card.patient.deletedAt) return null;
  if (card.expiresAt && card.expiresAt < new Date()) return null;

  const patientId = card.patient.id;

  const [allergies, conditions, medications] = await Promise.all([
    card.includeAllergies
      ? prisma.allergy.findMany({
          where: { patientId, deletedAt: null },
          orderBy: { severity: "desc" },
          take: 20,
          select: { substance: true, reaction: true, severity: true },
        })
      : [],
    card.includeConditions
      ? prisma.condition.findMany({
          // Only ACTIVE: a resolved condition is history, not something a
          // first responder needs, and sharing it is unnecessary exposure.
          where: { patientId, deletedAt: null, status: "ACTIVE" },
          orderBy: { diagnosedAt: "desc" },
          take: 20,
          select: { name: true, status: true },
        })
      : [],
    card.includeMedications
      ? prisma.medicationSchedule.findMany({
          where: { patientId, deletedAt: null, status: "ACTIVE" },
          orderBy: { startDate: "desc" },
          take: 20,
          select: { drugName: true, dose: true },
        })
      : [],
  ]);

  // Access to an emergency card is logged. It is a read of a medical record by
  // an anonymous party, which is exactly the kind of access that must be
  // auditable after the fact.
  await Promise.all([
    prisma.emergencyCard.update({
      where: { id: card.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    }),
    audit({
      action: "emergency_card.viewed",
      entityType: "EmergencyCard",
      entityId: card.id,
      metadata: { patientId },
    }),
  ]);

  return {
    fullName: card.patient.fullName,
    bloodGroup: card.includeBloodGroup
      ? BLOOD_GROUP_LABELS[card.patient.bloodGroup as BloodGroup]
      : null,
    dateOfBirth: card.patient.dateOfBirth,
    emergencyContactName: card.patient.emergencyContactName,
    emergencyContactPhone: card.patient.emergencyContactPhone,
    allergies,
    conditions,
    medications,
    updatedAt: new Date(),
  };
}
