import { Banknote, FilePlus2, Plus, Receipt, Wallet } from "lucide-react";
import Link from "next/link";

import { requireTenantPermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDate, money } from "@/lib/format";
import { getInvoice, listInvoices, revenueSummary } from "@/modules/provider/invoice.service";
import { searchPatients } from "@/modules/provider/patients.service";
import { CreateInvoiceForm, InvoiceActions } from "@/modules/provider/ui/invoice-client";
import { StatusBadge } from "@/modules/provider/ui/status";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { Stat, StatHero } from "@/ui/stat";
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from "@/ui/table";
import { toneFor } from "@/ui/tone";

/** Money is amber everywhere in the product; this file never picks a hue by hand. */
const BILLING = toneFor("billing");

export async function ProviderBillingPage({ base }: { base: string }) {
  const { orgId } = await requireTenantPermission("invoice:read");

  const [invoices, summary] = await Promise.all([listInvoices(orgId), revenueSummary(orgId)]);

  return (
    <>
      <PageHeader
        title="Billing"
        icon={Banknote}
        tone={BILLING}
        description="Invoices, and collection by UPI, QR or bank transfer."
        action={
          <Link href={`${base}/billing/new`} className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden className="size-4" />
            New invoice
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {/* The screen's one hero: what has not been collected is the number that
            decides whether anybody needs to do anything today. */}
        <StatHero
          label="Outstanding"
          value={money(summary.outstandingMinor)}
          hint={`${summary.outstandingCount} unpaid`}
          icon={Wallet}
          tone={BILLING}
        />
        <Stat
          label="Collected this month"
          value={money(summary.paidThisMonthMinor)}
          hint={`${summary.paidThisMonthCount} invoice(s)`}
          icon={Banknote}
          tone="emerald"
        />
        <Stat
          label="Drafts"
          value={summary.draftCount}
          hint="Not yet issued"
          icon={FilePlus2}
          tone={toneFor("document")}
        />
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Create one from a visit, or start a standalone invoice."
          art="wallet"
          tone={BILLING}
          action={
            <Link href={`${base}/billing/new`} className={buttonVariants({ size: "sm" })}>
              New invoice
            </Link>
          }
        />
      ) : (
        <TableWrap>
          <Table>
            <Thead>
              <Tr>
                <Th>Number</Th>
                <Th>Patient</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Reference</Th>
              </Tr>
            </Thead>
            <Tbody>
              {invoices.map((invoice) => (
                <Tr key={invoice.id}>
                  <Td>
                    <Link
                      href={`${base}/billing/${invoice.id}`}
                      className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                    >
                      {invoice.number}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {invoice.issuedAt ? formatDate(invoice.issuedAt) : "Draft"}
                    </p>
                  </Td>
                  <Td>{invoice.patient.fullName}</Td>
                  <Td className="font-medium">{money(invoice.totalMinor)}</Td>
                  <Td>
                    <StatusBadge value={invoice.status} />
                  </Td>
                  <Td className="font-mono text-xs text-muted-foreground">
                    {invoice.paymentRequests[0]?.refCode ?? "—"}
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

export async function NewInvoicePage({
  base,
  patientId,
  encounterId,
  admissionId,
  withDepartments = false,
}: {
  base: string;
  patientId?: string;
  encounterId?: string;
  admissionId?: string;
  withDepartments?: boolean;
}) {
  const { orgId } = await requireTenantPermission("invoice:manage");

  const [patients, departments] = await Promise.all([
    searchPatients(orgId, "", { take: 200 }),
    withDepartments
      ? prisma.department.findMany({
          where: { orgId, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="New invoice"
        icon={FilePlus2}
        tone={BILLING}
        description="Saved as a draft. Issuing it is what makes it payable and notifies the patient."
      />

      <CreateInvoiceForm
        patients={patients.map((patient) => ({
          id: patient.id,
          fullName: patient.fullName,
          mrn: patient.mrn,
          phone: patient.phone,
        }))}
        departments={departments}
        defaultPatientId={patientId}
        encounterId={encounterId}
        admissionId={admissionId}
      />

      <p className="mt-4 text-sm text-muted-foreground">
        <Link href={`${base}/billing`} className="underline underline-offset-4">
          Back to billing
        </Link>
      </p>
    </>
  );
}

export async function InvoiceDetailPage({ base, invoiceId }: { base: string; invoiceId: string }) {
  const { orgId } = await requireTenantPermission("invoice:read");
  const invoice = await getInvoice(orgId, invoiceId);

  const live = invoice.paymentRequests.find((request) =>
    ["PENDING", "SUBMITTED"].includes(request.status),
  );

  return (
    <>
      <PageHeader
        title={invoice.number}
        icon={Receipt}
        tone={BILLING}
        description={`${invoice.patient.fullName} · ${money(invoice.totalMinor)}`}
        action={<StatusBadge value={invoice.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <TableWrap className="rounded-none border-0">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Description</Th>
                      <Th>Qty</Th>
                      <Th>Rate</Th>
                      <Th>Amount</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {invoice.items.map((item) => (
                      <Tr key={item.id}>
                        <Td>
                          {item.description}
                          {item.department ? (
                            <p className="text-xs text-muted-foreground">{item.department.name}</p>
                          ) : null}
                        </Td>
                        <Td>{item.quantity}</Td>
                        <Td>{money(item.unitPriceMinor)}</Td>
                        <Td className="font-medium">{money(item.amountMinor)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>

              <dl className="space-y-1 border-t border-border p-5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{money(invoice.subtotalMinor)}</dd>
                </div>
                {invoice.discountMinor > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd>− {money(invoice.discountMinor)}</dd>
                  </div>
                ) : null}
                {invoice.taxMinor > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tax</dt>
                    <dd>{money(invoice.taxMinor)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{money(invoice.totalMinor)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
            </CardContent>
          </Card>

          {live ? (
            <Card hue={BILLING}>
              <CardHeader>
                <CardTitle>Collection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Send the patient this link. They pay by UPI, QR or bank transfer, then file the
                  reference for you to verify.
                </p>
                <p className="font-mono text-xs">/pay/{live.refCode}</p>
                <StatusBadge value={live.status} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Issued {invoice.issuedAt ? formatDate(invoice.issuedAt) : "not yet"}</p>
              <p>Due {invoice.dueAt ? formatDate(invoice.dueAt) : "not set"}</p>
              <p>Paid {invoice.paidAt ? formatDate(invoice.paidAt) : "not yet"}</p>
              {invoice.notes ? <p className="pt-2 text-foreground">{invoice.notes}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        <Link href={`${base}/billing`} className="underline underline-offset-4">
          Back to billing
        </Link>
      </p>
    </>
  );
}
