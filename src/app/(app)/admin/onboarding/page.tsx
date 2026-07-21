import type { Metadata } from "next";

import { ProvisionCard } from "@/app/(app)/admin/onboarding/provision-card";
import { requirePermission } from "@/lib/auth/session";
import {
  listAccessRequests,
  listActiveOrganizationsForSelect,
  listPlans,
} from "@/modules/admin/admin.service";
import { Alert } from "@/ui/alert";
import { EmptyState, PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Onboarding" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requirePermission("access-request:read");

  const [requests, organizations, plans] = await Promise.all([
    listAccessRequests(),
    listActiveOrganizationsForSelect(),
    listPlans(),
  ]);

  return (
    <>
      <PageHeader
        title="Onboarding"
        description="Sign-ups and enquiries waiting on payment verification or an account."
      />

      <Alert tone="info" className="mb-4">
        <p className="font-medium">HealthLocker never sends email.</p>
        <p className="mt-0.5">
          Consumers who signed up chose their own password — activate them once payment is
          verified. Only older enquiries need an account creating, and those credentials are
          shown once for you to copy and send.
        </p>
      </Alert>

      {requests.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="New sign-ups and provider enquiries appear here."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const payment = request.paymentRequests[0];
            const submission = payment?.submissions[0];

            return (
              <ProvisionCard
                key={request.id}
                organizations={organizations.map((org) => ({ id: org.id, name: org.name, type: org.type }))}
                plans={plans
                  .filter((plan) => plan.isActive)
                  .map((plan) => ({ id: plan.id, name: `${plan.name} (${plan.audience.toLowerCase()})` }))}
                request={{
                  id: request.id,
                  fullName: request.fullName,
                  phone: request.phone,
                  city: request.city,
                  note: request.note,
                  orgType: request.orgType,
                  status: request.status,
                  createdAt: request.createdAt.toISOString(),
                  planId: request.desiredPlan?.id ?? null,
                  planName: request.desiredPlan?.name ?? null,
                  planPriceMinor: request.desiredPlan?.priceMinor ?? null,
                  existingUsername: request.provisionedUser?.username ?? null,
                  existingUserStatus: request.provisionedUser?.status ?? null,
                  payment: payment
                    ? {
                        refCode: payment.refCode,
                        status: payment.status,
                        amountMinor: payment.amountMinor,
                        submissionStatus: submission?.status ?? null,
                        utr: submission?.utr ?? null,
                        proofDocumentId: submission?.proofDocumentId ?? null,
                      }
                    : null,
                }}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
