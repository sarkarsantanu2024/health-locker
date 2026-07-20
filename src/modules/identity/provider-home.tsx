import { requireTenant } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { ComingInPhase, PageHeader } from "@/ui/page-header";

/**
 * Shared dashboard shell for the four provider portals. Each portal's own
 * screens land in Phases 7–10; what this proves today is that `requireTenant()`
 * scopes every read to the caller's organization.
 */
export async function ProviderHome({
  title,
  phase,
  feature,
}: {
  title: string;
  phase: number;
  feature: string;
}) {
  // orgId comes from the session guard, never from the request.
  const { user, orgId } = await requireTenant();

  const [org, patientCount, staffCount] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { name: true, city: true, type: true },
    }),
    prisma.patientOrgLink.count({ where: { orgId, deletedAt: null } }),
    prisma.user.count({ where: { orgId, deletedAt: null, status: "ACTIVE" } }),
  ]);

  return (
    <>
      <PageHeader
        title={title}
        description={org ? `${org.name}${org.city ? ` · ${org.city}` : ""}` : undefined}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Registered patients</CardTitle>
            <CardDescription>Patients linked to this organization.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl">{patientCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active staff</CardTitle>
            <CardDescription>Accounts your administrator has provisioned.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl">{staffCount}</p>
          </CardContent>
        </Card>
      </div>

      <ComingInPhase phase={phase} what={feature} />

      <p className="mt-6 text-xs text-muted-foreground">
        Signed in as {user.username} · tenant-scoped to {org?.name ?? orgId}
      </p>
    </>
  );
}
