"use client";

import { CheckCircle2, ExternalLink, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { createUserAction, type ActionState } from "@/modules/identity/actions";
import { CredentialsPanel } from "@/modules/admin/credentials-panel";
import { ROLES } from "@/shared/enums";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Field, Input, Select } from "@/ui/field";

const initial: ActionState = { ok: false };

export interface OnboardingRequest {
  id: string;
  fullName: string;
  phone: string;
  city: string | null;
  note: string | null;
  orgType: string | null;
  status: string;
  createdAt: string;
  planId: string | null;
  planName: string | null;
  planPriceMinor: number | null;
  existingUsername: string | null;
  existingUserStatus: string | null;
  payment: {
    refCode: string;
    status: string;
    amountMinor: number;
    submissionStatus: string | null;
    utr: string | null;
    proofDocumentId: string | null;
  } | null;
}

export interface SelectOption {
  id: string;
  name: string;
  type?: string;
}

function money(minor: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    minor / 100,
  );
}

function statusTone(status: string): "success" | "warning" | "info" | "neutral" {
  if (status === "PROVISIONED") return "success";
  if (status === "AWAITING_PAYMENT") return "warning";
  if (status === "APPROVED") return "info";
  return "neutral";
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <UserPlus aria-hidden className="size-4" />
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}

export function ProvisionCard({
  request,
  organizations,
  plans,
}: {
  request: OnboardingRequest;
  organizations: SelectOption[];
  plans: SelectOption[];
}) {
  const [state, formAction] = useActionState(createUserAction, initial);
  const [expanded, setExpanded] = useState(false);

  // A self-registered consumer already has a PENDING_ACTIVATION account — they
  // need activating, not creating. Only legacy requests need this form.
  const alreadyHasAccount = Boolean(request.existingUsername);
  const paymentVerified = request.payment?.status === "APPROVED";

  return (
    /* Verified money is emerald, an unverified claim is amber: the colour of the
       card is the same question the admin is here to answer. */
    <Card hue={paymentVerified ? "emerald" : "amber"}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{request.fullName}</span>
              <Badge tone={statusTone(request.status)}>
                {request.status.replace(/_/g, " ").toLowerCase()}
              </Badge>
              {request.orgType ? (
                <Badge tone="neutral">{request.orgType.replace(/_/g, " ").toLowerCase()}</Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[request.phone, request.city, request.planName].filter(Boolean).join(" · ")}
            </p>
            {request.note ? (
              <p className="mt-1 text-xs text-muted-foreground">{request.note}</p>
            ) : null}
          </div>

          {request.planPriceMinor ? (
            <p className="text-lg font-semibold">{money(request.planPriceMinor)}</p>
          ) : null}
        </div>

        {request.payment ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3 text-sm">
            <span className="font-mono">{request.payment.refCode}</span>
            <Badge tone={paymentVerified ? "success" : "warning"}>
              payment {request.payment.status.toLowerCase()}
            </Badge>
            {request.payment.utr ? (
              <span className="font-mono text-xs text-muted-foreground">
                UTR {request.payment.utr}
              </span>
            ) : null}
            {request.payment.proofDocumentId ? (
              <a
                href={`/api/v1/documents/${request.payment.proofDocumentId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
              >
                View screenshot
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            ) : null}
          </div>
        ) : null}

        {state.credentials ? (
          <CredentialsPanel
            credentials={{
              username: state.credentials.username,
              temporaryPassword: state.credentials.temporaryPassword,
              phone: request.phone,
              displayName: request.fullName,
            }}
          />
        ) : alreadyHasAccount ? (
          <Alert tone={request.existingUserStatus === "ACTIVE" ? "success" : "info"}>
            <p>
              <span className="font-medium">{request.existingUsername}</span> already exists (
              {request.existingUserStatus?.replace(/_/g, " ").toLowerCase()}).
            </p>
            <p className="mt-0.5">
              {request.existingUserStatus === "ACTIVE"
                ? "They chose their own password at sign-up, so there is nothing to hand over."
                : "Approve their payment to activate — no credentials need sending, they chose their own password."}
            </p>
          </Alert>
        ) : (
          <>
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

            {!expanded ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setExpanded(true)}>
                <UserPlus aria-hidden className="size-4" />
                Provision account
              </Button>
            ) : (
              <form action={formAction} className="space-y-3 rounded-lg border border-border p-3">
                <input type="hidden" name="accessRequestId" value={request.id} />
                <input type="hidden" name="displayName" value={request.fullName} />
                <input type="hidden" name="phone" value={request.phone} />

                {!paymentVerified ? (
                  <Alert tone="warning">
                    This payment is not approved yet. Creating the account now means granting
                    access before the money is confirmed.
                  </Alert>
                ) : (
                  <Alert tone="success">
                    <CheckCircle2 aria-hidden className="hidden" />
                    Payment verified — safe to provision.
                  </Alert>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Role" errors={state.fieldErrors?.role}>
                    {(props) => (
                      <Select
                        {...props}
                        name="role"
                        defaultValue={request.orgType ? "CLINIC_ADMIN" : "PATIENT"}
                        required
                      >
                        {ROLES.filter((role) => role !== "SUPER_ADMIN").map((role) => (
                          <option key={role} value={role}>
                            {role.replace(/_/g, " ").toLowerCase()}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>

                  <Field
                    label="Organization"
                    errors={state.fieldErrors?.orgId}
                    hint="Required for provider roles, must be empty for patients."
                  >
                    {(props) => (
                      <Select {...props} name="orgId" defaultValue="">
                        <option value="">— none (patient) —</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Username"
                    errors={state.fieldErrors?.username}
                    hint="Leave blank to generate one from their name."
                    optional
                  >
                    {(props) => (
                      <Input {...props} name="username" autoCapitalize="none" spellCheck={false} />
                    )}
                  </Field>

                  <Field label="Plan" errors={state.fieldErrors?.planId} optional>
                    {(props) => (
                      <Select {...props} name="planId" defaultValue={request.planId ?? ""}>
                        <option value="">— no subscription —</option>
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>

                <div className="flex gap-2">
                  <Submit />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
