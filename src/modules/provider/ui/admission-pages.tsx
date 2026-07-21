import Link from "next/link";

import { requireTenantPermission } from "@/lib/auth/session";
import { ageFrom, formatDate, formatDateTime, humanizeEnum, money } from "@/lib/format";
import {
  getAdmission,
  listAdmissions,
  listDepartments,
} from "@/modules/provider/admission.service";
import {
  AdmissionActions,
  AdmitPatientForm,
  CreateDepartmentForm,
  DeleteDepartmentButton,
  OperationNoteForm,
} from "@/modules/provider/ui/admission-client";
import { listPractitioners, searchPatients } from "@/modules/provider/patients.service";
import { StatusBadge } from "@/modules/provider/ui/status";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export async function DepartmentsPage() {
  const { orgId } = await requireTenantPermission("org:read");
  const departments = await listDepartments(orgId);

  return (
    <>
      <PageHeader
        title="Departments"
        description="Used to route admissions and to split a bill by department."
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <CreateDepartmentForm />
        </CardContent>
      </Card>

      {departments.length === 0 ? (
        <EmptyState
          title="No departments yet"
          description="Add the wards and specialities this hospital runs."
        />
      ) : (
        <TableWrap>
          <Table>
            <Thead>
              <Tr>
                <Th>Department</Th>
                <Th>Code</Th>
                <Th>Doctors</Th>
                <Th>Admissions</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {departments.map((department) => (
                <Tr key={department.id}>
                  <Td className="font-medium">{department.name}</Td>
                  <Td className="font-mono text-xs">{department.code ?? "—"}</Td>
                  <Td>{department._count.practitioners}</Td>
                  <Td>{department._count.admissions}</Td>
                  <Td>
                    <DeleteDepartmentButton departmentId={department.id} />
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

/**
 * The ward list. Admitted patients sort first and discharged ones stay visible
 * below — an admissions screen that hides completed stays makes it impossible to
 * find the summary you wrote yesterday.
 */
export async function AdmissionsPage({ patientId }: { patientId?: string }) {
  const { orgId } = await requireTenantPermission("admission:read");

  const [admissions, patients, practitioners, departments] = await Promise.all([
    listAdmissions(orgId),
    searchPatients(orgId, "", { take: 200 }),
    listPractitioners(orgId),
    listDepartments(orgId),
  ]);

  const admitted = admissions.filter((admission) => admission.status === "ADMITTED");

  return (
    <>
      <PageHeader
        title="Admissions"
        description={`${admitted.length} patient(s) currently admitted`}
      />

      {admissions.length === 0 ? (
        <div className="mb-6">
          <EmptyState title="Nobody has been admitted yet" />
        </div>
      ) : (
        <TableWrap className="mb-6">
          <Table>
            <Thead>
              <Tr>
                <Th>Patient</Th>
                <Th>Ward / bed</Th>
                <Th>Department</Th>
                <Th>Admitted</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {admissions.map((admission) => (
                <Tr key={admission.id}>
                  <Td>
                    <Link
                      href={`/hospital/admissions/${admission.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {admission.patient.fullName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{admission.admissionReason}</p>
                  </Td>
                  <Td>
                    {[admission.wardName, admission.bedNo].filter(Boolean).join(" · ") || "—"}
                  </Td>
                  <Td className="text-muted-foreground">{admission.department?.name ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{formatDate(admission.admittedAt)}</Td>
                  <Td>
                    <StatusBadge value={admission.status} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      )}

      <AdmitPatientForm
        patients={patients.map((patient) => ({
          id: patient.id,
          fullName: patient.fullName,
          mrn: patient.mrn,
          phone: patient.phone,
        }))}
        practitioners={practitioners}
        departments={departments.map((department) => ({ id: department.id, name: department.name }))}
        defaultPatientId={patientId}
      />
    </>
  );
}

export async function AdmissionDetailPage({ admissionId }: { admissionId: string }) {
  const { orgId } = await requireTenantPermission("admission:read");

  const [admission, departments] = await Promise.all([
    getAdmission(orgId, admissionId),
    listDepartments(orgId),
  ]);

  const age = ageFrom(admission.patient.dateOfBirth);
  const open = admission.status === "ADMITTED";

  return (
    <>
      <PageHeader
        title={admission.patient.fullName}
        description={[
          age !== null ? `${age} yrs` : null,
          humanizeEnum(admission.patient.gender),
          admission.wardName,
          admission.bedNo ? `Bed ${admission.bedNo}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={<StatusBadge value={admission.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Stay</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Admitted </span>
                {formatDateTime(admission.admittedAt)}
              </p>
              {admission.dischargedAt ? (
                <p>
                  <span className="text-muted-foreground">Discharged </span>
                  {formatDateTime(admission.dischargedAt)}
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Department </span>
                {admission.department?.name ?? "Not assigned"}
              </p>
              <p>
                <span className="text-muted-foreground">Consultant </span>
                {admission.practitioner?.fullName ?? "Not assigned"}
              </p>
              {admission.admissionReason ? (
                <p className="pt-2">{admission.admissionReason}</p>
              ) : null}
              {admission.dischargeSummary ? (
                <div className="rounded-lg bg-muted p-3">
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    Discharge summary
                  </p>
                  <p className="whitespace-pre-wrap">{admission.dischargeSummary}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operation notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {admission.operationNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">None recorded.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {admission.operationNotes.map((note) => (
                    <li key={note.id} className="py-3 first:pt-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">{note.procedure}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(note.performedAt)}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {[note.surgeonName, note.anaesthesia].filter(Boolean).join(" · ")}
                      </p>
                      {note.findings ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm">{note.findings}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {open ? <OperationNoteForm admissionId={admission.id} /> : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {open ? (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <AdmissionActions
                  admissionId={admission.id}
                  departments={departments.map((department) => ({
                    id: department.id,
                    name: department.name,
                  }))}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {admission.invoices.length === 0 ? (
                <p className="text-muted-foreground">No invoice for this stay yet.</p>
              ) : (
                <ul className="space-y-2">
                  {admission.invoices.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between gap-2">
                      <Link
                        href={`/hospital/billing/${invoice.id}`}
                        className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {invoice.number}
                      </Link>
                      <span className="flex items-center gap-2">
                        {money(invoice.totalMinor)}
                        <StatusBadge value={invoice.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <Link
                href={`/hospital/billing/new?patientId=${admission.patientId}&admissionId=${admission.id}`}
                className={buttonVariants({ variant: "secondary", size: "sm", full: true })}
              >
                Create an invoice for this stay
              </Link>
            </CardContent>
          </Card>

          <Link
            href={`/hospital/patients/${admission.patientId}`}
            className={buttonVariants({ variant: "ghost", size: "sm", full: true })}
          >
            Open the full patient record
          </Link>
        </div>
      </div>
    </>
  );
}
