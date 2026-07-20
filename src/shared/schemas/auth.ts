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
 * Passwords a human chooses. 8 characters is the NIST SP 800-63B minimum.
 *
 * Deliberately permissive beyond that. NIST advises against composition rules
 * (symbol/digit/case classes) — they push people toward `Password1!` and a
 * sticky note without adding real entropy. The actual defence against guessing
 * is the 5-attempt account lockout plus the IP throttle in auth.service.ts.
 *
 * The blocklist is an EXACT match on a handful of passwords that appear at the
 * top of every breach corpus. It was previously a prefix match, which wrongly
 * rejected reasonable passwords like "passwordless-vault-2026".
 */
const BANNED_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "iloveyou",
  "abc12345",
  "welcome1",
  "welcome123",
  "admin123",
  "letmein1",
  "healthlocker",
]);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .refine(
    (value) => !BANNED_PASSWORDS.has(value.toLowerCase()),
    "That password appears in known breach lists — please pick another",
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
  // Only the exact case rejected: "password must not CONTAIN your username" was
  // too strict for ordinary users, who reasonably build a password around a
  // memorable word that happens to be their name.
  .refine((data) => data.password.toLowerCase() !== data.username.toLowerCase(), {
    message: "Your password cannot be the same as your username",
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
