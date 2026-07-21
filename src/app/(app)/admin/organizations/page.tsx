import { Building2, Users } from "lucide-react";
import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { listOrganizations } from "@/modules/admin/admin.service";
import { Badge } from "@/ui/badge";
import { Card, CardContent } from "@/ui/card";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { toneFor, type Tone } from "@/ui/tone";

export const metadata: Metadata = { title: "Tenants" };
export const dynamic = "force-dynamic";

/**
 * One hue per kind of tenant, taken from the same table the portals use, so a
 * pharmacy row here is the emerald that the pharmacy console is.
 */
const TYPE_TONE: Record<string, Tone> = {
  CLINIC: toneFor("appointment"),
  HOSPITAL: toneFor("admission"),
  DIAGNOSTIC_CENTRE: "sky",
  PHARMACY: toneFor("inventory"),
  PLATFORM: "neutral",
};

export default async function OrganizationsPage() {
  await requirePermission("org:manage");
  const organizations = await listOrganizations();

  return (
    <>
      <PageHeader
        title="Tenants"
        icon={Building2}
        tone={toneFor("department")}
        description="Clinics, hospitals, diagnostic centres and pharmacies on the platform."
      />

      {organizations.length === 0 ? (
        <EmptyState
          title="No organizations yet"
          description="Provision a clinic, hospital, diagnostic centre or pharmacy from Onboarding."
          art="people"
          tone={toneFor("department")}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {organizations.map((org) => {
            const subscription = org.subscriptions[0];

            return (
              <Card key={org.id} hue={TYPE_TONE[org.type] ?? "neutral"}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{org.name}</p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-mono">{org.slug}</span>
                        {org.city ? ` · ${org.city}` : ""}
                      </p>
                    </div>
                    <Badge tone={TYPE_TONE[org.type] ?? "neutral"}>
                      {org.type.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm">
                    <div>
                      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users aria-hidden className="size-3.5" />
                        Staff
                      </dt>
                      <dd className="font-medium">{org._count.users}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 aria-hidden className="size-3.5" />
                        Patients
                      </dt>
                      <dd className="font-medium">{org._count.patientLinks}</dd>
                    </div>
                  </dl>

                  <p className="text-sm">
                    {subscription ? (
                      <>
                        <span className="font-medium">{subscription.plan.name}</span>
                        {subscription.currentPeriodEnd ? (
                          <span className="text-muted-foreground">
                            {" · renews "}
                            {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
                              subscription.currentPeriodEnd,
                            )}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">No active subscription</span>
                    )}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
