import { z } from "zod";

import { BLOOD_GROUPS, GENDERS, RELATIONSHIPS, FAMILY_ACCESS_LEVELS } from "@/shared/enums";
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
