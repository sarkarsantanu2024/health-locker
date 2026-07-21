import { audit, auditRead } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { decryptNullable, maskIdentifier } from "@/lib/crypto";
import { AppError } from "@/shared/errors";

/**
 * DPDP / GDPR rights, self-service.
 *
 * Three of the four data-principal rights are implemented here:
 *
 *  - **Access / portability** — `exportPatientData` returns everything held
 *    about one person as JSON, decrypted, in a form they can keep.
 *  - **Withdrawal of consent** — lives in `patient.service.ts` (`recordConsent`).
 *  - **Erasure** — `requestErasure` files the request and audits it.
 *
 * Erasure is deliberately *not* self-service. Indian medical-records retention
 * obligations outlast a person's wish to be forgotten, and a patient who deletes
 * their own record also deletes the clinic's evidence of what it prescribed. A
 * human has to reconcile those before anything is destroyed, so the button files
 * a request rather than dropping rows.
 */

export interface ErasureRequest {
  id: string;
  requestedAt: string;
  reason: string | null;
}

/**
 * Everything held about one patient, decrypted, as plain JSON.
 *
 * Provider-authored clinical notes are included: they are that person's health
 * data regardless of who typed them. What is excluded is anything that would
 * disclose someone *else* — other patients on the same invoice, the identity of
 * staff beyond their display name, and the raw share tokens of emergency cards
 * (which are credentials, and printing them into an export the person may email
 * to themselves would leak them).
 */
export async function exportPatientData(patientId: string, actorId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      phone: true,
      abhaIdEnc: true,
      addressLine: true,
      city: true,
      state: true,
      pincode: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      heightCm: true,
      notes: true,
      createdAt: true,
    },
  });

  if (!patient) throw new AppError("NOT_FOUND", "Not found.");

  const [
    allergies,
    conditions,
    vitals,
    vaccinations,
    prescriptions,
    reports,
    encounters,
    admissions,
    schedules,
    invoices,
    expenses,
    policies,
    consents,
    orgLinks,
    emergencyCards,
    documents,
  ] = await Promise.all([
    prisma.allergy.findMany({ where: { patientId, deletedAt: null } }),
    prisma.condition.findMany({ where: { patientId, deletedAt: null } }),
    prisma.vitalReading.findMany({ where: { patientId, deletedAt: null } }),
    prisma.vaccination.findMany({ where: { patientId, deletedAt: null } }),
    prisma.prescription.findMany({
      where: { patientId, deletedAt: null },
      include: { items: { where: { deletedAt: null } }, org: { select: { name: true } } },
    }),
    prisma.diagnosticReport.findMany({
      where: { patientId, deletedAt: null },
      include: { findings: true, org: { select: { name: true } } },
    }),
    prisma.encounter.findMany({
      where: { patientId, deletedAt: null },
      include: {
        org: { select: { name: true } },
        practitioner: { select: { fullName: true } },
      },
    }),
    prisma.admission.findMany({
      where: { patientId, deletedAt: null },
      include: { operationNotes: { where: { deletedAt: null } }, org: { select: { name: true } } },
    }),
    prisma.medicationSchedule.findMany({ where: { patientId, deletedAt: null } }),
    prisma.invoice.findMany({
      where: { patientId, deletedAt: null },
      include: { items: true, org: { select: { name: true } } },
    }),
    prisma.expense.findMany({ where: { patientId, deletedAt: null } }),
    prisma.insurancePolicy.findMany({ where: { patientId, deletedAt: null } }),
    prisma.consentRecord.findMany({ where: { patientId } }),
    prisma.patientOrgLink.findMany({
      where: { patientId, deletedAt: null },
      include: { org: { select: { name: true, type: true, city: true } } },
    }),
    prisma.emergencyCard.findMany({
      where: { patientId, deletedAt: null },
      // shareToken is deliberately absent: it is a credential.
      select: { id: true, isActive: true, expiresAt: true, viewCount: true, createdAt: true },
    }),
    prisma.document.findMany({
      where: { patientId, deletedAt: null },
      select: { id: true, kind: true, fileName: true, mimeType: true, createdAt: true },
    }),
  ]);

  await auditRead({
    action: "patient.data_exported",
    entityType: "Patient",
    entityId: patientId,
    actorId,
    metadata: { format: "json" },
  });

  return {
    exportedAt: new Date().toISOString(),
    notice:
      "This is every record HealthLocker holds about you. Encrypted identifiers are decrypted here; " +
      "share tokens for your emergency card are deliberately excluded because they are credentials.",
    patient: {
      ...patient,
      // Decrypted for the person it belongs to — that is the point of an export.
      abhaId: decryptNullable(patient.abhaIdEnc),
      abhaIdEnc: undefined,
    },
    registeredWith: orgLinks.map((link) => ({
      organisation: link.org.name,
      type: link.org.type,
      city: link.org.city,
      fileNumber: link.mrn,
      since: link.createdAt,
    })),
    allergies,
    conditions,
    vitals,
    vaccinations,
    prescriptions,
    reports,
    encounters,
    admissions,
    medicationSchedules: schedules,
    invoices,
    expenses,
    insurancePolicies: policies.map((policy) => ({
      ...policy,
      policyNo: decryptNullable(policy.policyNoEnc),
      policyNoEnc: undefined,
    })),
    consents,
    emergencyCards,
    documents,
  };
}

/**
 * Files an erasure request. Idempotent: asking twice does not queue two.
 *
 * There is no `ErasureRequest` table — this rides on `AccessRequest`, which is
 * already the queue a Super Admin works through, so the request appears where
 * someone is actually looking rather than in a table nobody opens.
 */
export async function requestErasure(
  patientId: string,
  actorId: string,
  reason: string | null,
): Promise<{ alreadyRequested: boolean }> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: { id: true, fullName: true, phone: true },
  });

  if (!patient) throw new AppError("NOT_FOUND", "Not found.");

  const existing = await prisma.accessRequest.findFirst({
    where: {
      deletedAt: null,
      status: "PENDING",
      note: { startsWith: `ERASURE:${patientId}` },
    },
    select: { id: true },
  });

  if (existing) return { alreadyRequested: true };

  await prisma.accessRequest.create({
    data: {
      fullName: patient.fullName,
      phone: patient.phone ?? "not provided",
      note: `ERASURE:${patientId} — ${reason ?? "no reason given"}`,
      status: "PENDING",
    },
  });

  await audit({
    action: "patient.erasure_requested",
    entityType: "Patient",
    entityId: patientId,
    actorId,
    metadata: { reason },
  });

  return { alreadyRequested: false };
}

/**
 * Every device currently signed in as this user, so someone can see and cut off
 * a session they do not recognise. Only a hash of the refresh token is stored,
 * so there is nothing sensitive to show — the point is the device and the time.
 */
export async function listSessions(userId: string, currentSessionId: string) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
  });

  return sessions.map((session) => ({
    id: session.id,
    isCurrent: session.id === currentSessionId,
    device: describeUserAgent(session.userAgent),
    // Partially masked: a full IP in the UI is more precise than it is useful,
    // and it is itself a location identifier.
    ip: session.ip ? maskIdentifier(session.ip, 6) : null,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  }));
}

export async function revokeSession(
  userId: string,
  sessionId: string,
  actorId: string,
): Promise<void> {
  // Scoped by userId in the WHERE: a session id from a form cannot be used to
  // sign somebody else out.
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) throw new AppError("NOT_FOUND", "Not found.");

  await audit({
    action: "session.revoked",
    entityType: "Session",
    entityId: sessionId,
    actorId,
  });
}

/** Enough to recognise your own phone, without pretending to fingerprint. */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";

  const os = /iphone|ipad/i.test(userAgent)
    ? "iPhone or iPad"
    : /android/i.test(userAgent)
      ? "Android"
      : /macintosh|mac os/i.test(userAgent)
        ? "Mac"
        : /windows/i.test(userAgent)
          ? "Windows"
          : /linux/i.test(userAgent)
            ? "Linux"
            : "Unknown device";

  const browser = /edg\//i.test(userAgent)
    ? "Edge"
    : /chrome|crios/i.test(userAgent)
      ? "Chrome"
      : /firefox|fxios/i.test(userAgent)
        ? "Firefox"
        : /safari/i.test(userAgent)
          ? "Safari"
          : null;

  return browser ? `${os} · ${browser}` : os;
}
