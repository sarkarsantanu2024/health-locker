"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

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
import {
  addFamilyMember,
  recordConsent,
  removeFamilyMember,
  updateProfile,
} from "@/modules/patient/patient.service";
import {
  addFamilyMemberSchema,
  emergencyCardSchema,
  removeFamilyMemberSchema,
  switchPatientSchema,
  updateProfileSchema,
} from "@/shared/schemas/patient";
import type { ConsentType } from "@prisma/client";

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
