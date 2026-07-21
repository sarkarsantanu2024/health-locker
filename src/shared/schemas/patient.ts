import { z } from "zod";

import {
  BLOOD_GROUPS,
  EXPENSE_CATEGORIES,
  FAMILY_ACCESS_LEVELS,
  GENDERS,
  RELATIONSHIPS,
} from "@/shared/enums";
import { phoneSchema } from "@/shared/schemas/auth";
import { TIMELINE_KINDS } from "@/modules/patient/timeline.service";

/** Optional free-text field: empty string is treated as "not provided". */
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => v || undefined);

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter a name").max(120),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => !d || (!Number.isNaN(d.getTime()) && d <= new Date()), {
      message: "Enter a valid date that is not in the future",
    }),
  gender: z.enum(GENDERS).default("UNDISCLOSED"),
  bloodGroup: z.enum(BLOOD_GROUPS).default("UNKNOWN"),
  phone: phoneSchema.optional().or(z.literal("")).transform((v) => v || undefined),
  addressLine: optionalText(200),
  city: optionalText(80),
  state: optionalText(80),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: phoneSchema.optional().or(z.literal("")).transform((v) => v || undefined),
  heightCm: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : undefined))
    .refine((n) => n === undefined || (Number.isFinite(n) && n > 30 && n < 260), {
      message: "Enter a height in centimetres",
    }),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const addFamilyMemberSchema = z.object({
  fullName: z.string().trim().min(2, "Enter their name").max(120),
  relationship: z.enum(RELATIONSHIPS),
  accessLevel: z.enum(FAMILY_ACCESS_LEVELS).default("MANAGE"),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? new Date(v) : undefined)),
  gender: z.enum(GENDERS).default("UNDISCLOSED"),
  bloodGroup: z.enum(BLOOD_GROUPS).default("UNKNOWN"),
  phone: phoneSchema.optional().or(z.literal("")).transform((v) => v || undefined),
});
export type AddFamilyMemberInput = z.infer<typeof addFamilyMemberSchema>;

export const switchPatientSchema = z.object({
  patientId: z.string().min(1),
});

export const removeFamilyMemberSchema = z.object({
  linkId: z.string().min(1),
});

export const emergencyCardSchema = z.object({
  includeAllergies: z.coerce.boolean().default(true),
  includeConditions: z.coerce.boolean().default(true),
  includeMedications: z.coerce.boolean().default(true),
  includeBloodGroup: z.coerce.boolean().default(true),
});

export const timelineFilterSchema = z.object({
  kinds: z.array(z.enum(TIMELINE_KINDS)).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  query: z.string().trim().max(120).optional(),
});

// --- medicines --------------------------------------------------------------

export const createScheduleSchema = z.object({
  drugName: z.string().trim().min(2, "Name the medicine").max(160),
  dose: z.string().trim().max(80).optional().or(z.literal("")).transform((v) => v || undefined),
  // Times arrive as repeated `times` fields; a schedule with none is meaningless.
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1, "Pick at least one time"),
  startDate: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? new Date(v) : new Date()))
    .refine((d) => !Number.isNaN(d.getTime()), "Enter a valid date"),
  endDate: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => d === undefined || !Number.isNaN(d.getTime()), "Enter a valid date"),
  notes: z.string().trim().max(300).optional().or(z.literal("")).transform((v) => v || undefined),
});

export const scheduleStatusSchema = z.object({
  scheduleId: z.string().min(1),
  status: z.enum(["ACTIVE", "PAUSED", "STOPPED"]),
});

export const scheduleIdSchema = z.object({ scheduleId: z.string().min(1) });

export const markDoseSchema = z.object({
  doseId: z.string().min(1),
  status: z.enum(["TAKEN", "SKIPPED"]),
});

// --- expenses ---------------------------------------------------------------

export const addExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).default("OTHER"),
  amountMinor: z
    .string()
    .trim()
    .min(1, "Enter an amount")
    .transform((v) => Math.round(Number(v.replace(/[,\s₹]/g, "")) * 100))
    .refine((n) => Number.isFinite(n) && n > 0, "Enter an amount like 450 or 450.50"),
  incurredAt: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? new Date(v) : new Date()))
    .refine((d) => !Number.isNaN(d.getTime()), "Enter a valid date"),
  vendor: z.string().trim().max(120).optional().or(z.literal("")).transform((v) => v || undefined),
  note: z.string().trim().max(300).optional().or(z.literal("")).transform((v) => v || undefined),
});
