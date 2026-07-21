"use client";

import { AlertTriangle, Check, FileText, X } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  approvePaymentAction,
  rejectPaymentAction,
  type BillingActionState,
} from "@/modules/billing/actions";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Field, Input } from "@/ui/field";
import { EmptyState } from "@/ui/page-header";

const initial: BillingActionState = { ok: false };

export interface QueuedSubmission {
  id: string;
  utr: string;
  method: string;
  amountMinor: number;
  requestedMinor: number;
  paidAt: string | null;
  submittedAt: string;
  refCode: string;
  purpose: string;
  description: string | null;
  payer: string;
  payerPhone: string | null;
  proofDocumentId: string | null;
  proofIsPdf: boolean;
}

function money(minor: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function date(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Check aria-hidden className="size-4" />
      {pending ? "Approving…" : "Approve"}
    </Button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      <X aria-hidden className="size-4" />
      {pending ? "Rejecting…" : "Reject"}
    </Button>
  );
}

function SubmissionRow({ submission }: { submission: QueuedSubmission }) {
  const [approveState, approveAction] = useActionState(approvePaymentAction, initial);
  const [rejectState, rejectAction] = useActionState(rejectPaymentAction, initial);
  const [rejecting, setRejecting] = useState(false);

  const done = approveState.ok || rejectState.ok;
  const error = approveState.error ?? rejectState.error;

  // A payer who transferred less than asked is the single most common problem,
  // and it is invisible unless surfaced.
  const shortfall = submission.amountMinor < submission.requestedMinor;

  if (done) {
    return (
      <Alert tone="success">{approveState.message ?? rejectState.message}</Alert>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{submission.payer}</p>
            <p className="text-sm text-muted-foreground">
              {submission.description ?? submission.purpose.replace(/_/g, " ").toLowerCase()}
              {submission.payerPhone ? ` · ${submission.payerPhone}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">{money(submission.amountMinor)}</p>
            {shortfall ? (
              <Badge tone="danger">Short by {money(submission.requestedMinor - submission.amountMinor)}</Badge>
            ) : (
              <Badge tone="neutral">{submission.method.replace(/_/g, " ").toLowerCase()}</Badge>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Reference</dt>
            <dd className="font-mono">{submission.refCode}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">UTR</dt>
            <dd className="font-mono wrap-break-word">{submission.utr}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Paid on</dt>
            <dd>{submission.paidAt ? date(submission.paidAt) : "Not stated"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Submitted</dt>
            <dd>{date(submission.submittedAt)}</dd>
          </div>
        </dl>

        {submission.proofDocumentId ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Payment screenshot
            </p>
            {submission.proofIsPdf ? (
              <a
                href={`/api/v1/documents/${submission.proofDocumentId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <FileText aria-hidden className="size-4" />
                Open PDF receipt
              </a>
            ) : (
              // Opens full size in a new tab — the thumbnail is for triage, the
              // full image is what actually gets checked against the statement.
              <a
                href={`/api/v1/documents/${submission.proofDocumentId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block overflow-hidden rounded-lg border border-border hover:border-primary"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- authorised
                    route, not a static asset; next/image would proxy and cache it. */}
                <img
                  src={`/api/v1/documents/${submission.proofDocumentId}`}
                  alt={`Payment screenshot for ${submission.refCode}`}
                  className="max-h-64 w-auto"
                />
              </a>
            )}
          </div>
        ) : (
          <Alert tone="danger">
            No screenshot attached. This submission predates the proof requirement — verify it
            against your bank statement with extra care.
          </Alert>
        )}

        <Alert tone="warning">
          <AlertTriangle aria-hidden className="hidden" />
          Check the screenshot AND the UTR against your bank statement before approving. A
          screenshot alone can be edited. Approving activates access immediately.
        </Alert>

        {rejecting ? (
          <form action={rejectAction} className="space-y-3">
            <input type="hidden" name="submissionId" value={submission.id} />
            <Field
              label="Why are you rejecting this?"
              errors={rejectState.fieldErrors?.note}
              hint="The payer sees this, so tell them what to fix."
            >
              {(props) => (
                <Input
                  {...props}
                  name="note"
                  required
                  autoFocus
                  placeholder="e.g. No matching transfer found for this UTR"
                />
              )}
            </Field>
            <div className="flex gap-2">
              <RejectButton />
              <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <form action={approveAction}>
              <input type="hidden" name="submissionId" value={submission.id} />
              <ApproveButton />
            </form>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PaymentQueue({ submissions }: { submissions: QueuedSubmission[] }) {
  if (submissions.length === 0) {
    return (
      <EmptyState
        title="Nothing to verify"
        description="Submitted UPI, QR and bank payments appear here for approval."
        art="wallet"
        tone="amber"
      />
    );
  }

  return (
    <div className="space-y-3">
      {submissions.map((submission) => (
        <SubmissionRow key={submission.id} submission={submission} />
      ))}
    </div>
  );
}
