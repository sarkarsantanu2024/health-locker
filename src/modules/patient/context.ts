import { cookies } from "next/headers";

import { requireUser, type SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/shared/errors";
import type { FamilyAccessLevel } from "@/shared/enums";

/**
 * "Acting as" — the family context switch.
 *
 * A patient may view or manage a linked family member's record. Which record is
 * active is remembered in a cookie, but the cookie is NEVER trusted: every
 * request re-checks that a FamilyLink still exists and what it permits. A stale
 * or forged cookie therefore degrades to the user's own record rather than
 * granting access.
 */

const ACTIVE_PATIENT_COOKIE = `${env.AUTH_COOKIE_PREFIX}_acting`;

export interface PatientContext {
  user: SessionUser;
  /** The record being viewed. */
  patientId: string;
  patientName: string;
  /** The signed-in user's own record. */
  ownPatientId: string;
  /** True when viewing someone else's record. */
  isActingForOther: boolean;
  /** VIEW blocks every mutation; MANAGE allows them. Own record is always MANAGE. */
  accessLevel: FamilyAccessLevel;
}

async function readActiveCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACTIVE_PATIENT_COOKIE)?.value ?? null;
}

export async function setActivePatient(patientId: string | null): Promise<void> {
  const jar = await cookies();

  if (!patientId) {
    jar.set(ACTIVE_PATIENT_COOKIE, "", { path: "/", maxAge: 0 });
    return;
  }

  jar.set(ACTIVE_PATIENT_COOKIE, patientId, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

/**
 * Resolves whose record the current request is about, and what the caller may do
 * with it. Every patient-side read and write goes through this — it is the only
 * sanctioned way to turn a session into a patientId.
 */
export async function getPatientContext(): Promise<PatientContext> {
  const user = await requireUser();

  const own = await prisma.patient.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: { id: true, fullName: true },
  });

  if (!own) {
    throw new AppError(
      "NOT_FOUND",
      "No patient profile is linked to this account. Ask your administrator to set one up.",
    );
  }

  const requested = await readActiveCookie();

  if (!requested || requested === own.id) {
    return {
      user,
      patientId: own.id,
      patientName: own.fullName,
      ownPatientId: own.id,
      isActingForOther: false,
      accessLevel: "MANAGE",
    };
  }

  // The cookie names someone else — prove the link exists before honouring it.
  const link = await prisma.familyLink.findFirst({
    where: {
      ownerId: own.id,
      memberId: requested,
      deletedAt: null,
      confirmedAt: { not: null },
    },
    select: { accessLevel: true, member: { select: { id: true, fullName: true, deletedAt: true } } },
  });

  if (!link || link.member.deletedAt) {
    // Link revoked or record deleted since the cookie was set: fall back to the
    // caller's own record rather than erroring, so a removed relative does not
    // leave someone staring at an error page.
    return {
      user,
      patientId: own.id,
      patientName: own.fullName,
      ownPatientId: own.id,
      isActingForOther: false,
      accessLevel: "MANAGE",
    };
  }

  return {
    user,
    patientId: link.member.id,
    patientName: link.member.fullName,
    ownPatientId: own.id,
    isActingForOther: true,
    accessLevel: link.accessLevel,
  };
}

/**
 * Context for a WRITE. Refuses when the caller only holds a VIEW link — this is
 * what stops a spouse with read access editing a record.
 */
export async function requireManageContext(): Promise<PatientContext> {
  const context = await getPatientContext();

  if (context.accessLevel !== "MANAGE") {
    throw new AppError(
      "FORBIDDEN",
      `You have view-only access to ${context.patientName}'s record.`,
    );
  }

  return context;
}

/**
 * Asserts the caller may read a specific patient id — for routes that take one
 * in the URL. Never infer access from the id itself.
 */
export async function assertCanReadPatient(patientId: string): Promise<PatientContext> {
  const context = await getPatientContext();

  if (context.patientId === patientId || context.ownPatientId === patientId) return context;

  const link = await prisma.familyLink.findFirst({
    where: {
      ownerId: context.ownPatientId,
      memberId: patientId,
      deletedAt: null,
      confirmedAt: { not: null },
    },
    select: { accessLevel: true, member: { select: { id: true, fullName: true } } },
  });

  // NOT_FOUND rather than FORBIDDEN: confirming the record exists is itself a
  // disclosure.
  if (!link) throw new AppError("NOT_FOUND", "Not found.");

  return {
    ...context,
    patientId: link.member.id,
    patientName: link.member.fullName,
    isActingForOther: link.member.id !== context.ownPatientId,
    accessLevel: link.accessLevel,
  };
}
