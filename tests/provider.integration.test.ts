import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Phases 7–10 acceptance, against a real database.
 *
 * What these tests are actually defending:
 *   - tenancy: a clinic cannot read, write or bill another clinic's patient;
 *   - the clinical chain: appointment → encounter → prescription → reminders;
 *   - money: totals are computed server-side, and a void never deletes;
 *   - results: nothing reaches a patient until a human verifies it;
 *   - stock: it moves exactly once, and expired stock is never sellable;
 *   - provisioning: a provider admin is confined to their own tenant.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const { registerPatient, requirePatientOfOrg, searchPatients } = await import(
  "@/modules/provider/patients.service"
);
const { bookAppointment, issuePrescription, recordEncounter, setAppointmentStatus } = await import(
  "@/modules/provider/clinical.service"
);
const { createInvoice, issueInvoice, voidInvoice } = await import(
  "@/modules/provider/invoice.service"
);
const { admitPatient, dischargeAdmission, createDepartment } = await import(
  "@/modules/provider/admission.service"
);
const { createCatalogItem, createBooking, createReport, publishReport } = await import(
  "@/modules/provider/diagnostic.service"
);
const { addBatch, createOrder, createProduct, listProducts, setOrderStatus, verifyOrder } =
  await import("@/modules/provider/pharmacy.service");
const { listSchedules } = await import("@/modules/patient/medication.service");
const { createUser, platformScope, resetPassword, tenantScope } = await import(
  "@/modules/identity/provisioning.service"
);

const prisma = new PrismaClient();
const SUFFIX = "providerspec";

const CLINIC = "org-demo-clinic";
const HOSPITAL = "org-demo-hospital";
const DIAGNOSTIC = "org-demo-diagnostic";
const PHARMACY = "org-demo-pharmacy";

let adminId: string;
let clinicPatientId: string;
let hospitalPatientId: string;

async function cleanup() {
  const patients = await prisma.patient.findMany({
    where: { fullName: { contains: SUFFIX } },
    select: { id: true },
  });
  const patientIds = patients.map((p) => p.id);

  const users = await prisma.user.findMany({
    where: { username: { contains: SUFFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (patientIds.length > 0) {
    await prisma.pharmacyOrderItem.deleteMany({ where: { order: { patientId: { in: patientIds } } } });
    await prisma.pharmacyOrder.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.testBooking.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.reportFinding.deleteMany({ where: { report: { patientId: { in: patientIds } } } });
    await prisma.diagnosticReport.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.medicationDose.deleteMany({
      where: { schedule: { patientId: { in: patientIds } } },
    });
    await prisma.medicationSchedule.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { patientId: { in: patientIds } } },
    });
    await prisma.prescription.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { patientId: { in: patientIds } } } });
    await prisma.paymentSubmission.deleteMany({
      where: { paymentRequest: { patientId: { in: patientIds } } },
    });
    await prisma.paymentRequest.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.invoice.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.operationNote.deleteMany({
      where: { admission: { patientId: { in: patientIds } } },
    });
    await prisma.admission.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.encounter.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.appointment.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.notification.deleteMany({ where: { user: { patient: { id: { in: patientIds } } } } });
    await prisma.consentRecord.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patientOrgLink.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
  }

  // Order items reference products, and a walk-in order has no patient — so it
  // survives the patient-scoped sweep above and would block the product delete.
  await prisma.pharmacyOrderItem.deleteMany({
    where: { product: { name: { contains: SUFFIX } } },
  });
  await prisma.pharmacyOrder.deleteMany({ where: { items: { none: {} }, orgId: PHARMACY } });
  await prisma.stockBatch.deleteMany({ where: { product: { name: { contains: SUFFIX } } } });
  await prisma.product.deleteMany({ where: { name: { contains: SUFFIX } } });
  await prisma.testCatalogItem.deleteMany({ where: { name: { contains: SUFFIX } } });
  await prisma.department.deleteMany({ where: { name: { contains: SUFFIX } } });

  if (userIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

beforeAll(async () => {
  await cleanup();

  const admin = await prisma.user.findFirstOrThrow({
    where: { role: "SUPER_ADMIN", deletedAt: null },
    select: { id: true },
  });
  adminId = admin.id;

  clinicPatientId = (
    await registerPatient(CLINIC, { fullName: `Clinic Patient ${SUFFIX}`, phone: "9830000001" }, adminId)
  ).patientId;

  hospitalPatientId = (
    await registerPatient(
      HOSPITAL,
      { fullName: `Hospital Patient ${SUFFIX}`, phone: "9830000002" },
      adminId,
    )
  ).patientId;
}, 60_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("tenancy", () => {
  it("registers a patient into the tenant's own register only", async () => {
    const clinicList = await searchPatients(CLINIC, SUFFIX);
    const hospitalList = await searchPatients(HOSPITAL, SUFFIX);

    expect(clinicList.map((p) => p.id)).toContain(clinicPatientId);
    expect(clinicList.map((p) => p.id)).not.toContain(hospitalPatientId);
    expect(hospitalList.map((p) => p.id)).toContain(hospitalPatientId);
  });

  it("issues a file number scoped to the tenant", async () => {
    const patient = await requirePatientOfOrg(CLINIC, clinicPatientId);
    expect(patient.mrn).toMatch(/^MRN\d{5}$/);
  });

  it("refuses to read another tenant's patient — as NOT_FOUND, not FORBIDDEN", async () => {
    // FORBIDDEN would confirm the record exists somewhere, which is itself a
    // disclosure.
    await expect(requirePatientOfOrg(CLINIC, hospitalPatientId)).rejects.toThrow(/not found/i);
  });

  it("refuses to book, bill or prescribe across tenants", async () => {
    await expect(
      bookAppointment(
        CLINIC,
        { patientId: hospitalPatientId, scheduledAt: new Date(Date.now() + 86_400_000) },
        adminId,
      ),
    ).rejects.toThrow(/not found/i);

    await expect(
      issuePrescription(
        CLINIC,
        { patientId: hospitalPatientId, items: [{ drugName: "Paracetamol" }] },
        adminId,
      ),
    ).rejects.toThrow(/not found/i);

    await expect(
      createInvoice(
        CLINIC,
        {
          patientId: hospitalPatientId,
          items: [{ description: "Consultation", quantity: 1, unitPriceMinor: 50000 }],
        },
        adminId,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it("records a sharing consent when a provider registers someone", async () => {
    const consent = await prisma.consentRecord.findFirst({
      where: { patientId: clinicPatientId, type: "PROVIDER_SHARING", orgId: CLINIC },
    });

    expect(consent).not.toBeNull();
    expect(consent!.granted).toBe(true);
  });
});

describe("the clinical chain", () => {
  it("closes the appointment when the visit is recorded", async () => {
    const appointment = await bookAppointment(
      CLINIC,
      {
        patientId: clinicPatientId,
        scheduledAt: new Date(Date.now() + 3 * 86_400_000),
        reason: `Fever ${SUFFIX}`,
      },
      adminId,
    );

    await setAppointmentStatus(CLINIC, appointment.id, "CHECKED_IN", adminId);

    const encounter = await recordEncounter(
      CLINIC,
      {
        patientId: clinicPatientId,
        appointmentId: appointment.id,
        chiefComplaint: "Fever",
        diagnosis: "Viral fever",
      },
      adminId,
    );

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });

    // Leaving it "checked in" is the single most common source of a wrong day
    // list, so recording the visit is what closes it.
    expect(after.status).toBe("COMPLETED");
    expect(encounter.id).toBeTruthy();
  });

  it("refuses a second consultation against the same appointment", async () => {
    const appointment = await bookAppointment(
      CLINIC,
      { patientId: clinicPatientId, scheduledAt: new Date(Date.now() + 4 * 86_400_000) },
      adminId,
    );

    await recordEncounter(CLINIC, { patientId: clinicPatientId, appointmentId: appointment.id }, adminId);

    await expect(
      recordEncounter(CLINIC, { patientId: clinicPatientId, appointmentId: appointment.id }, adminId),
    ).rejects.toThrow(/already has a consultation/i);
  });

  it("turns a prescription into medicine schedules the patient can see", async () => {
    const prescription = await issuePrescription(
      CLINIC,
      {
        patientId: clinicPatientId,
        items: [
          { drugName: `Amoxicillin ${SUFFIX}`, dose: "500 mg", frequency: "1-0-1", duration: "5 days" },
          { drugName: `Vitamin D ${SUFFIX}`, frequency: "weekly" },
        ],
      },
      adminId,
    );

    expect(prescription.schedulesCreated).toBe(2);

    const schedules = await listSchedules(clinicPatientId);
    const amox = schedules.find((s) => s.drugName.startsWith("Amoxicillin"));

    expect(amox).toBeDefined();
    // "1-0-1" is morning and night — the afternoon slot is explicitly zero.
    expect(amox!.times).toEqual(["08:00", "20:00"]);
    expect(amox!.endDate).not.toBeNull();

    // "weekly" is not a frequency the mapper understands, so it gets one
    // morning dose and an open end rather than a guess.
    const vitamin = schedules.find((s) => s.drugName.startsWith("Vitamin D"));
    expect(vitamin!.times).toEqual(["08:00"]);
    expect(vitamin!.endDate).toBeNull();
  });

  it("does not create a second schedule when the same prescription is reprocessed", async () => {
    const before = (await listSchedules(clinicPatientId)).length;

    const prescription = await prisma.prescription.findFirstOrThrow({
      where: { patientId: clinicPatientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const { schedulesFromPrescription } = await import("@/modules/patient/medication.service");
    const created = await schedulesFromPrescription(prescription.id, adminId);

    expect(created).toBe(0);
    expect((await listSchedules(clinicPatientId)).length).toBe(before);
  });
});

describe("invoicing", () => {
  it("computes the total on the server and voids rather than deletes", async () => {
    const invoice = await createInvoice(
      CLINIC,
      {
        patientId: clinicPatientId,
        items: [
          { description: "Consultation", quantity: 1, unitPriceMinor: 50000 },
          { description: "Dressing", quantity: 2, unitPriceMinor: 15000 },
        ],
        discountMinor: 10000,
      },
      adminId,
    );

    expect(invoice.totalMinor).toBe(70000);
    expect(invoice.number).toMatch(/^INV-\d{4}-\d{5}$/);

    const issued = await issueInvoice(CLINIC, invoice.id, adminId);
    // The tenant has a merchant profile in the demo seed, so a reference exists.
    expect(issued.refCode === null || issued.refCode.startsWith("HL")).toBe(true);

    await voidInvoice(CLINIC, invoice.id, adminId, `spec void ${SUFFIX}`);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });

    // Still there. A financial row that vanishes is indistinguishable from one
    // that never existed.
    expect(after.status).toBe("VOID");
    expect(after.deletedAt).toBeNull();

    const requests = await prisma.paymentRequest.findMany({ where: { invoiceId: invoice.id } });
    expect(requests.every((r) => r.status === "CANCELLED")).toBe(true);
  });

  it("refuses to issue a draft twice", async () => {
    const invoice = await createInvoice(
      CLINIC,
      {
        patientId: clinicPatientId,
        items: [{ description: "Review", quantity: 1, unitPriceMinor: 20000 }],
      },
      adminId,
    );

    await issueInvoice(CLINIC, invoice.id, adminId);
    await expect(issueInvoice(CLINIC, invoice.id, adminId)).rejects.toThrow(/only a draft/i);
  });
});

describe("admissions", () => {
  it("refuses a second open admission and refuses an occupied bed", async () => {
    const department = await createDepartment(HOSPITAL, { name: `Ward ${SUFFIX}` }, adminId);

    const admission = await admitPatient(
      HOSPITAL,
      { patientId: hospitalPatientId, departmentId: department.id, wardName: "A", bedNo: "12" },
      adminId,
    );

    await expect(
      admitPatient(HOSPITAL, { patientId: hospitalPatientId }, adminId),
    ).rejects.toThrow(/already admitted/i);

    const second = await registerPatient(
      HOSPITAL,
      { fullName: `Second Inpatient ${SUFFIX}` },
      adminId,
    );

    await expect(
      admitPatient(
        HOSPITAL,
        { patientId: second.patientId, wardName: "A", bedNo: "12" },
        adminId,
      ),
    ).rejects.toThrow(/already occupied/i);

    await dischargeAdmission(
      HOSPITAL,
      admission.id,
      { dischargeSummary: `Recovered and sent home ${SUFFIX}` },
      adminId,
    );

    const after = await prisma.admission.findUniqueOrThrow({ where: { id: admission.id } });
    expect(after.status).toBe("DISCHARGED");
    expect(after.dischargedAt).not.toBeNull();

    // The bed is free again once the stay is closed.
    await expect(
      admitPatient(HOSPITAL, { patientId: second.patientId, wardName: "A", bedNo: "12" }, adminId),
    ).resolves.toBeTruthy();
  });
});

describe("diagnostic results", () => {
  it("keeps a result invisible to the patient until a human verifies it", async () => {
    const patient = await registerPatient(
      DIAGNOSTIC,
      { fullName: `Lab Patient ${SUFFIX}`, phone: "9830000003" },
      adminId,
    );

    const item = await createCatalogItem(
      DIAGNOSTIC,
      { name: `CBC ${SUFFIX}`, priceMinor: 45000, sampleType: "Blood", preparation: "None" },
      adminId,
    );

    const booking = await createBooking(
      DIAGNOSTIC,
      { patientId: patient.patientId, catalogItemId: item.id },
      adminId,
    );

    const report = await createReport(
      DIAGNOSTIC,
      {
        patientId: patient.patientId,
        title: `CBC ${SUFFIX}`,
        bookingId: booking.id,
        findings: [
          { label: "Haemoglobin", value: "9.1", unit: "g/dL", referenceRange: "12.0-15.5", flag: "LOW" },
          { label: "WBC", value: "7200", unit: "/µL", flag: "NORMAL" },
        ],
      },
      adminId,
    );

    const entered = await prisma.diagnosticReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(entered.status).toBe("AWAITING_VERIFICATION");
    expect(entered.verifiedAt).toBeNull();

    // This is the query the patient's screen runs.
    const patientVisible = await prisma.diagnosticReport.count({
      where: { patientId: patient.patientId, status: "PUBLISHED", deletedAt: null },
    });
    expect(patientVisible).toBe(0);

    await publishReport(DIAGNOSTIC, report.id, adminId);

    const published = await prisma.diagnosticReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(published.status).toBe("PUBLISHED");
    expect(published.verifiedById).toBe(adminId);

    // Verification is a human confirming each line, so the findings stop being
    // provisional at the same moment.
    const findings = await prisma.reportFinding.findMany({ where: { reportId: report.id } });
    expect(findings.every((f) => f.confirmedAt !== null)).toBe(true);

    const bookingAfter = await prisma.testBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingAfter.status).toBe("REPORT_READY");

    await expect(publishReport(DIAGNOSTIC, report.id, adminId)).rejects.toThrow(/already published/i);
  });
});

describe("pharmacy", () => {
  it("refuses a scheduled drug without a prescription", async () => {
    const product = await createProduct(
      PHARMACY,
      { name: `Alprazolam ${SUFFIX}`, isScheduled: true },
      adminId,
    );

    await addBatch(
      PHARMACY,
      {
        productId: product.id,
        batchNo: `B1-${SUFFIX}`,
        expiryAt: new Date(Date.now() + 365 * 86_400_000),
        quantity: 50,
      },
      adminId,
    );

    await expect(
      createOrder(
        PHARMACY,
        { items: [{ productId: product.id, quantity: 5, unitPriceMinor: 2000 }] },
        adminId,
      ),
    ).rejects.toThrow(/require a prescription/i);
  });

  it("moves stock exactly once, at PACKED", async () => {
    const product = await createProduct(PHARMACY, { name: `Paracetamol ${SUFFIX}` }, adminId);

    await addBatch(
      PHARMACY,
      {
        productId: product.id,
        batchNo: `B2-${SUFFIX}`,
        expiryAt: new Date(Date.now() + 200 * 86_400_000),
        quantity: 100,
        mrpMinor: 2500,
      },
      adminId,
    );

    const batch = await prisma.stockBatch.findFirstOrThrow({
      where: { productId: product.id, batchNo: `B2-${SUFFIX}` },
    });

    const order = await createOrder(
      PHARMACY,
      {
        items: [{ productId: product.id, batchId: batch.id, quantity: 10, unitPriceMinor: 2500 }],
      },
      adminId,
    );

    // Placing an order strands no stock.
    expect((await prisma.stockBatch.findUniqueOrThrow({ where: { id: batch.id } })).quantity).toBe(100);

    await verifyOrder(PHARMACY, order.id, adminId);
    expect((await prisma.stockBatch.findUniqueOrThrow({ where: { id: batch.id } })).quantity).toBe(100);

    await setOrderStatus(PHARMACY, order.id, "PACKED", adminId);
    expect((await prisma.stockBatch.findUniqueOrThrow({ where: { id: batch.id } })).quantity).toBe(90);

    // Dispatching and delivering must not take it again.
    await setOrderStatus(PHARMACY, order.id, "DISPATCHED", adminId);
    await setOrderStatus(PHARMACY, order.id, "DELIVERED", adminId);
    expect((await prisma.stockBatch.findUniqueOrThrow({ where: { id: batch.id } })).quantity).toBe(90);
  });

  it("never counts expired stock as available", async () => {
    const product = await createProduct(PHARMACY, { name: `Expired Syrup ${SUFFIX}` }, adminId);

    // Written directly: addBatch refuses an already-expired date, which is the
    // right guard for data entry but not what we need to set up this case.
    await prisma.stockBatch.create({
      data: {
        productId: product.id,
        batchNo: `OLD-${SUFFIX}`,
        expiryAt: new Date(Date.now() - 86_400_000),
        quantity: 40,
      },
    });

    const products = await listProducts(PHARMACY, `Expired Syrup ${SUFFIX}`);
    const found = products.find((p) => p.id === product.id)!;

    expect(found.inStock).toBe(0);
    expect(found.expiredQuantity).toBe(40);
  });

  it("refuses to accept a batch that has already expired", async () => {
    const product = await createProduct(PHARMACY, { name: `Late Batch ${SUFFIX}` }, adminId);

    await expect(
      addBatch(
        PHARMACY,
        {
          productId: product.id,
          batchNo: `LATE-${SUFFIX}`,
          expiryAt: new Date(Date.now() - 86_400_000),
          quantity: 10,
        },
        adminId,
      ),
    ).rejects.toThrow(/already expired/i);
  });
});

describe("provisioning scope", () => {
  it("confines a provider admin to their own tenant", async () => {
    const clinicAdmin = await createUser(
      { displayName: `Clinic Admin ${SUFFIX}`, role: "CLINIC_ADMIN", orgId: CLINIC },
      platformScope(adminId),
    );

    const scope = tenantScope(clinicAdmin.userId, CLINIC);

    // Their own tenant: allowed, and the org id is taken from the scope rather
    // than the argument.
    const staff = await createUser(
      { displayName: `Clinic Staff ${SUFFIX}`, role: "CLINIC_STAFF", orgId: HOSPITAL },
      scope,
    );

    const created = await prisma.user.findUniqueOrThrow({ where: { id: staff.userId } });
    expect(created.orgId).toBe(CLINIC);

    // A platform role is out of reach entirely.
    await expect(
      createUser({ displayName: `Sneaky Admin ${SUFFIX}`, role: "SUPER_ADMIN" }, scope),
    ).rejects.toThrow(/staff accounts for your organisation/i);

    // And so is anyone outside the tenant — reported as NOT_FOUND.
    await expect(resetPassword(adminId, scope, "spec")).rejects.toThrow(/does not exist/i);

    // Their own staff member is reachable.
    await expect(resetPassword(staff.userId, scope, "spec")).resolves.toBeTruthy();
  });
});
