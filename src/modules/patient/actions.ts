"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AppError } from "@/shared/errors";
import {
  getPatientContext,
  requireManageContext,
  setActivePatient,
} from "@/modules/patient/context";
import {
  issueEmergencyCard,
  revokeEmergencyCard,
} from "@/modules/patient/emergency.service";
import { requestErasure, revokeSession } from "@/modules/patient/privacy.service";
import {
  createSchedule,
  deleteSchedule,
  markDose,
  setScheduleStatus,
} from "@/modules/patient/medication.service";
import {
  addFamilyMember,
  recordConsent,
  removeFamilyMember,
  updateProfile,
} from "@/modules/patient/patient.service";
import {
  addExpenseSchema,
  addFamilyMemberSchema,
  createScheduleSchema,
  emergencyCardSchema,
  markDoseSchema,
  removeFamilyMemberSchema,
  scheduleIdSchema,
  scheduleStatusSchema,
  switchPatientSchema,
  updateProfileSchema,
} from "@/shared/schemas/patient";
import { CONSENT_TYPES, type ConsentType } from "@/shared/enums";

/**
 * Patient-side mutations. Every one resolves the acting context first, so a
 * VIEW-only family link can read but never write.
 */

export interface PatientActionState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
}

async function requestMeta() {
  const headerList = await headers();
  return {
    ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent") ?? null,
  };
}

function toState(error: unknown): PatientActionState {
  if (error instanceof AppError) return { ok: false, error: error.message };

  console.error("[patient action] unexpected error", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function switchPatientAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const parsed = switchPatientSchema.safeParse({ patientId: formData.get("patientId") });

  if (!parsed.success) return { ok: false, error: "Choose someone to switch to." };

  try {
    const context = await getPatientContext();

    if (parsed.data.patientId === context.ownPatientId) {
      await setActivePatient(null);
    } else {
      // Prove the link exists before writing the cookie. getPatientContext
      // re-checks on every request too, so this is defence in depth rather than
      // the only gate.
      const link = await prisma.familyLink.findFirst({
        where: {
          ownerId: context.ownPatientId,
          memberId: parsed.data.patientId,
          deletedAt: null,
          confirmedAt: { not: null },
        },
        select: { id: true },
      });

      if (!link) throw new AppError("NOT_FOUND", "Not found.");

      await setActivePatient(parsed.data.patientId);
    }
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient", "layout");
  return { ok: true };
}

export async function updateProfileAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const parsed = updateProfileSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const context = await requireManageContext();
    await updateProfile(context.patientId, parsed.data, context.user.id);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient", "layout");
  return { ok: true, message: "Profile updated." };
}

export async function addFamilyMemberAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const parsed = addFamilyMemberSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const context = await getPatientContext();

    // Family is always managed from your OWN record, never while acting for
    // someone else — otherwise a MANAGE link would let you extend the family
    // graph on another person's behalf.
    if (context.isActingForOther) {
      throw new AppError("FORBIDDEN", "Switch back to your own record to manage family.");
    }

    await addFamilyMember(context.ownPatientId, parsed.data, context.user.id);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient/family");
  return { ok: true, message: "Family member added." };
}

export async function removeFamilyMemberAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const parsed = removeFamilyMemberSchema.safeParse({ linkId: formData.get("linkId") });

  if (!parsed.success) return { ok: false, error: "Could not identify that link." };

  try {
    const context = await getPatientContext();

    if (context.isActingForOther) {
      throw new AppError("FORBIDDEN", "Switch back to your own record to manage family.");
    }

    await removeFamilyMember(context.ownPatientId, parsed.data.linkId, context.user.id);
    // If the removed member was the active context, drop back to own record.
    await setActivePatient(null);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient/family");
  return { ok: true, message: "Family member removed." };
}

export async function issueEmergencyCardAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const parsed = emergencyCardSchema.safeParse({
    includeAllergies: formData.get("includeAllergies") === "on",
    includeConditions: formData.get("includeConditions") === "on",
    includeMedications: formData.get("includeMedications") === "on",
    includeBloodGroup: formData.get("includeBloodGroup") === "on",
  });

  if (!parsed.success) return { ok: false, error: "Choose what to include." };

  try {
    const context = await requireManageContext();
    const meta = await requestMeta();

    // Publishing a shareable card is a disclosure, so it needs its own consent.
    await recordConsent(context.patientId, "EMERGENCY_SHARING", true, {
      source: "emergency-card",
      ...meta,
    });

    await issueEmergencyCard(context.patientId, parsed.data, context.user.id);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient/emergency");
  return { ok: true, message: "New emergency card issued. Previous links no longer work." };
}

export async function revokeEmergencyCardAction(): Promise<PatientActionState> {
  try {
    const context = await requireManageContext();
    const meta = await requestMeta();

    await revokeEmergencyCard(context.patientId, context.user.id);
    await recordConsent(context.patientId, "EMERGENCY_SHARING", false, {
      source: "emergency-card",
      ...meta,
    });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient/emergency");
  return { ok: true, message: "Emergency card revoked." };
}

export async function setConsentAction(
  type: ConsentType,
  granted: boolean,
): Promise<PatientActionState> {
  try {
    const context = await requireManageContext();
    const meta = await requestMeta();

    await recordConsent(context.patientId, type, granted, { source: "settings", ...meta });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient/privacy");
  return { ok: true, message: granted ? "Consent recorded." : "Consent withdrawn." };
}

// --- medicines --------------------------------------------------------------

export async function createScheduleAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const parsed = createScheduleSchema.safeParse({
    drugName: formData.get("drugName"),
    dose: formData.get("dose") ?? "",
    times: formData.getAll("times").map(String).filter(Boolean),
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  try {
    // requireManageContext, not getPatientContext: a VIEW-only family link must
    // not be able to change what someone is told to take.
    const context = await requireManageContext();

    await createSchedule(
      context.patientId,
      {
        drugName: parsed.data.drugName,
        dose: parsed.data.dose ?? null,
        times: parsed.data.times,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate ?? null,
        notes: parsed.data.notes ?? null,
      },
      context.user.id,
    );
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient/medicines");
  return { ok: true, message: "Reminder set." };
}

export async function setScheduleStatusAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const parsed = scheduleStatusSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not update that reminder." };

  try {
    const context = await requireManageContext();
    await setScheduleStatus(parsed.data.scheduleId, context.patientId, parsed.data.status, context.user.id);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient/medicines");
  return { ok: true, message: "Updated." };
}

export async function deleteScheduleAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const parsed = scheduleIdSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not identify that reminder." };

  try {
    const context = await requireManageContext();
    await deleteSchedule(parsed.data.scheduleId, context.patientId, context.user.id);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient/medicines");
  return { ok: true, message: "Removed." };
}

export async function markDoseAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const parsed = markDoseSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not update that dose." };

  try {
    const context = await requireManageContext();
    await markDose(parsed.data.doseId, context.patientId, parsed.data.status, context.user.id);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient/medicines");
  return { ok: true };
}

// --- expenses ---------------------------------------------------------------

export async function addExpenseAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const parsed = addExpenseSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const context = await requireManageContext();

    await prisma.expense.create({
      data: {
        patientId: context.patientId,
        category: parsed.data.category,
        amountMinor: parsed.data.amountMinor,
        incurredAt: parsed.data.incurredAt,
        vendor: parsed.data.vendor ?? null,
        note: parsed.data.note ?? null,
      },
    });

    await audit({
      action: "expense:created",
      entityType: "Expense",
      actorId: context.user.id,
      metadata: { patientId: context.patientId, category: parsed.data.category },
    });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/patient/billing");
  return { ok: true, message: "Expense recorded." };
}

// --- privacy (DPDP) ---------------------------------------------------------

export async function requestErasureAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);

  try {
    // Only for your OWN record. A MANAGE family link lets you look after a
    // relative's care; it does not let you request the destruction of their
    // medical history.
    const context = await getPatientContext();
    const result = await requestErasure(context.ownPatientId, context.user.id, reason || null);

    return {
      ok: true,
      message: result.alreadyRequested
        ? "You already have an erasure request open. We will contact you on the number on your account."
        : "Request received. Someone will contact you to confirm what can be deleted and what we are required to keep.",
    };
  } catch (error) {
    return toState(error);
  }
}

export async function revokeSessionAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");

  if (!sessionId) return { ok: false, error: "Could not identify that session." };

  try {
    const user = await requireUser();
    await revokeSession(user.id, sessionId, user.id);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/account/privacy");
  return { ok: true, message: "That device has been signed out." };
}

/**
 * Form-shaped wrapper for the consent toggles on the privacy screen.
 *
 * Scoped to `ownPatientId`, not the acting context: managing a relative's care
 * is not the same as consenting on their behalf, and a MANAGE link must not be
 * able to withdraw someone else's consent to hold their records.
 */
export async function setConsentFormAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const type = String(formData.get("type") ?? "") as ConsentType;
  const granted = formData.get("granted") === "true";

  if (!CONSENT_TYPES.includes(type)) {
    return { ok: false, error: "That consent type is not recognised." };
  }

  try {
    const context = await getPatientContext();
    const meta = await requestMeta();

    await recordConsent(context.ownPatientId, type, granted, { source: "settings", ...meta });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/account/privacy");
  return { ok: true, message: granted ? "Consent recorded." : "Consent withdrawn." };
}
