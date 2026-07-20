import { z } from "zod";

import { ROLES } from "@/shared/enums";

/**
 * Input contracts for authentication and provisioning. Every route handler and
 * server action validates against these — they are the single source of truth
 * for both runtime validation and the inferred TypeScript types.
 */

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[a-z0-9._-]+$/, "Use only letters, numbers, dot, underscore or hyphen");

/**
 * Policy for passwords a human chooses. Length is the dominant factor, so we ask
 * for 12+ and screen the obvious garbage rather than demanding symbol classes,
 * which pushes people toward `Password1!` and a sticky note.
 */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((value) => !/^\s|\s$/.test(value), "Password cannot start or end with a space")
  .refine(
    (value) => !/^(?:password|welcome|healthlocker|qwerty|12345678)/i.test(value),
    "Choose something less guessable",
  );

export const loginSchema = z.object({
  username: usernameSchema,
  // Not `passwordSchema`: an existing password must be accepted as-is, whatever
  // policy was in force when it was set. Validating it here would leak policy.
  password: z.string().min(1, "Password is required").max(128),
  totp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code")
    .optional()
    .or(z.literal("")),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const enrollTotpSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});
export type EnrollTotpInput = z.infer<typeof enrollTotpSchema>;

export const disableTotpSchema = z.object({
  password: z.string().min(1, "Confirm with your password").max(128),
});

// --- consumer self-registration --------------------------------------------

/**
 * Indian mobile numbers, optionally with a +91 country code. Used for WhatsApp
 * contact, which is how an operator reaches the person — so it is mandatory and
 * validated more strictly than a provider-entered phone.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-()]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^(?:\+?91)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  );

/**
 * Public signup. PATIENT accounts only — a self-registered provider could claim
 * a tenant that is not theirs, so provider staff stay admin-provisioned.
 *
 * The resulting account is created PENDING_ACTIVATION and cannot sign in until a
 * Super Admin verifies the manual payment.
 */
export const signupSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    phone: phoneSchema,
    addressLine: z.string().trim().min(5, "Enter your address").max(200),
    city: z.string().trim().min(2, "Enter your city").max(80),
    state: z.string().trim().min(2, "Enter your state").max(80),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code"),
    planId: z.string().trim().min(1, "Choose a plan"),
    consent: z.literal(true, {
      errorMap: () => ({ message: "You must agree before we can store your health records" }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => !data.password.toLowerCase().includes(data.username.toLowerCase()), {
    message: "Password must not contain your username",
    path: ["password"],
  });
export type SignupInput = z.infer<typeof signupSchema>;

// --- admin provisioning ----------------------------------------------------

export const createUserSchema = z.object({
  displayName: z.string().trim().min(2, "Name is required").max(120),
  role: z.enum(ROLES),
  /// Required for provider roles, forbidden for patient and platform roles —
  /// enforced in the service, which knows the role→org-type mapping.
  orgId: z.string().cuid().optional().or(z.literal("")),
  /// Optional: an admin may dictate the username instead of accepting the
  /// suggestion. Uniqueness is checked against the database, not here.
  username: usernameSchema.optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 -]{7,20}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  planId: z.string().optional().or(z.literal("")),
  accessRequestId: z.string().optional().or(z.literal("")),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().max(280).optional().or(z.literal("")),
});

export const setUserActiveSchema = z.object({
  userId: z.string().min(1),
  active: z.boolean(),
  reason: z.string().trim().max(280).optional().or(z.literal("")),
});
