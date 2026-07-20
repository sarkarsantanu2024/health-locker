/**
 * Enums shared by Prisma, zod schemas and UI. Prisma mirrors these names exactly
 * (see prisma/schema.prisma) so the two never drift.
 */

export const ROLES = [
  "PATIENT",
  "FAMILY_MEMBER",
  "CLINIC_STAFF",
  "CLINIC_ADMIN",
  "HOSPITAL_STAFF",
  "HOSPITAL_ADMIN",
  "DIAGNOSTIC_STAFF",
  "DIAGNOSTIC_ADMIN",
  "PHARMACY_STAFF",
  "PHARMACY_ADMIN",
  "PLATFORM_ADMIN",
  "SUPER_ADMIN",
] as const;

export type Role = (typeof ROLES)[number];

export const ORG_TYPES = ["CLINIC", "HOSPITAL", "DIAGNOSTIC_CENTRE", "PHARMACY", "PLATFORM"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Portal each role lands in after login. Used by the app shell (Phase 2).
 */
export const PORTAL_BY_ROLE: Record<Role, string> = {
  PATIENT: "/patient",
  FAMILY_MEMBER: "/patient",
  CLINIC_STAFF: "/clinic",
  CLINIC_ADMIN: "/clinic",
  HOSPITAL_STAFF: "/hospital",
  HOSPITAL_ADMIN: "/hospital",
  DIAGNOSTIC_STAFF: "/diagnostic",
  DIAGNOSTIC_ADMIN: "/diagnostic",
  PHARMACY_STAFF: "/pharmacy",
  PHARMACY_ADMIN: "/pharmacy",
  PLATFORM_ADMIN: "/admin",
  SUPER_ADMIN: "/admin",
};
