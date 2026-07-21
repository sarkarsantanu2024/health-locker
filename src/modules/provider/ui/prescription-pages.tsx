import { ScrollText } from "lucide-react";
import Link from "next/link";

import { requireTenantPermission } from "@/lib/auth/session";
import { ageFrom, formatDate, humanizeEnum } from "@/lib/format";
import { getPrescriptionForPrint, listPrescriptions } from "@/modules/provider/clinical.service";
import { buttonVariants } from "@/ui/button";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from "@/ui/table";
import { toneFor } from "@/ui/tone";

const PRESCRIPTION = toneFor("prescription");

export async function ProviderPrescriptionsPage({ base }: { base: string }) {
  const { orgId } = await requireTenantPermission("prescription:read");
  const prescriptions = await listPrescriptions(orgId);

  return (
    <>
      <PageHeader
        title="Prescriptions"
        icon={ScrollText}
        tone={PRESCRIPTION}
        description="Everything issued from this organisation. Write a new one from inside a visit."
      />

      {prescriptions.length === 0 ? (
        <EmptyState
          title="No prescriptions yet"
          description="Record a visit, then write the prescription against it."
          art="medicine"
          tone={PRESCRIPTION}
          action={
            <Link href={`${base}/encounters/new`} className={buttonVariants({ size: "sm" })}>
              Record a visit
            </Link>
          }
        />
      ) : (
        <TableWrap>
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Patient</Th>
                <Th>Medicines</Th>
                <Th>Prescriber</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {prescriptions.map((prescription) => (
                <Tr key={prescription.id}>
                  <Td className="whitespace-nowrap">{formatDate(prescription.issuedAt)}</Td>
                  <Td>
                    <Link
                      href={`${base}/patients/${prescription.patientId}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {prescription.patient.fullName}
                    </Link>
                  </Td>
                  <Td className="text-muted-foreground">
                    {prescription.items.map((item) => item.drugName).join(", ") || "—"}
                  </Td>
                  <Td className="text-muted-foreground">
                    {prescription.practitioner?.fullName ?? "—"}
                  </Td>
                  <Td>
                    <Link
                      href={`${base}/prescriptions/${prescription.id}`}
                      className="text-sm font-medium text-primary underline underline-offset-4"
                    >
                      Print
                    </Link>
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
 * The printable prescription.
 *
 * Rendered as ordinary HTML with a print stylesheet rather than a generated PDF:
 * the clinic prints it on their own letterhead-sized paper, and a PDF renderer
 * in a serverless function would cost a cold start for something the browser
 * already does well. `print:` utilities strip the app chrome.
 */
export async function PrescriptionPrintPage({
  base,
  prescriptionId,
}: {
  base: string;
  prescriptionId: string;
}) {
  const { user, orgId } = await requireTenantPermission("prescription:read");
  const prescription = await getPrescriptionForPrint(orgId, prescriptionId, user.id);

  const age = ageFrom(prescription.patient.dateOfBirth);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Prescription"
          icon={ScrollText}
          tone={PRESCRIPTION}
          description="Use your browser's print dialog. The page chrome is removed automatically."
          action={
            <Link
              href={`${base}/prescriptions`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Back to list
            </Link>
          }
        />
      </div>

      <article className="mx-auto max-w-2xl rounded-console border border-border bg-surface p-8 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="border-b border-border pb-4">
          <h1 className="text-lg font-semibold">{prescription.org?.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[prescription.org?.addressLine, prescription.org?.city, prescription.org?.phone]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {prescription.org?.licenceNo ? (
            <p className="text-xs text-muted-foreground">Reg. {prescription.org.licenceNo}</p>
          ) : null}
        </header>

        <section className="flex flex-wrap justify-between gap-4 border-b border-border py-4 text-sm">
          <div>
            <p className="font-medium">{prescription.patient.fullName}</p>
            <p className="text-muted-foreground">
              {[
                age !== null ? `${age} yrs` : null,
                humanizeEnum(prescription.patient.gender),
                prescription.patient.phone,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="text-right text-muted-foreground">
            <p>{formatDate(prescription.issuedAt)}</p>
          </div>
        </section>

        <section className="py-6">
          <p className="mb-3 text-2xl font-serif">℞</p>
          <ol className="space-y-4">
            {prescription.items.map((item, index) => (
              <li key={item.id} className="flex gap-3">
                <span className="text-muted-foreground">{index + 1}.</span>
                <div>
                  <p className="font-medium">
                    {item.drugName}
                    {item.dose ? ` — ${item.dose}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[item.frequency, item.duration, item.instructions].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {prescription.notes ? (
            <p className="mt-6 whitespace-pre-wrap text-sm">{prescription.notes}</p>
          ) : null}
        </section>

        <footer className="mt-10 flex justify-end border-t border-border pt-4 text-sm">
          <div className="text-right">
            <p className="font-medium">{prescription.practitioner?.fullName ?? ""}</p>
            <p className="text-muted-foreground">
              {[prescription.practitioner?.qualification, prescription.practitioner?.specialization]
                .filter(Boolean)
                .join(", ")}
            </p>
            {prescription.practitioner?.registrationNo ? (
              <p className="text-xs text-muted-foreground">
                Reg. {prescription.practitioner.registrationNo}
              </p>
            ) : null}
          </div>
        </footer>
      </article>
    </>
  );
}
