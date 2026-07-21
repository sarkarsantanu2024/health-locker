import { z } from "zod";

import { PAYMENT_METHODS } from "@/shared/enums";

export const refCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^HL[A-Z0-9]{4,20}$/, "Check the reference code");

export const submitPaymentSchema = z.object({
  refCode: refCodeSchema,
  utr: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9]{6,32}$/,
          "Enter the transaction / UTR reference exactly as your bank shows it",
        ),
    ),
  method: z.enum(PAYMENT_METHODS).default("UPI"),
  paidAt: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => !d || !Number.isNaN(d.getTime()), "Enter a valid date"),
  /** Only present once R2 uploads exist (Phase 4). */
  proofDocumentId: z.string().optional().or(z.literal("")),
  /** For a payer with no account yet. */
  submitterPhone: z
    .string()
    .trim()
    .regex(/^(?:\+?91)?[6-9]\d{9}$/, "Enter a valid mobile number")
    .optional()
    .or(z.literal("")),
});
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;

export const reviewPaymentSchema = z.object({
  submissionId: z.string().min(1),
  note: z.string().trim().max(280).optional().or(z.literal("")),
});

export const rejectPaymentSchema = reviewPaymentSchema.extend({
  // A rejection without a reason leaves the payer with nothing to act on.
  note: z.string().trim().min(3, "Say why, so the payer can fix it").max(280),
});

export const startSubscriptionSchema = z.object({
  planId: z.string().min(1, "Choose a plan"),
});
