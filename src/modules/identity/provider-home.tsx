import { CalendarDays, FileText, Users } from "lucide-react";

import { requireTenant } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { ComingInPhase, PageHeader } from "@/ui/page-header";
import { Stat } from "@/ui/stat";

/**
 * Shared dashboard for the four provider consoles. Each portal's own screens
 * land in Phases 7–10; what this proves today is that `requireTenant()` scopes
 * every read to the caller's organization.
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

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [org, patientCount, staffCount, todayAppointments] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { name: true, city: true },
    }),
    prisma.patientOrgLink.count({ where: { orgId, deletedAt: null } }),
    prisma.user.count({ where: { orgId, deletedAt: null, status: "ACTIVE" } }),
    prisma.appointment.count({
      where: {
        orgId,
        deletedAt: null,
        scheduledAt: { gte: startOfToday, lt: endOfToday },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={title}
        description={org ? [org.name, org.city].filter(Boolean).join(" · ") : undefined}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Registered patients" value={patientCount} icon={Users} />
        <Stat label="Today's appointments" value={todayAppointments} icon={CalendarDays} />
        <Stat label="Active staff" value={staffCount} icon={FileText} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>{feature}</CardDescription>
        </CardHeader>
        <CardContent>
          <ComingInPhase phase={phase} what={feature} />
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        Signed in as {user.username} · scoped to {org?.name ?? orgId}
      </p>
    </>
  );
}
