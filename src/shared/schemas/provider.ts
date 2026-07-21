import { z } from "zod";

import {
  APPOINTMENT_STATUSES,
  BLOOD_GROUPS,
  CONDITION_STATUSES,
  ENCOUNTER_TYPES,
  FINDING_FLAGS,
  GENDERS,
  ORDER_STATUSES,
  SEVERITIES,
  TEST_BOOKING_STATUSES,
  VITAL_TYPES,
} from "@/shared/enums";

/**
 * Input contracts for the provider consoles.
 *
 * Validation is deliberately lenient about *shape* and strict about *meaning*:
 * the people typing this are receptionists and nurses under time pressure, not
 * developers. Optional fields accept an empty string and normalise to
 * `undefined` rather than rejecting, and numbers are accepted as typed text.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined);

const optionalDate = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((d) => d === undefined || !Number.isNaN(d.getTime()), "Enter a valid date");

const requiredDateTime = z
  .string()
  .trim()
  .min(1, "Pick a date and time")
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), "Enter a valid date and time");

/** Rupees as typed by a human → paise. "1,200.50" and "1200.5" both work. */
export const rupeesToMinor = z
  .string()
  .trim()
  .min(1, "Enter an amount")
  .transform((v) => v.replace(/[,\s₹]/g, ""))
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 1200 or 1200.50")
  .transform((v) => Math.round(Number(v) * 100));

const phone = z
  .string()
  .trim()
  .regex(/^(?:\+?91[-\s]?)?[6-9]\d{9}$/, "Enter a valid 10-digit mobile number")
  .optional()
  .or(z.literal(""))
  .transform((v) => v || undefined);

// --- patients --------------------------------------------------------------

export const registerPatientSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the patient's name").max(120),
  phone,
  dateOfBirth: optionalDate,
  gender: z.enum(GENDERS).default("UNDISCLOSED"),
  bloodGroup: z.enum(BLOOD_GROUPS).default("UNKNOWN"),
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
  notes: optionalText(500),
  existingPatientId: optionalText(40),
});
export type RegisterPatientInputSchema = z.infer<typeof registerPatientSchema>;

// --- appointments ----------------------------------------------------------

export const bookAppointmentSchema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  practitionerId: optionalText(40),
  scheduledAt: requiredDateTime,
  durationMin: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : 15))
    .refine((n) => Number.isFinite(n) && n >= 5 && n <= 480, "Between 5 and 480 minutes"),
  type: z.enum(ENCOUNTER_TYPES).default("OPD"),
  reason: optionalText(200),
});

export const appointmentStatusSchema = z.object({
  appointmentId: z.string().min(1),
  status: z.enum(APPOINTMENT_STATUSES),
  cancelledReason: optionalText(200),
});

// --- encounters ------------------------------------------------------------

export const recordEncounterSchema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  appointmentId: optionalText(40),
  practitionerId: optionalText(40),
  type: z.enum(ENCOUNTER_TYPES).default("OPD"),
  chiefComplaint: optionalText(500),
  examination: optionalText(2000),
  diagnosis: optionalText(500),
  advice: optionalText(2000),
  followUpAt: optionalDate,
});

// --- prescriptions ---------------------------------------------------------

const prescriptionItem = z.object({
  drugName: z.string().trim().min(1).max(160),
  dose: optionalText(80),
  frequency: optionalText(80),
  duration: optionalText(80),
  instructions: optionalText(200),
});

export const issuePrescriptionSchema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  encounterId: optionalText(40),
  practitionerId: optionalText(40),
  notes: optionalText(500),
  items: z.array(prescriptionItem).min(1, "Add at least one medicine"),
});

/**
 * The prescription form posts repeated `drug[]`, `dose[]`… fields. Parsing the
 * FormData here keeps the pairing rule — a row exists only if it has a drug
 * name — in one place instead of in every caller.
 */
export function parsePrescriptionItems(formData: FormData) {
  const drugs = formData.getAll("drugName").map(String);
  const doses = formData.getAll("dose").map(String);
  const frequencies = formData.getAll("frequency").map(String);
  const durations = formData.getAll("duration").map(String);
  const instructions = formData.getAll("instructions").map(String);

  return drugs
    .map((drugName, index) => ({
      drugName: drugName.trim(),
      dose: doses[index]?.trim() ?? "",
      frequency: frequencies[index]?.trim() ?? "",
      duration: durations[index]?.trim() ?? "",
      instructions: instructions[index]?.trim() ?? "",
    }))
    .filter((item) => item.drugName.length > 0);
}

// --- records ---------------------------------------------------------------

export const addVitalSchema = z.object({
  patientId: z.string().min(1),
  type: z.enum(VITAL_TYPES),
  value: z.string().trim().min(1, "Enter a reading").max(40),
  unit: optionalText(20),
});

export const addAllergySchema = z.object({
  patientId: z.string().min(1),
  substance: z.string().trim().min(1, "What are they allergic to?").max(120),
  reaction: optionalText(200),
  severity: z.enum(SEVERITIES).default("MEDIUM"),
});

export const addConditionSchema = z.object({
  patientId: z.string().min(1),
  name: z.string().trim().min(2, "Name the condition").max(160),
  code: optionalText(20),
  status: z.enum(CONDITION_STATUSES).default("ACTIVE"),
  diagnosedAt: optionalDate,
  notes: optionalText(500),
});

export const addVaccinationSchema = z.object({
  patientId: z.string().min(1),
  vaccineName: z.string().trim().min(2, "Name the vaccine").max(120),
  doseNumber: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : undefined))
    .refine((n) => n === undefined || (Number.isInteger(n) && n > 0 && n < 20), "Enter a dose number"),
  administeredAt: optionalDate,
  nextDueAt: optionalDate,
  batchNo: optionalText(60),
});

// --- invoices --------------------------------------------------------------

export const createInvoiceSchema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  encounterId: optionalText(40),
  admissionId: optionalText(40),
  discountMinor: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Math.round(Number(v.replace(/[,\s₹]/g, "")) * 100) : 0))
    .refine((n) => Number.isFinite(n) && n >= 0, "Enter a valid discount"),
  taxMinor: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Math.round(Number(v.replace(/[,\s₹]/g, "")) * 100) : 0))
    .refine((n) => Number.isFinite(n) && n >= 0, "Enter a valid tax amount"),
  dueAt: optionalDate,
  notes: optionalText(500),
});

/** Repeated `description[]` / `quantity[]` / `unitPrice[]` rows. */
export function parseInvoiceItems(formData: FormData) {
  const descriptions = formData.getAll("description").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const prices = formData.getAll("unitPrice").map(String);
  const departments = formData.getAll("departmentId").map(String);

  return descriptions
    .map((description, index) => ({
      description: description.trim(),
      quantity: Number(quantities[index] ?? "1") || 1,
      unitPriceMinor: Math.round(Number((prices[index] ?? "0").replace(/[,\s₹]/g, "")) * 100) || 0,
      departmentId: departments[index]?.trim() || null,
    }))
    .filter((item) => item.description.length > 0);
}

export const invoiceActionSchema = z.object({
  invoiceId: z.string().min(1),
  reason: optionalText(200),
});

// --- hospital: departments & admissions ------------------------------------

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, "Name the department").max(80),
  code: optionalText(20),
});

export const departmentIdSchema = z.object({ departmentId: z.string().min(1) });

export const admitPatientSchema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  departmentId: optionalText(40),
  practitionerId: optionalText(40),
  wardName: optionalText(60),
  bedNo: optionalText(20),
  admissionReason: optionalText(300),
});

export const transferAdmissionSchema = z.object({
  admissionId: z.string().min(1),
  departmentId: optionalText(40),
  wardName: optionalText(60),
  bedNo: optionalText(20),
});

export const dischargeAdmissionSchema = z.object({
  admissionId: z.string().min(1),
  // A discharge with no summary is a record nobody can act on afterwards.
  dischargeSummary: z.string().trim().min(10, "Write a discharge summary").max(4000),
  status: z.enum(["DISCHARGED", "DECEASED"]).default("DISCHARGED"),
});

export const operationNoteSchema = z.object({
  admissionId: z.string().min(1),
  procedure: z.string().trim().min(2, "Name the procedure").max(200),
  performedAt: optionalDate,
  surgeonName: optionalText(120),
  anaesthesia: optionalText(120),
  findings: optionalText(2000),
  notes: optionalText(2000),
});

// --- diagnostic centre -----------------------------------------------------

export const catalogItemSchema = z.object({
  name: z.string().trim().min(2, "Name the test").max(160),
  code: optionalText(20),
  priceMinor: rupeesToMinor,
  sampleType: optionalText(60),
  tatHours: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : undefined))
    .refine((n) => n === undefined || (Number.isFinite(n) && n > 0 && n <= 720), "Hours, up to 720"),
  preparation: optionalText(300),
});

export const catalogItemToggleSchema = z.object({
  itemId: z.string().min(1),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const createBookingSchema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  catalogItemId: z.string().min(1, "Choose a test"),
  scheduledAt: optionalDate,
  homeCollection: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export const bookingStatusSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(TEST_BOOKING_STATUSES),
});

export const createReportSchema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  title: z.string().trim().min(2, "Name the report").max(160),
  reportType: optionalText(80),
  reportedAt: optionalDate,
  bookingId: optionalText(40),
});

export const reportIdSchema = z.object({ reportId: z.string().min(1) });

/** Repeated `label[]` / `value[]` / `unit[]` / `range[]` / `flag[]` rows. */
export function parseFindings(formData: FormData) {
  const labels = formData.getAll("label").map(String);
  const values = formData.getAll("value").map(String);
  const units = formData.getAll("unit").map(String);
  const ranges = formData.getAll("referenceRange").map(String);
  const flags = formData.getAll("flag").map(String);

  return labels
    .map((label, index) => ({
      label: label.trim(),
      value: (values[index] ?? "").trim(),
      unit: units[index]?.trim() || null,
      referenceRange: ranges[index]?.trim() || null,
      flag: (FINDING_FLAGS as readonly string[]).includes(flags[index] ?? "")
        ? (flags[index] as (typeof FINDING_FLAGS)[number])
        : ("UNKNOWN" as const),
    }))
    // A row needs both a name and a number; a label with no value is a typo,
    // not a result.
    .filter((finding) => finding.label.length > 0 && finding.value.length > 0);
}

// --- pharmacy --------------------------------------------------------------

export const createProductSchema = z.object({
  name: z.string().trim().min(2, "Name the product").max(160),
  sku: optionalText(40),
  manufacturer: optionalText(120),
  form: optionalText(40),
  strength: optionalText(40),
  isScheduled: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export const addBatchSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  batchNo: z.string().trim().min(1, "Enter the batch number").max(60),
  expiryAt: z
    .string()
    .trim()
    .min(1, "Enter the expiry date")
    .transform((v) => new Date(v))
    .refine((d) => !Number.isNaN(d.getTime()), "Enter a valid date"),
  quantity: z
    .string()
    .trim()
    .min(1, "Enter a quantity")
    .transform((v) => Number(v))
    .refine((n) => Number.isInteger(n) && n > 0, "Enter a whole number above zero"),
  costMinor: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Math.round(Number(v.replace(/[,\s₹]/g, "")) * 100) : undefined)),
  mrpMinor: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Math.round(Number(v.replace(/[,\s₹]/g, "")) * 100) : undefined)),
});

export const adjustBatchSchema = z.object({
  batchId: z.string().min(1),
  delta: z
    .string()
    .trim()
    .min(1, "Enter a change, e.g. -3")
    .transform((v) => Number(v))
    .refine((n) => Number.isInteger(n) && n !== 0, "Enter a whole number that is not zero"),
  reason: z.string().trim().min(3, "Say why the count changed").max(200),
});

export const createOrderSchema = z.object({
  patientId: optionalText(40),
  prescriptionId: optionalText(40),
  deliveryAddress: optionalText(300),
});

export const orderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(ORDER_STATUSES),
});

export const orderIdSchema = z.object({ orderId: z.string().min(1) });

/** Repeated `productId[]` / `batchId[]` / `orderQuantity[]` / `orderUnitPrice[]` rows. */
export function parseOrderItems(formData: FormData) {
  const productIds = formData.getAll("productId").map(String);
  const batchIds = formData.getAll("batchId").map(String);
  const quantities = formData.getAll("orderQuantity").map(String);
  const prices = formData.getAll("orderUnitPrice").map(String);

  return productIds
    .map((productId, index) => ({
      productId: productId.trim(),
      batchId: batchIds[index]?.trim() || null,
      quantity: Number(quantities[index] ?? "0") || 0,
      unitPriceMinor:
        Math.round(Number((prices[index] ?? "0").replace(/[,\s₹]/g, "")) * 100) || 0,
    }))
    .filter((item) => item.productId.length > 0 && item.quantity > 0);
}
