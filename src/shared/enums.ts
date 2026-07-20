/**
 * Enums shared by Prisma, zod schemas and UI. `prisma/schema.prisma` mirrors
 * these names exactly, so a rename here is a migration there.
 */

// ---------------------------------------------------------------------------
// Identity & tenancy
// ---------------------------------------------------------------------------

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

/** Roles that administer the platform itself rather than a provider tenant. */
export const PLATFORM_ROLES: readonly Role[] = ["PLATFORM_ADMIN", "SUPER_ADMIN"];

/** Roles that belong to a patient rather than an organization. */
export const CONSUMER_ROLES: readonly Role[] = ["PATIENT", "FAMILY_MEMBER"];

export const ORG_TYPE_BY_ROLE: Partial<Record<Role, OrgType>> = {
  CLINIC_STAFF: "CLINIC",
  CLINIC_ADMIN: "CLINIC",
  HOSPITAL_STAFF: "HOSPITAL",
  HOSPITAL_ADMIN: "HOSPITAL",
  DIAGNOSTIC_STAFF: "DIAGNOSTIC_CENTRE",
  DIAGNOSTIC_ADMIN: "DIAGNOSTIC_CENTRE",
  PHARMACY_STAFF: "PHARMACY",
  PHARMACY_ADMIN: "PHARMACY",
  PLATFORM_ADMIN: "PLATFORM",
  SUPER_ADMIN: "PLATFORM",
};

/** Portal each role lands in after login. Used by the app shell (Phase 2). */
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

// ---------------------------------------------------------------------------
// Patient & family
// ---------------------------------------------------------------------------

export const GENDERS = ["MALE", "FEMALE", "OTHER", "UNDISCLOSED"] as const;
export type Gender = (typeof GENDERS)[number];

export const BLOOD_GROUPS = [
  "A_POS",
  "A_NEG",
  "B_POS",
  "B_NEG",
  "AB_POS",
  "AB_NEG",
  "O_POS",
  "O_NEG",
  "UNKNOWN",
] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const BLOOD_GROUP_LABELS: Record<BloodGroup, string> = {
  A_POS: "A+",
  A_NEG: "A−",
  B_POS: "B+",
  B_NEG: "B−",
  AB_POS: "AB+",
  AB_NEG: "AB−",
  O_POS: "O+",
  O_NEG: "O−",
  UNKNOWN: "Unknown",
};

export const RELATIONSHIPS = [
  "SELF",
  "SPOUSE",
  "CHILD",
  "PARENT",
  "SIBLING",
  "GRANDPARENT",
  "GRANDCHILD",
  "GUARDIAN",
  "OTHER",
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

/**
 * What a family member may do with another member's record. Deliberately coarse:
 * fine-grained sharing is a permission concern, not a data-model one.
 */
export const FAMILY_ACCESS_LEVELS = ["VIEW", "MANAGE"] as const;
export type FamilyAccessLevel = (typeof FAMILY_ACCESS_LEVELS)[number];

// ---------------------------------------------------------------------------
// Clinical
// ---------------------------------------------------------------------------

export const APPOINTMENT_STATUSES = [
  "REQUESTED",
  "SCHEDULED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const ENCOUNTER_TYPES = ["OPD", "IPD", "EMERGENCY", "TELECONSULT", "FOLLOW_UP"] as const;
export type EncounterType = (typeof ENCOUNTER_TYPES)[number];

export const ADMISSION_STATUSES = ["ADMITTED", "DISCHARGED", "TRANSFERRED", "DECEASED"] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONDITION_STATUSES = ["ACTIVE", "RESOLVED", "IN_REMISSION", "SUSPECTED"] as const;
export type ConditionStatus = (typeof CONDITION_STATUSES)[number];

export const VITAL_TYPES = [
  "BLOOD_PRESSURE",
  "HEART_RATE",
  "TEMPERATURE",
  "WEIGHT",
  "HEIGHT",
  "BLOOD_GLUCOSE",
  "SPO2",
  "RESPIRATORY_RATE",
] as const;
export type VitalType = (typeof VITAL_TYPES)[number];

export const MEDICATION_SCHEDULE_STATUSES = ["ACTIVE", "PAUSED", "COMPLETED", "STOPPED"] as const;
export type MedicationScheduleStatus = (typeof MEDICATION_SCHEDULE_STATUSES)[number];

export const DOSE_STATUSES = ["DUE", "TAKEN", "SKIPPED", "MISSED"] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

export const REPORT_STATUSES = [
  "ORDERED",
  "SAMPLE_COLLECTED",
  "IN_PROGRESS",
  "AWAITING_VERIFICATION",
  "PUBLISHED",
  "CANCELLED",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const FINDING_FLAGS = ["NORMAL", "LOW", "HIGH", "CRITICAL", "UNKNOWN"] as const;
export type FindingFlag = (typeof FINDING_FLAGS)[number];

export const INTERACTION_SEVERITIES = ["NONE", "MINOR", "MODERATE", "MAJOR", "CONTRAINDICATED"] as const;
export type InteractionSeverity = (typeof INTERACTION_SEVERITIES)[number];

// ---------------------------------------------------------------------------
// Documents & AI
// ---------------------------------------------------------------------------

export const DOCUMENT_KINDS = [
  "PRESCRIPTION",
  "LAB_REPORT",
  "IMAGING",
  "DISCHARGE_SUMMARY",
  "INVOICE",
  "INSURANCE",
  "VACCINATION",
  "PAYMENT_PROOF",
  "QR_IMAGE",
  "OTHER",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = [
  "PENDING_UPLOAD",
  "UPLOADED",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const AI_JOB_TYPES = [
  "OCR",
  "EXTRACT_MEDICINES",
  "ANALYZE_REPORT",
  "SUMMARIZE",
  "DETECT_INTERACTIONS",
  "DETECT_DUPLICATES",
] as const;
export type AiJobType = (typeof AI_JOB_TYPES)[number];

export const AI_JOB_STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export const AI_SUMMARY_KINDS = ["DOCUMENT", "REPORT", "TIMELINE", "ENCOUNTER"] as const;
export type AiSummaryKind = (typeof AI_SUMMARY_KINDS)[number];

// ---------------------------------------------------------------------------
// Commerce (manual payments — no gateway)
// ---------------------------------------------------------------------------

export const PLAN_AUDIENCES = ["PATIENT", "PROVIDER"] as const;
export type PlanAudience = (typeof PLAN_AUDIENCES)[number];

export const BILLING_INTERVALS = ["MONTHLY", "QUARTERLY", "YEARLY", "LIFETIME"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const SUBSCRIPTION_STATUSES = [
  "PENDING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PAID", "VOID", "OVERDUE"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * Manual collect-and-verify lifecycle (Phase 6):
 * PENDING → SUBMITTED → APPROVED | REJECTED, or EXPIRED if never paid.
 */
export const PAYMENT_REQUEST_STATUSES = [
  "PENDING",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];

export const PAYMENT_SUBMISSION_STATUSES = ["SUBMITTED", "APPROVED", "REJECTED"] as const;
export type PaymentSubmissionStatus = (typeof PAYMENT_SUBMISSION_STATUSES)[number];

export const PAYMENT_METHODS = ["UPI", "BANK_TRANSFER", "CASH", "CARD_OFFLINE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PURPOSES = ["SUBSCRIPTION", "INVOICE", "ACCESS_REQUEST", "OTHER"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const DISCOUNT_TYPES = ["PERCENT", "FIXED"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const EXPENSE_CATEGORIES = [
  "CONSULTATION",
  "MEDICINE",
  "DIAGNOSTIC",
  "HOSPITALIZATION",
  "INSURANCE_PREMIUM",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Onboarding (admin-provisioned — no self-signup)
// ---------------------------------------------------------------------------

export const ACCESS_REQUEST_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "APPROVED",
  "REJECTED",
  "PROVISIONED",
] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

// ---------------------------------------------------------------------------
// Notifications (web push + in-app only — no email, no SMS)
// ---------------------------------------------------------------------------

export const NOTIFICATION_CHANNELS = ["IN_APP", "WEB_PUSH", "WHATSAPP_MANUAL"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  "MEDICINE_REMINDER",
  "APPOINTMENT_REMINDER",
  "REPORT_READY",
  "PAYMENT_DUE",
  "PAYMENT_APPROVED",
  "PAYMENT_REJECTED",
  "DRUG_INTERACTION_ALERT",
  "VACCINATION_DUE",
  "STOCK_EXPIRY",
  "ACCOUNT_NOTICE",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const DELIVERY_STATUSES = ["QUEUED", "SENT", "FAILED", "SKIPPED", "COPIED"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

// ---------------------------------------------------------------------------
// Provider operations
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
  "DRAFT",
  "PLACED",
  "VERIFIED",
  "PACKED",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TEST_BOOKING_STATUSES = [
  "BOOKED",
  "SAMPLE_PENDING",
  "SAMPLE_COLLECTED",
  "PROCESSING",
  "REPORT_READY",
  "CANCELLED",
] as const;
export type TestBookingStatus = (typeof TEST_BOOKING_STATUSES)[number];

export const CURRENCY = "INR" as const;

/** All money is stored as an integer count of the smallest unit (paise). */
export const MINOR_UNITS_PER_MAJOR = 100;
