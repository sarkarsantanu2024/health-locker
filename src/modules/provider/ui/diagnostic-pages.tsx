import { ClipboardList, FlaskConical, ListChecks, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { hasPermission, requireTenantPermission } from "@/lib/auth/session";
import { ageFrom, formatDate, formatDateTime, humanizeEnum, money } from "@/lib/format";
import {
  getReport,
  listBookings,
  listCatalog,
  listReports,
} from "@/modules/provider/diagnostic.service";
import { searchPatients } from "@/modules/provider/patients.service";
import {
  BookingStatusForm,
  CatalogItemForm,
  CreateBookingForm,
  CreateReportForm,
  PublishReportButton,
  ToggleCatalogItem,
} from "@/modules/provider/ui/diagnostic-client";
import { StatusBadge } from "@/modules/provider/ui/status";
import { Badge } from "@/ui/badge";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from "@/ui/table";
import { toneFor } from "@/ui/tone";

const REPORT = toneFor("report");
const BOOKING = toneFor("appointment");
const CATALOGUE = toneFor("document");

export async function CataloguePage() {
  const { orgId } = await requireTenantPermission("test-catalog:manage");
  const catalog = await listCatalog(orgId, true);

  return (
    <>
      <PageHeader
        title="Test catalogue"
        icon={ListChecks}
        tone={CATALOGUE}
        description="What this centre offers, with price, sample type and turnaround."
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <CatalogItemForm />
        </CardContent>
      </Card>

      {catalog.length === 0 ? (
        <EmptyState
          title="No tests yet"
          description="Add the first test to start taking bookings."
          art="records"
          tone={CATALOGUE}
        />
      ) : (
        <TableWrap>
          <Table>
            <Thead>
              <Tr>
                <Th>Test</Th>
                <Th>Price</Th>
                <Th>Sample</Th>
                <Th>Turnaround</Th>
                <Th>Status</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {catalog.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <span className="font-medium">{item.name}</span>
                    {item.preparation ? (
                      <p className="text-xs text-muted-foreground">{item.preparation}</p>
                    ) : null}
                  </Td>
                  <Td>{money(item.priceMinor)}</Td>
                  <Td className="text-muted-foreground">{item.sampleType ?? "—"}</Td>
                  <Td className="text-muted-foreground">
                    {item.tatHours ? `${item.tatHours} h` : "—"}
                  </Td>
                  <Td>
                    <Badge tone={item.isActive ? "success" : "neutral"}>
                      {item.isActive ? "Available" : "Retired"}
                    </Badge>
                  </Td>
                  <Td>
                    <ToggleCatalogItem itemId={item.id} isActive={item.isActive} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}

export async function BookingsPage({ patientId }: { patientId?: string }) {
  const { orgId } = await requireTenantPermission("test-booking:manage");

  const [bookings, patients, catalog] = await Promise.all([
    listBookings(orgId),
    searchPatients(orgId, "", { take: 200 }),
    listCatalog(orgId),
  ]);

  return (
    <>
      <PageHeader
        title="Bookings"
        icon={ClipboardList}
        tone={BOOKING}
        description="Sample collection and processing status."
      />

      {bookings.length === 0 ? (
        <div className="mb-6">
          <EmptyState
            title="No bookings yet"
            description="Book a test below and it appears here until the report is out."
            art="calendar"
            tone={BOOKING}
          />
        </div>
      ) : (
        <TableWrap className="mb-6">
          <Table>
            <Thead>
              <Tr>
                <Th>Patient</Th>
                <Th>Test</Th>
                <Th>Scheduled</Th>
                <Th>Status</Th>
                <Th>Next step</Th>
              </Tr>
            </Thead>
            <Tbody>
              {bookings.map((booking) => (
                <Tr key={booking.id}>
                  <Td>
                    <Link
                      href={`/diagnostic/patients/${booking.patientId}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {booking.patient.fullName}
                    </Link>
                    {booking.homeCollection ? (
                      <p className="text-xs text-muted-foreground">Home collection</p>
                    ) : null}
                  </Td>
                  <Td>{booking.catalogItem.name}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {booking.scheduledAt ? formatDate(booking.scheduledAt) : "Not set"}
                  </Td>
                  <Td>
                    <StatusBadge value={booking.status} />
                  </Td>
                  <Td>
                    {booking.reportId ? (
                      <Link
                        href={`/diagnostic/reports/${booking.reportId}`}
                        className="text-xs font-medium text-primary underline underline-offset-4"
                      >
                        Open report
                      </Link>
                    ) : booking.status === "PROCESSING" || booking.status === "SAMPLE_COLLECTED" ? (
                      <Link
                        href={`/diagnostic/reports/new?patientId=${booking.patientId}&bookingId=${booking.id}&title=${encodeURIComponent(booking.catalogItem.name)}`}
                        className="text-xs font-medium text-primary underline underline-offset-4"
                      >
                        Enter results
                      </Link>
                    ) : (
                      <BookingStatusForm bookingId={booking.id} status={booking.status} />
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      )}

      <CreateBookingForm
        patients={patients.map((patient) => ({
          id: patient.id,
          fullName: patient.fullName,
          mrn: patient.mrn,
          phone: patient.phone,
        }))}
        catalog={catalog.map((item) => ({
          id: item.id,
          name: item.name,
          sampleType: item.sampleType,
        }))}
        defaultPatientId={patientId}
      />
    </>
  );
}

export async function ReportsPage() {
  const { orgId } = await requireTenantPermission("report:read");
  const reports = await listReports(orgId);

  const awaiting = reports.filter((report) => report.status === "AWAITING_VERIFICATION").length;

  return (
    <>
      <PageHeader
        title="Reports"
        icon={FlaskConical}
        tone={REPORT}
        description={
          awaiting > 0
            ? `${awaiting} report(s) waiting to be verified before the patient can see them.`
            : "Everything entered has been verified."
        }
        action={
          <Link href="/diagnostic/reports/new" className={buttonVariants({ size: "sm" })}>
            Enter results
          </Link>
        }
      />

      {reports.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="Enter results against a booking, or start a standalone report."
          art="report"
          tone={REPORT}
        />
      ) : (
        <TableWrap>
          <Table>
            <Thead>
              <Tr>
                <Th>Report</Th>
                <Th>Patient</Th>
                <Th>Results</Th>
                <Th>Status</Th>
                <Th>Verified by</Th>
              </Tr>
            </Thead>
            <Tbody>
              {reports.map((report) => (
                <Tr key={report.id}>
                  <Td>
                    <Link
                      href={`/diagnostic/reports/${report.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {report.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{formatDate(report.reportedAt)}</p>
                  </Td>
                  <Td>{report.patient.fullName}</Td>
                  <Td>{report._count.findings}</Td>
                  <Td>
                    <StatusBadge value={report.status} />
                  </Td>
                  <Td className="text-muted-foreground">
                    {report.verifiedBy?.displayName ?? "—"}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}

export async function NewReportPage({
  patientId,
  bookingId,
  title,
}: {
  patientId?: string;
  bookingId?: string;
  title?: string;
}) {
  const { orgId } = await requireTenantPermission("report:upload");
  const patients = await searchPatients(orgId, "", { take: 200 });

  return (
    <>
      <PageHeader
        title="Enter results"
        icon={FlaskConical}
        tone={REPORT}
        description="Saved for verification. Nothing reaches the patient until it is signed off."
      />

      <CreateReportForm
        patients={patients.map((patient) => ({
          id: patient.id,
          fullName: patient.fullName,
          mrn: patient.mrn,
          phone: patient.phone,
        }))}
        defaultPatientId={patientId}
        bookingId={bookingId}
        defaultTitle={title}
      />
    </>
  );
}

export async function ReportDetailPage({ reportId }: { reportId: string }) {
  const { user, orgId } = await requireTenantPermission("report:read");
  const report = await getReport(orgId, reportId);

  const age = ageFrom(report.patient.dateOfBirth);
  const canVerify = hasPermission(user, "report:verify");

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={report.title}
          icon={FlaskConical}
          tone={REPORT}
          description={`${report.patient.fullName} · ${formatDate(report.reportedAt)}`}
          action={<StatusBadge value={report.status} />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <article className="rounded-console border border-border bg-surface p-6 print:border-0 print:p-0">
            <header className="border-b border-border pb-3">
              <h2 className="font-semibold">{report.org?.name}</h2>
              <p className="text-sm text-muted-foreground">
                {[report.org?.addressLine, report.org?.city, report.org?.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </header>

            <div className="flex flex-wrap justify-between gap-3 border-b border-border py-3 text-sm">
              <div>
                <p className="font-medium">{report.patient.fullName}</p>
                <p className="text-muted-foreground">
                  {[age !== null ? `${age} yrs` : null, humanizeEnum(report.patient.gender)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <p className="text-muted-foreground">{formatDateTime(report.reportedAt)}</p>
            </div>

            <TableWrap className="mt-4 rounded-lg">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Test</Th>
                    <Th>Result</Th>
                    <Th>Unit</Th>
                    <Th>Reference</Th>
                    <Th>Flag</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {report.findings.map((finding) => (
                    <Tr key={finding.id}>
                      <Td>{finding.label}</Td>
                      <Td className="font-medium">{finding.value}</Td>
                      <Td className="text-muted-foreground">{finding.unit ?? "—"}</Td>
                      <Td className="text-muted-foreground">{finding.referenceRange ?? "—"}</Td>
                      <Td>
                        <StatusBadge value={finding.flag} />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>

            {report.verifiedAt ? (
              <footer className="mt-6 text-right text-sm text-muted-foreground">
                Verified by {report.verifiedBy?.displayName} on {formatDate(report.verifiedAt)}
              </footer>
            ) : null}
          </article>
        </div>

        <div className="space-y-4 print:hidden">
          {report.status !== "PUBLISHED" ? (
            <Card hue="amber">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck aria-hidden className="size-4 text-amber" />
                  Verification
                </CardTitle>
              </CardHeader>
              <CardContent>
                {canVerify ? (
                  <PublishReportButton reportId={report.id} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This report is waiting for someone with sign-off rights. You entered the
                    results; a different person verifies them.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Link
            href={`/diagnostic/patients/${report.patientId}`}
            className={buttonVariants({ variant: "secondary", size: "sm", full: true })}
          >
            Open the patient record
          </Link>
        </div>
      </div>
    </>
  );
}
