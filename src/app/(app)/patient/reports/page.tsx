import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";

import { auditRead } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getPatientContext } from "@/modules/patient/context";
import { StatusBadge } from "@/modules/provider/ui/status";
import { Alert } from "@/ui/alert";
import { Card, CardContent } from "@/ui/card";
import { EmptyState, PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

/**
 * Lab and imaging results.
 *
 * Only `PUBLISHED` reports are listed: an unverified result is not a result, and
 * showing one here would be showing a patient a number no clinician has checked.
 *
 * Out-of-range values are flagged but never interpreted. "Your potassium is
 * high" is a fact; anything that reads as advice belongs with their doctor, and
 * an app that hedges between the two is the worst of both.
 */
export default async function ReportsPage() {
  const context = await getPatientContext();

  const reports = await prisma.diagnosticReport.findMany({
    where: { patientId: context.patientId, deletedAt: null, status: "PUBLISHED" },
    orderBy: { reportedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      reportType: true,
      reportedAt: true,
      status: true,
      org: { select: { name: true } },
      findings: {
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true, value: true, unit: true, referenceRange: true, flag: true },
      },
    },
  });

  await auditRead({
    action: "report.list.viewed",
    entityType: "DiagnosticReport",
    actorId: context.user.id,
    metadata: { patientId: context.patientId, count: reports.length },
  });

  return (
    <>
      <PageHeader
        title="Reports"
        description={
          context.isActingForOther
            ? `${context.patientName}'s lab and scan results`
            : "Your lab and scan results."
        }
      />

      {reports.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="Results appear here as soon as the diagnostic centre publishes them."
        />
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const abnormal = report.findings.filter((finding) =>
              ["HIGH", "LOW", "CRITICAL"].includes(finding.flag),
            );

            return (
              <Card key={report.id} tone="consumer">
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 font-medium">
                        <FlaskConical aria-hidden className="size-4 text-primary" />
                        {report.title}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {[report.org?.name, formatDate(report.reportedAt)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {abnormal.length > 0 ? (
                      <StatusBadge value="HIGH" />
                    ) : (
                      <StatusBadge value="NORMAL" />
                    )}
                  </div>

                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {report.findings.map((finding) => {
                      const flagged = ["HIGH", "LOW", "CRITICAL"].includes(finding.flag);

                      return (
                        <li
                          key={finding.id}
                          className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5"
                        >
                          <span className={flagged ? "font-medium" : ""}>{finding.label}</span>
                          <span className="flex items-center gap-2 text-sm">
                            <span className={flagged ? "font-semibold text-danger" : ""}>
                              {finding.value}
                              {finding.unit ? ` ${finding.unit}` : ""}
                            </span>
                            {finding.referenceRange ? (
                              <span className="text-muted-foreground">
                                (usual {finding.referenceRange})
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {abnormal.length > 0 ? (
                    <Alert tone="warning">
                      {abnormal.length} value(s) are outside the usual range. This does not
                      necessarily mean something is wrong — take this report to your doctor.
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
