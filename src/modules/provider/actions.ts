"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireTenantPermission } from "@/lib/auth/session";
import {
  addAllergy,
  addCondition,
  addVaccination,
  addVital,
  bookAppointment,
  issuePrescription,
  recordEncounter,
  setAppointmentStatus,
} from "@/modules/provider/clinical.service";
import {
  addOperationNote,
  admitPatient,
  createDepartment,
  deleteDepartment,
  dischargeAdmission,
  transferAdmission,
} from "@/modules/provider/admission.service";
import {
  createBooking,
  createCatalogItem,
  createReport,
  publishReport,
  setBookingStatus,
  setCatalogItemActive,
} from "@/modules/provider/diagnostic.service";
import { createInvoice, issueInvoice, voidInvoice } from "@/modules/provider/invoice.service";
import { registerPatient } from "@/modules/provider/patients.service";
import {
  addBatch,
  adjustBatch,
  createOrder,
  createProduct,
  setOrderStatus,
  verifyOrder,
} from "@/modules/provider/pharmacy.service";
import { PORTAL_BY_ROLE } from "@/shared/enums";
import { AppError } from "@/shared/errors";
import {
  addAllergySchema,
  addConditionSchema,
  addVaccinationSchema,
  addBatchSchema,
  addVitalSchema,
  adjustBatchSchema,
  admitPatientSchema,
  appointmentStatusSchema,
  bookAppointmentSchema,
  bookingStatusSchema,
  catalogItemSchema,
  catalogItemToggleSchema,
  createBookingSchema,
  createDepartmentSchema,
  createInvoiceSchema,
  createOrderSchema,
  createProductSchema,
  createReportSchema,
  departmentIdSchema,
  dischargeAdmissionSchema,
  invoiceActionSchema,
  issuePrescriptionSchema,
  operationNoteSchema,
  orderIdSchema,
  orderStatusSchema,
  parseFindings,
  parseInvoiceItems,
  parseOrderItems,
  parsePrescriptionItems,
  recordEncounterSchema,
  registerPatientSchema,
  reportIdSchema,
  transferAdmissionSchema,
} from "@/shared/schemas/provider";

/**
 * Server actions for the four provider consoles.
 *
 * Every one of them starts with `requireTenantPermission(...)`, which is what
 * supplies the `orgId`. The forms never post an org id — if they did, changing
 * a hidden field would be a cross-tenant write.
 */

export interface ProviderActionState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  /** Set by actions the UI follows up on (e.g. the new patient's id). */
  createdId?: string;
}

export const emptyProviderState: ProviderActionState = { ok: false };

function toState(error: unknown): ProviderActionState {
  if (error instanceof AppError) {
    const field = (error.details as { field?: string } | undefined)?.field;
    return field
      ? { ok: false, fieldErrors: { [field]: [error.message] } }
      : { ok: false, error: error.message };
  }

  console.error("[provider action] unexpected error", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/** The console the caller belongs to — never taken from the form. */
async function portalBase(): Promise<string> {
  const { user } = await requireTenantPermission("patient:read");
  return PORTAL_BY_ROLE[user.role];
}

// --- patients --------------------------------------------------------------

export async function registerPatientAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = registerPatientSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  let target: string;

  try {
    const { user, orgId } = await requireTenantPermission("patient:create");

    const result = await registerPatient(
      orgId,
      {
        fullName: parsed.data.fullName,
        phone: parsed.data.phone ?? null,
        dateOfBirth: parsed.data.dateOfBirth ?? null,
        gender: parsed.data.gender,
        bloodGroup: parsed.data.bloodGroup,
        addressLine: parsed.data.addressLine ?? null,
        city: parsed.data.city ?? null,
        state: parsed.data.state ?? null,
        pincode: parsed.data.pincode ?? null,
        notes: parsed.data.notes ?? null,
        existingPatientId: parsed.data.existingPatientId ?? null,
      },
      user.id,
    );

    target = `${PORTAL_BY_ROLE[user.role]}/patients/${result.patientId}`;
  } catch (error) {
    return toState(error);
  }

  redirect(target);
}

// --- appointments ----------------------------------------------------------

export async function bookAppointmentAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = bookAppointmentSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("appointment:manage");

    await bookAppointment(
      orgId,
      {
        patientId: parsed.data.patientId,
        practitionerId: parsed.data.practitionerId ?? null,
        scheduledAt: parsed.data.scheduledAt,
        durationMin: parsed.data.durationMin,
        type: parsed.data.type,
        reason: parsed.data.reason ?? null,
      },
      user.id,
    );

    revalidatePath(`${PORTAL_BY_ROLE[user.role]}/appointments`);
    return { ok: true, message: "Appointment booked." };
  } catch (error) {
    return toState(error);
  }
}

export async function setAppointmentStatusAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = appointmentStatusSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not update that appointment." };

  try {
    const { user, orgId } = await requireTenantPermission("appointment:manage");

    await setAppointmentStatus(
      orgId,
      parsed.data.appointmentId,
      parsed.data.status,
      user.id,
      parsed.data.cancelledReason,
    );

    revalidatePath(`${PORTAL_BY_ROLE[user.role]}/appointments`);
    return { ok: true, message: "Updated." };
  } catch (error) {
    return toState(error);
  }
}

// --- encounters ------------------------------------------------------------

export async function recordEncounterAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = recordEncounterSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  let target: string;

  try {
    const { user, orgId } = await requireTenantPermission("encounter:manage");

    const encounter = await recordEncounter(
      orgId,
      {
        patientId: parsed.data.patientId,
        appointmentId: parsed.data.appointmentId ?? null,
        practitionerId: parsed.data.practitionerId ?? null,
        type: parsed.data.type,
        chiefComplaint: parsed.data.chiefComplaint ?? null,
        examination: parsed.data.examination ?? null,
        diagnosis: parsed.data.diagnosis ?? null,
        advice: parsed.data.advice ?? null,
        followUpAt: parsed.data.followUpAt ?? null,
      },
      user.id,
    );

    target = `${PORTAL_BY_ROLE[user.role]}/encounters/${encounter.id}`;
  } catch (error) {
    return toState(error);
  }

  redirect(target);
}

// --- prescriptions ---------------------------------------------------------

export async function issuePrescriptionAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = issuePrescriptionSchema.safeParse({
    patientId: formData.get("patientId"),
    encounterId: formData.get("encounterId") ?? "",
    practitionerId: formData.get("practitionerId") ?? "",
    notes: formData.get("notes") ?? "",
    items: parsePrescriptionItems(formData),
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    return { ok: false, fieldErrors };
  }

  try {
    const { user, orgId } = await requireTenantPermission("prescription:create");

    const result = await issuePrescription(
      orgId,
      {
        patientId: parsed.data.patientId,
        encounterId: parsed.data.encounterId ?? null,
        practitionerId: parsed.data.practitionerId ?? null,
        notes: parsed.data.notes ?? null,
        items: parsed.data.items,
      },
      user.id,
    );

    const base = PORTAL_BY_ROLE[user.role];
    revalidatePath(`${base}/prescriptions`);
    revalidatePath(`${base}/patients/${parsed.data.patientId}`);

    return {
      ok: true,
      createdId: result.id,
      message:
        result.schedulesCreated > 0
          ? `Prescription issued. ${result.schedulesCreated} reminder schedule(s) created for the patient.`
          : "Prescription issued.",
    };
  } catch (error) {
    return toState(error);
  }
}

// --- record edits ----------------------------------------------------------

export async function addVitalAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = addVitalSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("record:manage");

    await addVital(
      orgId,
      {
        patientId: parsed.data.patientId,
        type: parsed.data.type,
        value: parsed.data.value,
        unit: parsed.data.unit ?? null,
      },
      user.id,
    );

    revalidatePath(`${await portalBase()}/patients/${parsed.data.patientId}`);
    return { ok: true, message: "Reading recorded." };
  } catch (error) {
    return toState(error);
  }
}

export async function addAllergyAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = addAllergySchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("record:manage");

    await addAllergy(
      orgId,
      {
        patientId: parsed.data.patientId,
        substance: parsed.data.substance,
        reaction: parsed.data.reaction ?? null,
        severity: parsed.data.severity,
      },
      user.id,
    );

    revalidatePath(`${await portalBase()}/patients/${parsed.data.patientId}`);
    return { ok: true, message: "Allergy recorded." };
  } catch (error) {
    return toState(error);
  }
}

export async function addConditionAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = addConditionSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("record:manage");

    await addCondition(
      orgId,
      {
        patientId: parsed.data.patientId,
        name: parsed.data.name,
        code: parsed.data.code ?? null,
        status: parsed.data.status,
        diagnosedAt: parsed.data.diagnosedAt ?? null,
        notes: parsed.data.notes ?? null,
      },
      user.id,
    );

    revalidatePath(`${await portalBase()}/patients/${parsed.data.patientId}`);
    return { ok: true, message: "Condition recorded." };
  } catch (error) {
    return toState(error);
  }
}

export async function addVaccinationAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = addVaccinationSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("record:manage");

    await addVaccination(
      orgId,
      {
        patientId: parsed.data.patientId,
        vaccineName: parsed.data.vaccineName,
        doseNumber: parsed.data.doseNumber ?? null,
        administeredAt: parsed.data.administeredAt ?? null,
        nextDueAt: parsed.data.nextDueAt ?? null,
        batchNo: parsed.data.batchNo ?? null,
      },
      user.id,
    );

    revalidatePath(`${await portalBase()}/patients/${parsed.data.patientId}`);
    return { ok: true, message: "Vaccination recorded." };
  } catch (error) {
    return toState(error);
  }
}

// --- invoices --------------------------------------------------------------

export async function createInvoiceAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = createInvoiceSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const items = parseInvoiceItems(formData);

  if (items.length === 0) {
    return { ok: false, fieldErrors: { items: ["Add at least one line."] } };
  }

  let target: string;

  try {
    const { user, orgId } = await requireTenantPermission("invoice:manage");

    const invoice = await createInvoice(
      orgId,
      {
        patientId: parsed.data.patientId,
        items,
        encounterId: parsed.data.encounterId ?? null,
        admissionId: parsed.data.admissionId ?? null,
        discountMinor: parsed.data.discountMinor,
        taxMinor: parsed.data.taxMinor,
        dueAt: parsed.data.dueAt ?? null,
        notes: parsed.data.notes ?? null,
      },
      user.id,
    );

    target = `${PORTAL_BY_ROLE[user.role]}/billing/${invoice.id}`;
  } catch (error) {
    return toState(error);
  }

  redirect(target);
}

export async function issueInvoiceAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = invoiceActionSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not identify that invoice." };

  try {
    const { user, orgId } = await requireTenantPermission("invoice:manage");
    const result = await issueInvoice(orgId, parsed.data.invoiceId, user.id);

    const base = PORTAL_BY_ROLE[user.role];
    revalidatePath(`${base}/billing`);
    revalidatePath(`${base}/billing/${parsed.data.invoiceId}`);

    return {
      ok: true,
      message: result.refCode
        ? `Invoice issued. Share reference ${result.refCode} for payment.`
        : "Invoice issued. Set up your UPI details to collect online.",
    };
  } catch (error) {
    return toState(error);
  }
}

export async function voidInvoiceAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = invoiceActionSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success || !parsed.data.reason) {
    return { ok: false, fieldErrors: { reason: ["Say why this invoice is being voided."] } };
  }

  try {
    const { user, orgId } = await requireTenantPermission("invoice:manage");
    await voidInvoice(orgId, parsed.data.invoiceId, user.id, parsed.data.reason);

    const base = PORTAL_BY_ROLE[user.role];
    revalidatePath(`${base}/billing`);
    revalidatePath(`${base}/billing/${parsed.data.invoiceId}`);

    return { ok: true, message: "Invoice voided." };
  } catch (error) {
    return toState(error);
  }
}

// --- hospital: departments -------------------------------------------------

export async function createDepartmentAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = createDepartmentSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("org:read");

    await createDepartment(
      orgId,
      { name: parsed.data.name, code: parsed.data.code ?? null },
      user.id,
    );

    revalidatePath("/hospital/departments");
    return { ok: true, message: "Department added." };
  } catch (error) {
    return toState(error);
  }
}

export async function deleteDepartmentAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = departmentIdSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not identify that department." };

  try {
    const { user, orgId } = await requireTenantPermission("org:read");
    await deleteDepartment(orgId, parsed.data.departmentId, user.id);

    revalidatePath("/hospital/departments");
    return { ok: true, message: "Department removed." };
  } catch (error) {
    return toState(error);
  }
}

// --- hospital: admissions --------------------------------------------------

export async function admitPatientAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = admitPatientSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  let target: string;

  try {
    const { user, orgId } = await requireTenantPermission("admission:manage");

    const admission = await admitPatient(
      orgId,
      {
        patientId: parsed.data.patientId,
        departmentId: parsed.data.departmentId ?? null,
        practitionerId: parsed.data.practitionerId ?? null,
        wardName: parsed.data.wardName ?? null,
        bedNo: parsed.data.bedNo ?? null,
        admissionReason: parsed.data.admissionReason ?? null,
      },
      user.id,
    );

    target = `/hospital/admissions/${admission.id}`;
  } catch (error) {
    return toState(error);
  }

  redirect(target);
}

export async function transferAdmissionAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = transferAdmissionSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("admission:manage");

    await transferAdmission(
      orgId,
      parsed.data.admissionId,
      {
        departmentId: parsed.data.departmentId ?? null,
        wardName: parsed.data.wardName ?? null,
        bedNo: parsed.data.bedNo ?? null,
      },
      user.id,
    );

    revalidatePath(`/hospital/admissions/${parsed.data.admissionId}`);
    return { ok: true, message: "Patient transferred." };
  } catch (error) {
    return toState(error);
  }
}

export async function dischargeAdmissionAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = dischargeAdmissionSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("admission:manage");

    await dischargeAdmission(
      orgId,
      parsed.data.admissionId,
      { dischargeSummary: parsed.data.dischargeSummary, status: parsed.data.status },
      user.id,
    );

    revalidatePath("/hospital/admissions");
    revalidatePath(`/hospital/admissions/${parsed.data.admissionId}`);
    return { ok: true, message: "Discharged. The summary is now in the patient's timeline." };
  } catch (error) {
    return toState(error);
  }
}

export async function addOperationNoteAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = operationNoteSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("admission:manage");

    await addOperationNote(
      orgId,
      parsed.data.admissionId,
      {
        procedure: parsed.data.procedure,
        performedAt: parsed.data.performedAt,
        surgeonName: parsed.data.surgeonName ?? null,
        anaesthesia: parsed.data.anaesthesia ?? null,
        findings: parsed.data.findings ?? null,
        notes: parsed.data.notes ?? null,
      },
      user.id,
    );

    revalidatePath(`/hospital/admissions/${parsed.data.admissionId}`);
    return { ok: true, message: "Operation note added." };
  } catch (error) {
    return toState(error);
  }
}

// --- diagnostic centre -----------------------------------------------------

export async function createCatalogItemAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = catalogItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("test-catalog:manage");

    await createCatalogItem(
      orgId,
      {
        name: parsed.data.name,
        code: parsed.data.code ?? null,
        priceMinor: parsed.data.priceMinor,
        sampleType: parsed.data.sampleType ?? null,
        tatHours: parsed.data.tatHours ?? null,
        preparation: parsed.data.preparation ?? null,
      },
      user.id,
    );

    revalidatePath("/diagnostic/catalogue");
    return { ok: true, message: "Test added to the catalogue." };
  } catch (error) {
    return toState(error);
  }
}

export async function toggleCatalogItemAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = catalogItemToggleSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not identify that test." };

  try {
    const { user, orgId } = await requireTenantPermission("test-catalog:manage");
    await setCatalogItemActive(orgId, parsed.data.itemId, parsed.data.isActive, user.id);

    revalidatePath("/diagnostic/catalogue");
    return { ok: true, message: parsed.data.isActive ? "Test is available again." : "Test retired." };
  } catch (error) {
    return toState(error);
  }
}

export async function createBookingAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = createBookingSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("test-booking:manage");

    await createBooking(
      orgId,
      {
        patientId: parsed.data.patientId,
        catalogItemId: parsed.data.catalogItemId,
        scheduledAt: parsed.data.scheduledAt ?? null,
        homeCollection: parsed.data.homeCollection,
      },
      user.id,
    );

    revalidatePath("/diagnostic/bookings");
    return { ok: true, message: "Booked. The patient has been sent the preparation instructions." };
  } catch (error) {
    return toState(error);
  }
}

export async function setBookingStatusAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = bookingStatusSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not update that booking." };

  try {
    const { user, orgId } = await requireTenantPermission("test-booking:manage");
    await setBookingStatus(orgId, parsed.data.bookingId, parsed.data.status, user.id);

    revalidatePath("/diagnostic/bookings");
    return { ok: true, message: "Updated." };
  } catch (error) {
    return toState(error);
  }
}

export async function createReportAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = createReportSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const findings = parseFindings(formData);

  if (findings.length === 0) {
    return { ok: false, fieldErrors: { findings: ["Enter at least one result line."] } };
  }

  let target: string;

  try {
    const { user, orgId } = await requireTenantPermission("report:upload");

    const report = await createReport(
      orgId,
      {
        patientId: parsed.data.patientId,
        title: parsed.data.title,
        reportType: parsed.data.reportType ?? null,
        reportedAt: parsed.data.reportedAt,
        bookingId: parsed.data.bookingId ?? null,
        findings,
      },
      user.id,
    );

    target = `/diagnostic/reports/${report.id}`;
  } catch (error) {
    return toState(error);
  }

  redirect(target);
}

export async function publishReportAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = reportIdSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not identify that report." };

  try {
    // `report:verify` deliberately, not `report:upload` — the person who typed
    // the numbers is not automatically the person who signs them off.
    const { user, orgId } = await requireTenantPermission("report:verify");
    await publishReport(orgId, parsed.data.reportId, user.id);

    revalidatePath("/diagnostic/reports");
    revalidatePath(`/diagnostic/reports/${parsed.data.reportId}`);
    return { ok: true, message: "Published. The patient has been notified." };
  } catch (error) {
    return toState(error);
  }
}

// --- pharmacy --------------------------------------------------------------

export async function createProductAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = createProductSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("inventory:manage");

    await createProduct(
      orgId,
      {
        name: parsed.data.name,
        sku: parsed.data.sku ?? null,
        manufacturer: parsed.data.manufacturer ?? null,
        form: parsed.data.form ?? null,
        strength: parsed.data.strength ?? null,
        isScheduled: parsed.data.isScheduled,
      },
      user.id,
    );

    revalidatePath("/pharmacy/inventory");
    return { ok: true, message: "Product added." };
  } catch (error) {
    return toState(error);
  }
}

export async function addBatchAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = addBatchSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("inventory:manage");

    await addBatch(
      orgId,
      {
        productId: parsed.data.productId,
        batchNo: parsed.data.batchNo,
        expiryAt: parsed.data.expiryAt,
        quantity: parsed.data.quantity,
        costMinor: parsed.data.costMinor ?? null,
        mrpMinor: parsed.data.mrpMinor ?? null,
      },
      user.id,
    );

    revalidatePath("/pharmacy/inventory");
    return { ok: true, message: "Stock added." };
  } catch (error) {
    return toState(error);
  }
}

export async function adjustBatchAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = adjustBatchSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const { user, orgId } = await requireTenantPermission("inventory:manage");
    await adjustBatch(orgId, parsed.data.batchId, parsed.data.delta, parsed.data.reason, user.id);

    revalidatePath("/pharmacy/inventory");
    return { ok: true, message: "Count adjusted." };
  } catch (error) {
    return toState(error);
  }
}

export async function createOrderAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = createOrderSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const items = parseOrderItems(formData);

  if (items.length === 0) {
    return { ok: false, fieldErrors: { items: ["Add at least one item with a quantity."] } };
  }

  let target: string;

  try {
    const { user, orgId } = await requireTenantPermission("order:manage");

    const order = await createOrder(
      orgId,
      {
        patientId: parsed.data.patientId ?? null,
        prescriptionId: parsed.data.prescriptionId ?? null,
        deliveryAddress: parsed.data.deliveryAddress ?? null,
        items,
      },
      user.id,
    );

    target = `/pharmacy/orders/${order.id}`;
  } catch (error) {
    return toState(error);
  }

  redirect(target);
}

export async function verifyOrderAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = orderIdSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not identify that order." };

  try {
    const { user, orgId } = await requireTenantPermission("prescription:verify");
    await verifyOrder(orgId, parsed.data.orderId, user.id);

    revalidatePath("/pharmacy/orders");
    revalidatePath(`/pharmacy/orders/${parsed.data.orderId}`);
    return { ok: true, message: "Verified against the prescription." };
  } catch (error) {
    return toState(error);
  }
}

export async function setOrderStatusAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = orderStatusSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: "Could not update that order." };

  try {
    const { user, orgId } = await requireTenantPermission("order:manage");
    await setOrderStatus(orgId, parsed.data.orderId, parsed.data.status, user.id);

    revalidatePath("/pharmacy/orders");
    revalidatePath("/pharmacy/inventory");
    revalidatePath(`/pharmacy/orders/${parsed.data.orderId}`);
    return { ok: true, message: "Updated." };
  } catch (error) {
    return toState(error);
  }
}
