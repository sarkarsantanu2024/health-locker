import "../scripts/load-env";

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";

/**
 * DEMO DATA — realistic content so every screen shows something in a client
 * demo. Idempotent: every row uses a stable `demo-*` id, so re-running updates
 * rather than duplicating.
 *
 *   pnpm db:demo            populate
 *   pnpm db:demo --reset    wipe demo rows first, then populate
 *
 * Refuses to run with NODE_ENV=production: this writes fictional medical records,
 * and they must never end up mixed with real patient data.
 */

const prisma = new PrismaClient();
const reset = process.argv.includes("--reset");

const DEMO_PASSWORD_NOTE = "Demo accounts all share one password so a demo is not derailed by typing.";

/** Documented in the repo and in PROGRESS.md, so re-seeding never invalidates it. */
const DEFAULT_DEMO_PASSWORD = "healthlocker2026";

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(10, 30, 0, 0);
  return date;
}

function daysAhead(days: number): Date {
  return daysAgo(-days);
}

async function wipe(): Promise<void> {
  const patients = await prisma.patient.findMany({
    where: { id: { startsWith: "demo-" } },
    select: { id: true },
  });
  const patientIds = patients.map((p) => p.id);

  await prisma.paymentSubmission.deleteMany({
    where: { paymentRequest: { OR: [{ patientId: { in: patientIds } }, { refCode: { startsWith: "HL" } }] } },
  });
  await prisma.paymentRequest.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { patientId: { in: patientIds } } } });
  await prisma.invoice.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.reportFinding.deleteMany({ where: { report: { patientId: { in: patientIds } } } });
  await prisma.diagnosticReport.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.prescriptionItem.deleteMany({ where: { prescription: { patientId: { in: patientIds } } } });
  await prisma.prescription.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.medicationDose.deleteMany({ where: { schedule: { patientId: { in: patientIds } } } });
  await prisma.medicationSchedule.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.notificationLog.deleteMany({
    where: { notification: { id: { startsWith: "demo-notif-" } } },
  });
  await prisma.notification.deleteMany({ where: { id: { startsWith: "demo-notif-" } } });
  await prisma.encounter.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.appointment.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.vaccination.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.vitalReading.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.allergy.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.condition.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.expense.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.insurancePolicy.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.emergencyCard.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.testBooking.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.pharmacyOrderItem.deleteMany({ where: { order: { patientId: { in: patientIds } } } });
  await prisma.pharmacyOrder.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.stockBatch.deleteMany({ where: { product: { id: { startsWith: "demo-" } } } });
  await prisma.product.deleteMany({ where: { id: { startsWith: "demo-" } } });
  await prisma.testCatalogItem.deleteMany({ where: { id: { startsWith: "demo-" } } });

  process.stdout.write("  wiped previous demo rows\n");
}

/** One shared password across demo accounts — a demo should not stall on typing. */
async function upsertDemoUsers(password: string): Promise<void> {
  const passwordHash = await hashPassword(password);

  const users = [
    { id: "demo-user-priya", username: "priya.demo", displayName: "Priya Sharma", role: "PATIENT" as const, orgId: null, patientId: "demo-patient-priya" },
    { id: "demo-user-clinic", username: "clinic.demo", displayName: "Dr. Anita Roy", role: "CLINIC_ADMIN" as const, orgId: "org-demo-clinic", patientId: null },
    { id: "demo-user-hospital", username: "hospital.demo", displayName: "Meridian Admin", role: "HOSPITAL_ADMIN" as const, orgId: "org-demo-hospital", patientId: null },
    { id: "demo-user-diagnostic", username: "diagnostic.demo", displayName: "Precision Admin", role: "DIAGNOSTIC_ADMIN" as const, orgId: "org-demo-diagnostic", patientId: null },
    { id: "demo-user-pharmacy", username: "pharmacy.demo", displayName: "Wellness Admin", role: "PHARMACY_ADMIN" as const, orgId: "org-demo-pharmacy", patientId: null },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: { passwordHash, mustChangePassword: false, status: "ACTIVE", displayName: user.displayName },
      create: {
        id: user.id,
        username: user.username,
        passwordHash,
        displayName: user.displayName,
        role: user.role,
        orgId: user.orgId,
        // Off for demos: a forced password change on every account derails one.
        mustChangePassword: false,
        status: "ACTIVE",
        phone: "+919800000100",
      },
    });

    if (user.patientId) {
      await prisma.patient.update({ where: { id: user.patientId }, data: { userId: user.id } });
    }
  }

  process.stdout.write(`  users: ${users.length}\n`);
}

async function clinicalHistory(): Promise<void> {
  const priya = "demo-patient-priya";
  const aarav = "demo-patient-aarav";
  const sunita = "demo-patient-sunita";

  await prisma.allergy.createMany({
    data: [
      { patientId: priya, substance: "Penicillin", reaction: "Skin rash and swelling", severity: "HIGH", notedAt: daysAgo(400) },
      { patientId: priya, substance: "Dust mites", reaction: "Sneezing, watery eyes", severity: "LOW", notedAt: daysAgo(300) },
      { patientId: aarav, substance: "Peanuts", reaction: "Anaphylaxis — carries an EpiPen", severity: "CRITICAL", notedAt: daysAgo(700) },
      { patientId: sunita, substance: "Sulfa drugs", reaction: "Hives", severity: "MEDIUM", notedAt: daysAgo(900) },
    ],
    skipDuplicates: true,
  });

  await prisma.condition.createMany({
    data: [
      { patientId: priya, name: "Hypothyroidism", code: "E03.9", status: "ACTIVE", diagnosedAt: daysAgo(520) },
      { patientId: priya, name: "Iron deficiency anaemia", status: "RESOLVED", diagnosedAt: daysAgo(800), resolvedAt: daysAgo(600) },
      { patientId: sunita, name: "Type 2 diabetes mellitus", code: "E11.9", status: "ACTIVE", diagnosedAt: daysAgo(1500) },
      { patientId: sunita, name: "Hypertension", code: "I10", status: "ACTIVE", diagnosedAt: daysAgo(1200) },
      { patientId: aarav, name: "Asthma (mild, intermittent)", code: "J45.2", status: "ACTIVE", diagnosedAt: daysAgo(400) },
    ],
    skipDuplicates: true,
  });

  await prisma.vitalReading.createMany({
    data: [
      { patientId: priya, type: "BLOOD_PRESSURE", value: "118/76", unit: "mmHg", recordedAt: daysAgo(3) },
      { patientId: priya, type: "WEIGHT", value: "61.5", unit: "kg", recordedAt: daysAgo(3) },
      { patientId: priya, type: "HEART_RATE", value: "74", unit: "bpm", recordedAt: daysAgo(3) },
      { patientId: sunita, type: "BLOOD_GLUCOSE", value: "162", unit: "mg/dL", recordedAt: daysAgo(2) },
      { patientId: sunita, type: "BLOOD_PRESSURE", value: "148/92", unit: "mmHg", recordedAt: daysAgo(2) },
      { patientId: aarav, type: "TEMPERATURE", value: "38.4", unit: "°C", recordedAt: daysAgo(9) },
    ],
    skipDuplicates: true,
  });

  await prisma.vaccination.createMany({
    data: [
      { patientId: aarav, vaccineName: "MMR", doseNumber: 2, administeredAt: daysAgo(365), administeredBy: "Sunrise Family Clinic" },
      { patientId: aarav, vaccineName: "DTaP booster", doseNumber: 4, administeredAt: daysAgo(180), administeredBy: "Sunrise Family Clinic", nextDueAt: daysAhead(1460) },
      { patientId: priya, vaccineName: "Influenza (annual)", doseNumber: 1, administeredAt: daysAgo(120), administeredBy: "Sunrise Family Clinic", nextDueAt: daysAhead(245) },
      { patientId: sunita, vaccineName: "Pneumococcal", doseNumber: 1, administeredAt: daysAgo(220), administeredBy: "Meridian Multispeciality Hospital" },
    ],
    skipDuplicates: true,
  });

  // A visit that produced a prescription, so the timeline shows a coherent story.
  await prisma.encounter.upsert({
    where: { id: "demo-encounter-priya-1" },
    update: {},
    create: {
      id: "demo-encounter-priya-1",
      orgId: "org-demo-clinic",
      patientId: priya,
      practitionerId: "prac-demo-anita",
      type: "OPD",
      occurredAt: daysAgo(14),
      chiefComplaint: "Fatigue and hair fall for six weeks",
      examination: "Pulse 72, BP 118/76. No goitre. Pallor absent.",
      diagnosis: "Hypothyroidism — dose review",
      advice: "Repeat TSH in 8 weeks. Take tablet on an empty stomach.",
      followUpAt: daysAhead(45),
    },
  });

  const prescriptions = [
    {
      id: "demo-rx-priya-1",
      patientId: priya,
      orgId: "org-demo-clinic",
      practitionerId: "prac-demo-anita",
      encounterId: "demo-encounter-priya-1",
      issuedAt: daysAgo(14),
      items: [
        { drugName: "Thyronorm", dose: "75mcg", frequency: "1-0-0", duration: "90 days", instructions: "Empty stomach, 30 min before breakfast" },
        { drugName: "Vitamin D3", dose: "60000 IU", frequency: "weekly", duration: "8 weeks" },
      ],
    },
    {
      id: "demo-rx-aarav-1",
      patientId: aarav,
      orgId: "org-demo-clinic",
      practitionerId: "prac-demo-anita",
      issuedAt: daysAgo(9),
      items: [
        { drugName: "Amoxicillin", dose: "250mg", frequency: "1-0-1", duration: "5 days", instructions: "After food" },
        { drugName: "Paracetamol syrup", dose: "5ml", frequency: "sos", duration: "3 days" },
      ],
    },
    {
      id: "demo-rx-sunita-1",
      patientId: sunita,
      orgId: "org-demo-hospital",
      issuedAt: daysAgo(30),
      prescriberName: "Dr. S. Banerjee",
      items: [
        { drugName: "Metformin", dose: "500mg", frequency: "1-0-1", duration: "90 days" },
        { drugName: "Amlodipine", dose: "5mg", frequency: "1-0-0", duration: "90 days" },
        // Low confidence + unconfirmed: shows the "needs review" state in the UI.
        { drugName: "Atorvastatin", dose: "10mg", frequency: "0-0-1", aiConfidence: 0.52, aiProvider: "mock", aiModel: "mock-v1" },
      ],
    },
  ];

  for (const rx of prescriptions) {
    const { items, ...header } = rx;
    await prisma.prescription.upsert({ where: { id: rx.id }, update: {}, create: header });
    await prisma.prescriptionItem.deleteMany({ where: { prescriptionId: rx.id } });
    await prisma.prescriptionItem.createMany({
      data: items.map((item) => ({
        prescriptionId: rx.id,
        ...item,
        confirmedAt: "aiConfidence" in item ? null : new Date(),
      })),
    });
  }

  await prisma.medicationSchedule.upsert({
    where: { id: "demo-sched-priya-1" },
    update: {},
    create: {
      id: "demo-sched-priya-1",
      patientId: priya,
      drugName: "Thyronorm",
      dose: "75mcg",
      times: ["07:00"],
      startDate: daysAgo(14),
      endDate: daysAhead(76),
      status: "ACTIVE",
    },
  });

  await prisma.medicationSchedule.upsert({
    where: { id: "demo-sched-sunita-1" },
    update: {},
    create: {
      id: "demo-sched-sunita-1",
      patientId: sunita,
      drugName: "Metformin",
      dose: "500mg",
      times: ["08:00", "20:00"],
      startDate: daysAgo(30),
      status: "ACTIVE",
    },
  });

  process.stdout.write("  clinical history: allergies, conditions, vitals, vaccinations, 3 prescriptions\n");
}

async function reportsAndBookings(): Promise<void> {
  const reports = [
    {
      id: "demo-report-priya-1",
      patientId: "demo-patient-priya",
      orgId: "org-demo-diagnostic",
      title: "Thyroid profile (T3, T4, TSH)",
      reportType: "Biochemistry",
      reportedAt: daysAgo(16),
      findings: [
        { label: "TSH", value: "6.8", unit: "µIU/mL", referenceRange: "0.4-4.0 µIU/mL", flag: "HIGH" as const },
        { label: "Free T4", value: "0.9", unit: "ng/dL", referenceRange: "0.8-1.8 ng/dL", flag: "NORMAL" as const },
        { label: "Free T3", value: "2.9", unit: "pg/mL", referenceRange: "2.3-4.2 pg/mL", flag: "NORMAL" as const },
      ],
    },
    {
      id: "demo-report-sunita-1",
      patientId: "demo-patient-sunita",
      orgId: "org-demo-diagnostic",
      title: "HbA1c and lipid profile",
      reportType: "Biochemistry",
      reportedAt: daysAgo(31),
      findings: [
        { label: "HbA1c", value: "8.2", unit: "%", referenceRange: "< 5.7 %", flag: "CRITICAL" as const },
        { label: "Total cholesterol", value: "218", unit: "mg/dL", referenceRange: "< 200 mg/dL", flag: "HIGH" as const },
        { label: "HDL", value: "44", unit: "mg/dL", referenceRange: "> 40 mg/dL", flag: "NORMAL" as const },
      ],
    },
    {
      id: "demo-report-priya-2",
      patientId: "demo-patient-priya",
      orgId: "org-demo-diagnostic",
      title: "Complete blood count",
      reportType: "Haematology",
      reportedAt: daysAgo(4),
      findings: [
        { label: "Haemoglobin", value: "12.6", unit: "g/dL", referenceRange: "12.0-15.0 g/dL", flag: "NORMAL" as const },
        { label: "WBC", value: "7200", unit: "/µL", referenceRange: "4000-11000 /µL", flag: "NORMAL" as const },
      ],
    },
  ];

  for (const report of reports) {
    const { findings, ...header } = report;
    await prisma.diagnosticReport.upsert({
      where: { id: report.id },
      update: {},
      create: { ...header, status: "PUBLISHED", verifiedAt: header.reportedAt },
    });
    await prisma.reportFinding.deleteMany({ where: { reportId: report.id } });
    await prisma.reportFinding.createMany({
      data: findings.map((finding) => ({ reportId: report.id, ...finding, confirmedAt: new Date() })),
    });
  }

  const catalog = [
    { id: "demo-test-cbc", orgId: "org-demo-diagnostic", name: "Complete blood count", code: "CBC", priceMinor: 45000, sampleType: "Blood (EDTA)", tatHours: 6 },
    { id: "demo-test-thyroid", orgId: "org-demo-diagnostic", name: "Thyroid profile", code: "TFT", priceMinor: 70000, sampleType: "Blood (serum)", tatHours: 12 },
    { id: "demo-test-hba1c", orgId: "org-demo-diagnostic", name: "HbA1c", code: "HBA1C", priceMinor: 55000, sampleType: "Blood (EDTA)", tatHours: 8 },
    { id: "demo-test-lipid", orgId: "org-demo-diagnostic", name: "Lipid profile", code: "LIPID", priceMinor: 80000, sampleType: "Blood (serum)", tatHours: 12, preparation: "12 hours fasting" },
  ];

  for (const item of catalog) {
    await prisma.testCatalogItem.upsert({ where: { id: item.id }, update: item, create: item });
  }

  await prisma.testBooking.upsert({
    where: { id: "demo-booking-1" },
    update: {},
    create: {
      id: "demo-booking-1",
      orgId: "org-demo-diagnostic",
      patientId: "demo-patient-sunita",
      catalogItemId: "demo-test-hba1c",
      status: "SAMPLE_COLLECTED",
      scheduledAt: daysAgo(1),
      homeCollection: true,
      collectedAt: daysAgo(1),
    },
  });

  await prisma.testBooking.upsert({
    where: { id: "demo-booking-2" },
    update: {},
    create: {
      id: "demo-booking-2",
      orgId: "org-demo-diagnostic",
      patientId: "demo-patient-priya",
      catalogItemId: "demo-test-thyroid",
      status: "BOOKED",
      scheduledAt: daysAhead(3),
    },
  });

  process.stdout.write("  diagnostics: 3 reports with findings, 4 catalogue items, 2 bookings\n");
}

async function appointmentsAndAdmissions(): Promise<void> {
  const appointments = [
    { id: "demo-appt-1", orgId: "org-demo-clinic", patientId: "demo-patient-priya", practitionerId: "prac-demo-anita", scheduledAt: daysAhead(2), status: "SCHEDULED" as const, reason: "Thyroid review" },
    { id: "demo-appt-2", orgId: "org-demo-clinic", patientId: "demo-patient-aarav", practitionerId: "prac-demo-anita", scheduledAt: daysAhead(0), status: "SCHEDULED" as const, reason: "Cough follow-up" },
    { id: "demo-appt-3", orgId: "org-demo-clinic", patientId: "demo-patient-sunita", practitionerId: "prac-demo-anita", scheduledAt: daysAgo(14), status: "COMPLETED" as const, reason: "Diabetes review" },
    { id: "demo-appt-4", orgId: "org-demo-clinic", patientId: "demo-patient-priya", practitionerId: "prac-demo-anita", scheduledAt: daysAgo(30), status: "NO_SHOW" as const, reason: "Routine check" },
    { id: "demo-appt-5", orgId: "org-demo-hospital", patientId: "demo-patient-sunita", scheduledAt: daysAhead(6), status: "SCHEDULED" as const, type: "FOLLOW_UP" as const, reason: "Cardiology follow-up" },
  ];

  for (const appointment of appointments) {
    await prisma.appointment.upsert({ where: { id: appointment.id }, update: {}, create: appointment });
  }

  await prisma.admission.upsert({
    where: { id: "demo-admission-1" },
    update: {},
    create: {
      id: "demo-admission-1",
      orgId: "org-demo-hospital",
      patientId: "demo-patient-sunita",
      departmentId: "dept-demo-general",
      admittedAt: daysAgo(60),
      dischargedAt: daysAgo(56),
      status: "DISCHARGED",
      wardName: "General Ward B",
      bedNo: "B-14",
      admissionReason: "Uncontrolled hyperglycaemia with dehydration",
      dischargeSummary: "Stabilised on insulin sliding scale, transitioned to oral metformin. Advised dietary review.",
    },
  });

  process.stdout.write("  scheduling: 5 appointments, 1 completed admission\n");
}

async function pharmacy(): Promise<void> {
  const products = [
    { id: "demo-prod-1", orgId: "org-demo-pharmacy", name: "Thyronorm 75mcg", sku: "THY75", manufacturer: "Abbott", form: "Tablet", strength: "75mcg" },
    { id: "demo-prod-2", orgId: "org-demo-pharmacy", name: "Metformin 500mg", sku: "MET500", manufacturer: "USV", form: "Tablet", strength: "500mg" },
    { id: "demo-prod-3", orgId: "org-demo-pharmacy", name: "Amoxicillin 250mg", sku: "AMX250", manufacturer: "Cipla", form: "Capsule", strength: "250mg", isScheduled: true },
    { id: "demo-prod-4", orgId: "org-demo-pharmacy", name: "Paracetamol syrup 60ml", sku: "PCM60", manufacturer: "GSK", form: "Syrup" },
    { id: "demo-prod-5", orgId: "org-demo-pharmacy", name: "Amlodipine 5mg", sku: "AML5", manufacturer: "Sun Pharma", form: "Tablet", strength: "5mg" },
  ];

  for (const product of products) {
    await prisma.product.upsert({ where: { id: product.id }, update: product, create: product });
  }

  const batches = [
    { id: "demo-batch-1", productId: "demo-prod-1", batchNo: "TH24A", expiryAt: daysAhead(400), quantity: 120, mrpMinor: 18500 },
    { id: "demo-batch-2", productId: "demo-prod-2", batchNo: "MT23K", expiryAt: daysAhead(25), quantity: 40, mrpMinor: 4200 },
    { id: "demo-batch-3", productId: "demo-prod-3", batchNo: "AX24C", expiryAt: daysAhead(210), quantity: 8, mrpMinor: 9800 },
    { id: "demo-batch-4", productId: "demo-prod-4", batchNo: "PC24B", expiryAt: daysAhead(-10), quantity: 15, mrpMinor: 6500 },
    { id: "demo-batch-5", productId: "demo-prod-5", batchNo: "AM24F", expiryAt: daysAhead(520), quantity: 200, mrpMinor: 7400 },
  ];

  for (const batch of batches) {
    await prisma.stockBatch.upsert({ where: { id: batch.id }, update: batch, create: batch });
  }

  await prisma.pharmacyOrder.upsert({
    where: { id: "demo-order-1" },
    update: {},
    create: {
      id: "demo-order-1",
      orgId: "org-demo-pharmacy",
      patientId: "demo-patient-sunita",
      status: "DISPATCHED",
      totalMinor: 11600,
      placedAt: daysAgo(2),
      deliveryAddress: "44 Southern Avenue, Kolkata 700029",
      items: {
        create: [
          { productId: "demo-prod-2", batchId: "demo-batch-2", quantity: 2, unitPriceMinor: 4200, amountMinor: 8400 },
          { productId: "demo-prod-5", batchId: "demo-batch-5", quantity: 1, unitPriceMinor: 3200, amountMinor: 3200 },
        ],
      },
    },
  });

  // Deliberate demo talking points: one batch expiring in 25 days, one already
  // expired, one below reorder level.
  process.stdout.write("  pharmacy: 5 products, 5 batches (1 expired, 1 near expiry, 1 low stock), 1 order\n");
}

async function moneyTrail(): Promise<void> {
  const invoices = [
    { id: "demo-inv-1", number: "SFC-2026-0101", orgId: "org-demo-clinic", patientId: "demo-patient-priya", status: "PAID" as const, subtotalMinor: 60000, totalMinor: 60000, issuedAt: daysAgo(14), paidAt: daysAgo(14), items: [{ description: "Consultation — Dr. Anita Roy", quantity: 1, unitPriceMinor: 60000, amountMinor: 60000 }] },
    { id: "demo-inv-2", number: "SFC-2026-0114", orgId: "org-demo-clinic", patientId: "demo-patient-aarav", status: "ISSUED" as const, subtotalMinor: 45000, totalMinor: 45000, issuedAt: daysAgo(9), dueAt: daysAhead(5), items: [{ description: "Paediatric consultation", quantity: 1, unitPriceMinor: 45000, amountMinor: 45000 }] },
    { id: "demo-inv-3", number: "MMH-2026-0042", orgId: "org-demo-hospital", patientId: "demo-patient-sunita", status: "OVERDUE" as const, subtotalMinor: 1850000, taxMinor: 0, totalMinor: 1850000, issuedAt: daysAgo(56), dueAt: daysAgo(26), items: [
      { description: "Room charges — General Ward (4 days)", quantity: 4, unitPriceMinor: 250000, amountMinor: 1000000, departmentId: "dept-demo-general" },
      { description: "Physician visits", quantity: 6, unitPriceMinor: 80000, amountMinor: 480000, departmentId: "dept-demo-general" },
      { description: "Investigations", quantity: 1, unitPriceMinor: 370000, amountMinor: 370000 },
    ] },
  ];

  for (const invoice of invoices) {
    const { items, ...header } = invoice;
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
    await prisma.invoice.upsert({ where: { id: invoice.id }, update: header, create: header });
    await prisma.invoiceItem.createMany({
      data: items.map((item) => ({ invoiceId: invoice.id, ...item })),
    });
  }

  await prisma.expense.createMany({
    data: [
      { patientId: "demo-patient-priya", category: "CONSULTATION", amountMinor: 60000, incurredAt: daysAgo(14), vendor: "Sunrise Family Clinic" },
      { patientId: "demo-patient-priya", category: "MEDICINE", amountMinor: 18500, incurredAt: daysAgo(13), vendor: "Wellness Pharmacy" },
      { patientId: "demo-patient-priya", category: "DIAGNOSTIC", amountMinor: 70000, incurredAt: daysAgo(16), vendor: "Precision Diagnostics" },
      { patientId: "demo-patient-sunita", category: "HOSPITALIZATION", amountMinor: 1850000, incurredAt: daysAgo(56), vendor: "Meridian Multispeciality Hospital" },
    ],
    skipDuplicates: true,
  });

  // Two payments waiting in the verification queue, so the admin screen has work.
  const platform = await prisma.merchantPaymentProfile.findFirst({
    where: { orgId: null, isActive: true },
    select: { id: true },
  });

  const pending = [
    { id: "demo-payreq-1", refCode: "HLDEMO2345", amountMinor: 49900, description: "Family plan — annual", patientId: "demo-patient-priya", utr: "412987654321", phone: "+919800000101", submittedAt: daysAgo(1) },
    { id: "demo-payreq-2", refCode: "HLDEMO6789", amountMinor: 199900, description: "Provider Starter — annual", orgId: "org-demo-clinic", utr: "556677889900", phone: "+919800000001", submittedAt: daysAgo(0) },
  ];

  for (const item of pending) {
    await prisma.paymentSubmission.deleteMany({ where: { paymentRequest: { refCode: item.refCode } } });
    await prisma.paymentRequest.deleteMany({ where: { refCode: item.refCode } });

    const request = await prisma.paymentRequest.create({
      data: {
        id: item.id,
        refCode: item.refCode,
        amountMinor: item.amountMinor,
        description: item.description,
        purpose: "SUBSCRIPTION",
        status: "SUBMITTED",
        patientId: item.patientId ?? null,
        orgId: item.orgId ?? null,
        merchantProfileId: platform?.id ?? null,
      },
      select: { id: true },
    });

    await prisma.paymentSubmission.create({
      data: {
        paymentRequestId: request.id,
        utr: item.utr,
        method: "UPI",
        amountMinor: item.amountMinor,
        paidAt: item.submittedAt,
        submittedAt: item.submittedAt,
        submitterPhone: item.phone,
        status: "SUBMITTED",
      },
    });
  }

  // An unpaid request the demo can walk through live: open /pay/HLDEMOLIVE.
  await prisma.paymentSubmission.deleteMany({ where: { paymentRequest: { refCode: "HLDEMOLIVE" } } });
  await prisma.paymentRequest.deleteMany({ where: { refCode: "HLDEMOLIVE" } });
  await prisma.paymentRequest.create({
    data: {
      refCode: "HLDEMOLIVE",
      amountMinor: 49900,
      description: "Family plan — annual",
      purpose: "SUBSCRIPTION",
      status: "PENDING",
      patientId: "demo-patient-priya",
      merchantProfileId: platform?.id ?? null,
    },
  });

  await prisma.insurancePolicy.upsert({
    where: { id: "demo-policy-1" },
    update: {},
    create: {
      id: "demo-policy-1",
      patientId: "demo-patient-priya",
      insurerName: "Star Health",
      // Encrypted at rest like every other financial identifier.
      policyNoEnc: (await import("@/lib/crypto")).encrypt("SH-2026-4471902"),
      planName: "Family Health Optima",
      sumInsuredMinor: 50000000,
      premiumMinor: 2200000,
      validFrom: daysAgo(120),
      validTo: daysAhead(245),
      tpaName: "Medi Assist",
    },
  });

  process.stdout.write("  money: 3 invoices, 4 expenses, 2 payments awaiting review, 1 live pay link, 1 policy\n");
}

async function accessRequests(): Promise<void> {
  await prisma.accessRequest.deleteMany({ where: { note: { contains: "demo seed" } } });

  await prisma.accessRequest.createMany({
    data: [
      { fullName: "Rohit Mehta", phone: "9830011223", city: "Kolkata", desiredPlanId: "plan-patient-family", status: "AWAITING_PAYMENT", note: "demo seed — signed up, payment pending" },
      { fullName: "Fatima Sheikh", phone: "9830044556", city: "Howrah", desiredPlanId: "plan-patient-free", status: "PENDING", note: "demo seed — free plan, needs review" },
      { fullName: "Bright Smile Dental", phone: "9830077889", city: "Kolkata", orgType: "CLINIC", desiredPlanId: "plan-provider-starter", status: "AWAITING_PAYMENT", note: "demo seed — provider enquiry" },
    ],
  });

  process.stdout.write("  onboarding: 3 access requests awaiting action\n");
}

/**
 * Doses and notifications.
 *
 * Runs last, because it materialises doses from the schedules created above and
 * reads the notification recipients from the demo users. Without this the
 * medicines screen and the header bell are both empty, which reads as broken
 * rather than as "nothing due".
 */
async function dosesAndNotifications(): Promise<void> {
  const { materialiseAllDue } = await import("../src/modules/patient/medication.service");

  const created = await materialiseAllDue();

  // One dose earlier today already taken, so the adherence figure is not 0/0.
  const earlier = await prisma.medicationDose.findFirst({
    where: { schedule: { deletedAt: null }, dueAt: { lte: new Date() } },
    orderBy: { dueAt: "desc" },
    select: { id: true },
  });

  if (earlier) {
    await prisma.medicationDose.update({
      where: { id: earlier.id },
      data: { status: "TAKEN", takenAt: new Date() },
    });
  }

  const priyaUser = await prisma.user.findUnique({
    where: { username: "priya.demo" },
    select: { id: true },
  });

  if (priyaUser) {
    const notices = [
      {
        id: "demo-notif-report",
        type: "REPORT_READY" as const,
        title: "Lipid profile is ready",
        body: "2 values are outside the usual range. Please discuss this with your doctor.",
        data: { url: "/patient/reports" },
        readAt: null,
      },
      {
        id: "demo-notif-payment",
        type: "PAYMENT_DUE" as const,
        title: "Invoice INV-2026-00001",
        body: "₹1,480.00 · Sunrise Family Clinic",
        data: { url: "/patient/billing" },
        readAt: null,
      },
      {
        id: "demo-notif-medicine",
        type: "MEDICINE_REMINDER" as const,
        title: "Time for Thyronorm",
        body: "75mcg · due at 7:00 am",
        data: { url: "/patient/medicines" },
        readAt: daysAgo(1),
      },
    ];

    for (const notice of notices) {
      await prisma.notification.upsert({
        where: { id: notice.id },
        update: {},
        create: { ...notice, userId: priyaUser.id },
      });
    }
  }

  process.stdout.write(`  reminders: ${created} dose(s) materialised, 3 notifications
`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to write demo medical records with NODE_ENV=production.");
  }

  process.stdout.write("\nSeeding DEMO data\n\n");

  if (reset) await wipe();

  /*
   * A STABLE default, not a random one.
   *
   * This used to generate a fresh password on every run, which meant re-seeding
   * silently invalidated whatever anyone had written down — and the failure
   * surfaces as "Incorrect username or password", which looks like a broken
   * login rather than a rotated credential.
   *
   * A known password in the repo is fine precisely here: `main()` refuses to run
   * at all with NODE_ENV=production, and these accounts only ever exist
   * alongside fake patients. Set DEMO_PASSWORD to override for a shared demo.
   */
  const password = process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;

  await upsertDemoUsers(password);
  await clinicalHistory();
  await reportsAndBookings();
  await appointmentsAndAdmissions();
  await pharmacy();
  await moneyTrail();
  await accessRequests();
  await dosesAndNotifications();

  const line = "─".repeat(58);
  process.stdout.write(
    [
      "",
      line,
      "  DEMO LOGINS",
      line,
      "  priya.demo         Patient (Priya Sharma + family)",
      "  clinic.demo        Clinic console",
      "  hospital.demo      Hospital console",
      "  diagnostic.demo    Diagnostic centre console",
      "  pharmacy.demo      Pharmacy console",
      "",
      `  password (all):    ${password}`,
      line,
      `  ${DEMO_PASSWORD_NOTE}`,
      "  Live payment walkthrough:  /pay/HLDEMOLIVE",
      "",
    ].join("\n"),
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`\nDemo seed failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
