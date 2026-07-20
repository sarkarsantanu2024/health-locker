import type { Role } from "@/shared/enums";

/**
 * The permission catalogue. Authorization is DENY-BY-DEFAULT: a role can do
 * exactly what `ROLE_PERMISSIONS` grants it and nothing more.
 *
 * This file is the source of truth; `prisma/seed.ts` writes it into the
 * Permission / RolePermission tables so an admin UI can inspect it and an audit
 * can prove what a role could do at a point in time.
 */

export const PERMISSIONS = {
  // --- identity -----------------------------------------------------------
  "user:read": { group: "identity", description: "View user accounts" },
  "user:create": { group: "identity", description: "Provision a new user account" },
  "user:update": { group: "identity", description: "Edit a user account" },
  "user:reset-password": { group: "identity", description: "Issue a new temporary password" },
  "user:suspend": { group: "identity", description: "Suspend or reactivate a user" },
  "org:read": { group: "identity", description: "View organization details" },
  "org:manage": { group: "identity", description: "Create or edit organizations" },
  "audit:read": { group: "identity", description: "Read the audit trail" },
  "access-request:read": { group: "identity", description: "View onboarding requests" },
  "access-request:review": { group: "identity", description: "Approve or reject onboarding requests" },

  // --- patient ------------------------------------------------------------
  "patient:read": { group: "patient", description: "View patient profiles" },
  "patient:create": { group: "patient", description: "Register a patient" },
  "patient:update": { group: "patient", description: "Edit a patient profile" },
  "family:read": { group: "patient", description: "View linked family members" },
  "family:manage": { group: "patient", description: "Add or remove family links" },
  "emergency-card:manage": { group: "patient", description: "Issue or revoke an emergency QR" },

  // --- clinical -----------------------------------------------------------
  "appointment:read": { group: "clinical", description: "View appointments" },
  "appointment:manage": { group: "clinical", description: "Book, reschedule or cancel appointments" },
  "encounter:read": { group: "clinical", description: "View consultations" },
  "encounter:manage": { group: "clinical", description: "Record a consultation" },
  "prescription:read": { group: "clinical", description: "View prescriptions" },
  "prescription:create": { group: "clinical", description: "Issue a prescription" },
  "prescription:verify": { group: "clinical", description: "Verify a prescription before dispensing" },
  "medication:manage": { group: "clinical", description: "Manage medicine schedules and reminders" },
  "record:read": { group: "clinical", description: "View health records (allergies, conditions, vitals)" },
  "record:manage": { group: "clinical", description: "Edit health records" },
  "report:read": { group: "clinical", description: "View diagnostic reports" },
  "report:upload": { group: "clinical", description: "Upload a diagnostic report" },
  "report:verify": { group: "clinical", description: "Sign off a diagnostic report" },
  "admission:read": { group: "clinical", description: "View admissions" },
  "admission:manage": { group: "clinical", description: "Admit, transfer or discharge a patient" },

  // --- documents & AI -----------------------------------------------------
  "document:read": { group: "documents", description: "View uploaded documents" },
  "document:upload": { group: "documents", description: "Upload a document" },
  "document:delete": { group: "documents", description: "Delete a document" },
  "ai:run": { group: "documents", description: "Trigger AI processing on a document" },

  // --- billing ------------------------------------------------------------
  "invoice:read": { group: "billing", description: "View invoices" },
  "invoice:manage": { group: "billing", description: "Create and edit invoices" },
  "payment:submit": { group: "billing", description: "Submit a payment reference for verification" },
  "payment:verify": { group: "billing", description: "Approve or reject a submitted payment" },
  "merchant-profile:manage": { group: "billing", description: "Set the UPI/QR/bank collection details" },
  "plan:manage": { group: "billing", description: "Create and edit subscription plans" },
  "subscription:read": { group: "billing", description: "View subscriptions" },
  "subscription:manage": { group: "billing", description: "Activate, extend or cancel a subscription" },
  "expense:manage": { group: "billing", description: "Track personal health expenses" },
  "insurance:manage": { group: "billing", description: "Manage insurance policies" },

  // --- operations ---------------------------------------------------------
  "inventory:read": { group: "ops", description: "View pharmacy inventory" },
  "inventory:manage": { group: "ops", description: "Manage stock, batches and expiry" },
  "order:read": { group: "ops", description: "View pharmacy orders" },
  "order:manage": { group: "ops", description: "Fulfil pharmacy orders" },
  "test-catalog:manage": { group: "ops", description: "Manage the diagnostic test catalogue" },
  "test-booking:manage": { group: "ops", description: "Manage test bookings and sample collection" },
  "analytics:read": { group: "ops", description: "View dashboards and analytics" },
  "notification:manage": { group: "ops", description: "Manage notification preferences and sends" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

// --- role bundles ----------------------------------------------------------
// Composed rather than repeated, so a change to "what a clinic can do" is made
// in one place and inherited by both the staff and admin variants.

const PATIENT_BASE: PermissionKey[] = [
  "patient:read",
  "patient:update",
  "family:read",
  "emergency-card:manage",
  "appointment:read",
  "appointment:manage",
  "encounter:read",
  "prescription:read",
  "medication:manage",
  "record:read",
  "record:manage",
  "report:read",
  "document:read",
  "document:upload",
  "document:delete",
  "ai:run",
  "invoice:read",
  "payment:submit",
  "subscription:read",
  "expense:manage",
  "insurance:manage",
  "notification:manage",
  "order:read",
];

const PROVIDER_STAFF_BASE: PermissionKey[] = [
  "patient:read",
  "patient:create",
  "patient:update",
  "appointment:read",
  "appointment:manage",
  "encounter:read",
  "encounter:manage",
  "prescription:read",
  "record:read",
  "report:read",
  "document:read",
  "document:upload",
  "invoice:read",
  "notification:manage",
];

/** What an org admin adds on top of their staff role, for every provider type. */
const PROVIDER_ADMIN_EXTRAS: PermissionKey[] = [
  "org:read",
  "user:read",
  "user:create",
  "user:update",
  "user:reset-password",
  "user:suspend",
  "invoice:manage",
  "payment:verify",
  "merchant-profile:manage",
  "subscription:read",
  "analytics:read",
  "audit:read",
];

const CLINIC_STAFF: PermissionKey[] = [
  ...PROVIDER_STAFF_BASE,
  "prescription:create",
  "record:manage",
];

const HOSPITAL_STAFF: PermissionKey[] = [
  ...PROVIDER_STAFF_BASE,
  "prescription:create",
  "record:manage",
  "admission:read",
  "admission:manage",
  "report:upload",
];

const DIAGNOSTIC_STAFF: PermissionKey[] = [
  ...PROVIDER_STAFF_BASE,
  "report:upload",
  "test-booking:manage",
];

const PHARMACY_STAFF: PermissionKey[] = [
  ...PROVIDER_STAFF_BASE,
  "prescription:verify",
  "inventory:read",
  "inventory:manage",
  "order:read",
  "order:manage",
];

/** Everything. Only SUPER_ADMIN gets this. */
const ALL: PermissionKey[] = PERMISSION_KEYS;

export const ROLE_PERMISSIONS: Record<Role, readonly PermissionKey[]> = {
  PATIENT: PATIENT_BASE,
  // A family member acts on a linked record; the FamilyLink accessLevel narrows
  // this further at query time — the role alone never grants access to a record.
  FAMILY_MEMBER: PATIENT_BASE.filter((p) => p !== "family:manage"),

  CLINIC_STAFF: CLINIC_STAFF,
  CLINIC_ADMIN: [...CLINIC_STAFF, ...PROVIDER_ADMIN_EXTRAS],

  HOSPITAL_STAFF: HOSPITAL_STAFF,
  HOSPITAL_ADMIN: [...HOSPITAL_STAFF, ...PROVIDER_ADMIN_EXTRAS],

  DIAGNOSTIC_STAFF: DIAGNOSTIC_STAFF,
  DIAGNOSTIC_ADMIN: [...DIAGNOSTIC_STAFF, ...PROVIDER_ADMIN_EXTRAS, "test-catalog:manage", "report:verify"],

  PHARMACY_STAFF: PHARMACY_STAFF,
  PHARMACY_ADMIN: [...PHARMACY_STAFF, ...PROVIDER_ADMIN_EXTRAS],

  // Platform admin runs onboarding and support but cannot mint plans or read
  // every medical record by default — that stays with the Super Admin.
  PLATFORM_ADMIN: [
    "org:read",
    "org:manage",
    "user:read",
    "user:create",
    "user:update",
    "user:reset-password",
    "user:suspend",
    "access-request:read",
    "access-request:review",
    "patient:read",
    "invoice:read",
    "invoice:manage",
    "payment:verify",
    "subscription:read",
    "subscription:manage",
    "merchant-profile:manage",
    "analytics:read",
    "audit:read",
    "notification:manage",
  ],

  SUPER_ADMIN: ALL,
};

/** Deny-by-default check used by the Phase 2 `requirePermission` guard. */
export function roleHasPermission(role: Role, permission: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
