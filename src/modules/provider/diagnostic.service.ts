import { Prisma } from "@prisma/client";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { notifyPatient } from "@/modules/notify/notify.service";
import { requirePatientOfOrg } from "@/modules/provider/patients.service";
import { AppError } from "@/shared/errors";
import type { FindingFlag, TestBookingStatus } from "@/shared/enums";

/**
 * Diagnostic centre: the test catalogue, bookings, and the report that comes out
 * the other end.
 *
 * The rule that shapes this module: **a result is not visible to the patient
 * until a human verifies it.** Everything a technician enters lands in
 * `AWAITING_VERIFICATION`, and only `publishReport` — which requires
 * `report:verify` — moves it to `PUBLISHED` and puts it on the patient's
 * timeline. An unverified potassium of 7.0 arriving as a push notification is
 * the failure mode this prevents.
 */

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export async function listCatalog(orgId: string, includeInactive = false) {
  return prisma.testCatalogItem.findMany({
    where: { orgId, deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      priceMinor: true,
      sampleType: true,
      tatHours: true,
      preparation: true,
      isActive: true,
    },
  });
}

export async function createCatalogItem(
  orgId: string,
  input: {
    name: string;
    code?: string | null;
    priceMinor: number;
    sampleType?: string | null;
    tatHours?: number | null;
    preparation?: string | null;
  },
  actorId: string,
): Promise<{ id: string }> {
  try {
    const item = await prisma.testCatalogItem.create({
      data: {
        orgId,
        name: input.name,
        code: input.code ?? null,
        priceMinor: input.priceMinor,
        sampleType: input.sampleType ?? null,
        tatHours: input.tatHours ?? null,
        preparation: input.preparation ?? null,
      },
      select: { id: true },
    });

    await audit({
      action: "test-catalog:created",
      entityType: "TestCatalogItem",
      entityId: item.id,
      actorId,
      orgId,
      metadata: { name: input.name, priceMinor: input.priceMinor },
    });

    return item;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "A test with that code already exists.", { field: "code" });
    }
    throw error;
  }
}

/**
 * Retire rather than delete: a booking made last month points at this row, and
 * removing it would leave a report that cannot say what test it was.
 */
export async function setCatalogItemActive(
  orgId: string,
  itemId: string,
  isActive: boolean,
  actorId: string,
): Promise<void> {
  const result = await prisma.testCatalogItem.updateMany({
    where: { id: itemId, orgId, deletedAt: null },
    data: { isActive },
  });

  if (result.count === 0) throw new AppError("NOT_FOUND", "Not found.");

  await audit({
    action: isActive ? "test-catalog:reactivated" : "test-catalog:retired",
    entityType: "TestCatalogItem",
    entityId: itemId,
    actorId,
    orgId,
  });
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export async function listBookings(
  orgId: string,
  filters: { status?: TestBookingStatus } = {},
) {
  return prisma.testBooking.findMany({
    where: { orgId, deletedAt: null, ...(filters.status ? { status: filters.status } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      homeCollection: true,
      collectedAt: true,
      reportId: true,
      patientId: true,
      patient: { select: { fullName: true, phone: true } },
      catalogItem: { select: { name: true, sampleType: true, tatHours: true } },
    },
  });
}

export async function createBooking(
  orgId: string,
  input: {
    patientId: string;
    catalogItemId: string;
    scheduledAt?: Date | null;
    homeCollection?: boolean;
  },
  actorId: string,
): Promise<{ id: string }> {
  await requirePatientOfOrg(orgId, input.patientId);

  const item = await prisma.testCatalogItem.findFirst({
    where: { id: input.catalogItemId, orgId, deletedAt: null, isActive: true },
    select: { id: true, name: true, preparation: true },
  });

  if (!item) throw new AppError("NOT_FOUND", "That test is not in your catalogue.");

  const booking = await prisma.testBooking.create({
    data: {
      orgId,
      patientId: input.patientId,
      catalogItemId: item.id,
      scheduledAt: input.scheduledAt ?? null,
      homeCollection: input.homeCollection ?? false,
      status: "BOOKED",
    },
    select: { id: true },
  });

  await audit({
    action: "test-booking:created",
    entityType: "TestBooking",
    entityId: booking.id,
    actorId,
    orgId,
    metadata: { patientId: input.patientId, test: item.name },
  });

  // Preparation instructions are the whole reason to notify at booking time —
  // a fasting test the patient ate before is a wasted trip for everyone.
  await notifyPatient(input.patientId, {
    type: "APPOINTMENT_REMINDER",
    title: `${item.name} booked`,
    body: item.preparation
      ? `Preparation: ${item.preparation}`
      : input.scheduledAt
        ? `Scheduled for ${formatDate(input.scheduledAt)}.`
        : "We will confirm your slot shortly.",
    data: { url: "/patient/reports", bookingId: booking.id },
    dedupeKey: `booking:${booking.id}`,
  });

  return booking;
}

export async function setBookingStatus(
  orgId: string,
  bookingId: string,
  status: TestBookingStatus,
  actorId: string,
): Promise<void> {
  const result = await prisma.testBooking.updateMany({
    where: { id: bookingId, orgId, deletedAt: null },
    data: {
      status,
      ...(status === "SAMPLE_COLLECTED" ? { collectedAt: new Date() } : {}),
    },
  });

  if (result.count === 0) throw new AppError("NOT_FOUND", "Not found.");

  await audit({
    action: "test-booking:status-changed",
    entityType: "TestBooking",
    entityId: bookingId,
    actorId,
    orgId,
    metadata: { status },
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface FindingInput {
  label: string;
  value: string;
  unit?: string | null;
  referenceRange?: string | null;
  flag?: FindingFlag;
}

export async function createReport(
  orgId: string,
  input: {
    patientId: string;
    title: string;
    reportType?: string | null;
    reportedAt?: Date;
    bookingId?: string | null;
    findings: FindingInput[];
  },
  actorId: string,
): Promise<{ id: string }> {
  await requirePatientOfOrg(orgId, input.patientId);

  const report = await prisma.diagnosticReport.create({
    data: {
      orgId,
      patientId: input.patientId,
      title: input.title,
      reportType: input.reportType ?? null,
      reportedAt: input.reportedAt ?? new Date(),
      // Entered, not yet checked. Publishing is a separate, permissioned act.
      status: "AWAITING_VERIFICATION",
      findings: {
        create: input.findings.map((finding) => ({
          label: finding.label,
          value: finding.value,
          unit: finding.unit ?? null,
          referenceRange: finding.referenceRange ?? null,
          flag: finding.flag ?? "UNKNOWN",
        })),
      },
    },
    select: { id: true },
  });

  if (input.bookingId) {
    await prisma.testBooking.updateMany({
      where: { id: input.bookingId, orgId, deletedAt: null },
      data: { reportId: report.id, status: "PROCESSING" },
    });
  }

  await audit({
    action: "report:created",
    entityType: "DiagnosticReport",
    entityId: report.id,
    actorId,
    orgId,
    metadata: { patientId: input.patientId, title: input.title, findings: input.findings.length },
  });

  return report;
}

/**
 * Verify and publish. This is the only path to `PUBLISHED`, and it needs
 * `report:verify` — which the role matrix grants to a diagnostic ADMIN, not to
 * the technician who typed the numbers.
 */
export async function publishReport(
  orgId: string,
  reportId: string,
  actorId: string,
): Promise<void> {
  const report = await prisma.diagnosticReport.findFirst({
    where: { id: reportId, orgId, deletedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      patientId: true,
      findings: { select: { flag: true } },
      testBooking: { select: { id: true } },
    },
  });

  if (!report) throw new AppError("NOT_FOUND", "Not found.");
  if (report.status === "PUBLISHED") throw new AppError("BAD_REQUEST", "Already published.");

  await prisma.diagnosticReport.update({
    where: { id: reportId },
    data: {
      status: "PUBLISHED",
      verifiedById: actorId,
      verifiedAt: new Date(),
      // Verification is a human confirming each line, so the findings stop being
      // provisional at the same moment.
      findings: { updateMany: { where: {}, data: { confirmedAt: new Date() } } },
    },
  });

  if (report.testBooking) {
    await prisma.testBooking.update({
      where: { id: report.testBooking.id },
      data: { status: "REPORT_READY" },
    });
  }

  await audit({
    action: "report:published",
    entityType: "DiagnosticReport",
    entityId: reportId,
    actorId,
    orgId,
    metadata: { patientId: report.patientId, title: report.title },
  });

  const abnormal = report.findings.filter((finding) =>
    ["HIGH", "LOW", "CRITICAL"].includes(finding.flag),
  ).length;

  await notifyPatient(report.patientId, {
    type: "REPORT_READY",
    title: `${report.title} is ready`,
    body:
      abnormal > 0
        ? `${abnormal} value(s) are outside the usual range. Please discuss this with your doctor.`
        : "All values are within the usual range.",
    data: { url: "/patient/reports", reportId },
    dedupeKey: `report:${reportId}`,
    // A result the patient can act on is worth interrupting for; the wording
    // above deliberately never interprets it for them.
    urgent: abnormal > 0,
  });
}

export async function listReports(orgId: string, filters: { patientId?: string } = {}) {
  return prisma.diagnosticReport.findMany({
    where: { orgId, deletedAt: null, ...(filters.patientId ? { patientId: filters.patientId } : {}) },
    orderBy: [{ status: "asc" }, { reportedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      status: true,
      reportedAt: true,
      verifiedAt: true,
      patientId: true,
      patient: { select: { fullName: true } },
      verifiedBy: { select: { displayName: true } },
      _count: { select: { findings: true } },
    },
  });
}

export async function getReport(orgId: string, reportId: string) {
  const report = await prisma.diagnosticReport.findFirst({
    where: { id: reportId, orgId, deletedAt: null },
    select: {
      id: true,
      title: true,
      reportType: true,
      status: true,
      reportedAt: true,
      verifiedAt: true,
      patientId: true,
      patient: { select: { fullName: true, dateOfBirth: true, gender: true, phone: true } },
      verifiedBy: { select: { displayName: true } },
      org: { select: { name: true, addressLine: true, city: true, phone: true, licenceNo: true } },
      findings: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          label: true,
          value: true,
          unit: true,
          referenceRange: true,
          flag: true,
          confirmedAt: true,
        },
      },
    },
  });

  if (!report) throw new AppError("NOT_FOUND", "Not found.");

  return report;
}

/** Counts for the diagnostic dashboard. */
export async function diagnosticSummary(orgId: string) {
  const [awaitingSample, processing, awaitingVerification, publishedToday] = await Promise.all([
    prisma.testBooking.count({
      where: { orgId, deletedAt: null, status: { in: ["BOOKED", "SAMPLE_PENDING"] } },
    }),
    prisma.testBooking.count({
      where: { orgId, deletedAt: null, status: { in: ["SAMPLE_COLLECTED", "PROCESSING"] } },
    }),
    prisma.diagnosticReport.count({
      where: { orgId, deletedAt: null, status: "AWAITING_VERIFICATION" },
    }),
    prisma.diagnosticReport.count({
      where: {
        orgId,
        deletedAt: null,
        status: "PUBLISHED",
        verifiedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);

  return { awaitingSample, processing, awaitingVerification, publishedToday };
}
