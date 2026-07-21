import { Building2, CheckCircle2, Clock, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SubmitPaymentForm } from "@/app/pay/[refCode]/submit-form";
import { getPaymentInstructions } from "@/modules/billing/payment.service";
import { formatMoney } from "@/modules/billing/upi";
import { Alert } from "@/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { AppError } from "@/shared/errors";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pay",
  robots: { index: false, follow: false },
};

/**
 * PUBLIC payment page.
 *
 * Unauthenticated on purpose: a self-registered consumer pays BEFORE their
 * account is activated, so requiring a login here would deadlock onboarding.
 * The reference code is the only credential, and it grants nothing but the
 * ability to see the amount and file a transaction reference.
 */
export default async function PayPage({ params }: { params: Promise<{ refCode: string }> }) {
  const { refCode } = await params;

  let data;
  try {
    data = await getPaymentInstructions(refCode.toUpperCase());
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const { request, instructions } = data;
  const settled = request.status === "APPROVED";
  const awaiting = request.status === "SUBMITTED";
  const closed = request.status === "CANCELLED" || request.status === "EXPIRED";

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6 text-center">
        <div className="mb-3 inline-flex size-11 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
          H
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {formatMoney(request.amountMinor)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {request.description ?? "HealthLocker payment"}
        </p>
        <p className="mt-2 font-mono text-sm">
          Reference <span className="font-semibold">{request.refCode}</span>
        </p>
      </header>

      {settled ? (
        <Alert tone="success" className="mb-4">
          <p className="font-medium">This payment is confirmed.</p>
          <p className="mt-0.5">Nothing more to do — you can close this page.</p>
        </Alert>
      ) : null}

      {awaiting ? (
        <Alert tone="info" className="mb-4">
          <p className="font-medium">We have your reference and are checking it.</p>
          <p className="mt-0.5">
            You will hear from us on WhatsApp once it is confirmed. Usually within a working day.
          </p>
        </Alert>
      ) : null}

      {closed ? (
        <Alert tone="warning" className="mb-4">
          This payment request is no longer active. Please ask for a new link.
        </Alert>
      ) : null}

      {!settled && !closed ? (
        <>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone aria-hidden className="size-4 text-muted-foreground" />
                Pay by UPI
              </CardTitle>
              <CardDescription>
                Scan with any UPI app, or tap the button on your phone. The amount and reference
                are filled in for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {instructions.qrSvg ? (
                <div className="flex justify-center">
                  <div
                    className="rounded-xl border border-border bg-white p-3 [&>svg]:size-52"
                    aria-label={`QR code to pay ${formatMoney(request.amountMinor)}`}
                    dangerouslySetInnerHTML={{ __html: instructions.qrSvg }}
                  />
                </div>
              ) : null}

              {instructions.upiLink ? (
                <a
                  href={instructions.upiLink}
                  className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground"
                >
                  Open my UPI app
                </a>
              ) : null}

              {instructions.vpa ? (
                <dl className="rounded-lg bg-muted p-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">UPI ID</dt>
                    <dd className="font-mono">{instructions.vpa}</dd>
                  </div>
                  <div className="mt-1 flex justify-between gap-4">
                    <dt className="text-muted-foreground">Payee</dt>
                    <dd>{instructions.payeeName}</dd>
                  </div>
                </dl>
              ) : null}
            </CardContent>
          </Card>

          {instructions.bank ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 aria-hidden className="size-4 text-muted-foreground" />
                  Or pay by bank transfer
                </CardTitle>
                <CardDescription>
                  Put the reference <span className="font-mono font-semibold">{request.refCode}</span>{" "}
                  in the remarks so we can match it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  {[
                    ["Account name", instructions.payeeName],
                    ["Bank", instructions.bank.name],
                    ["Account number", instructions.bank.accountNo],
                    ["IFSC", instructions.bank.ifsc],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock aria-hidden className="size-4 text-muted-foreground" />
                After you pay
              </CardTitle>
              <CardDescription>
                Send us the transaction reference so we can match your payment. It is the UTR or
                transaction ID your bank or UPI app shows on the receipt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SubmitPaymentForm refCode={request.refCode} alreadySubmitted={awaiting} />
            </CardContent>
          </Card>
        </>
      ) : null}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <CheckCircle2 aria-hidden className="size-3.5" />
        No card details are ever collected. You pay directly from your own bank or UPI app.
      </p>
    </div>
  );
}
