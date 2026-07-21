import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { logoutAction } from "@/modules/identity/actions";
import { ConsoleShell } from "@/modules/identity/console-shell";
import { ConsumerShell } from "@/modules/identity/consumer-shell";
import { NotificationBell } from "@/modules/notify/notification-bell";
import { CONSUMER_ROLES } from "@/shared/enums";
import { Button } from "@/ui/button";

export const dynamic = "force-dynamic";

function SignOutButton({ full }: { full?: boolean }) {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" size="sm" full={full}>
        <LogOut aria-hidden className="size-4" />
        Sign out
      </Button>
    </form>
  );
}

/**
 * Authenticated shell. Patients get the consumer layout, providers and admins
 * the console — same tokens and components, different density.
 *
 * Only PLAIN DATA crosses into the client shells (role, permission strings,
 * names). The nav table holds Lucide icon components, which are functions and
 * cannot be serialised across the server→client boundary, so each shell imports
 * that table itself and derives its own links.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  const permissions = [...session.permissions];

  if (CONSUMER_ROLES.includes(session.role)) {
    return (
      <ConsumerShell
        role={session.role}
        permissions={permissions}
        displayName={session.displayName}
        signOut={<SignOutButton />}
        bell={<NotificationBell userId={session.id} />}
      >
        {children}
      </ConsumerShell>
    );
  }

  const org = session.orgId
    ? await prisma.organization.findFirst({
        where: { id: session.orgId, deletedAt: null },
        select: { name: true },
      })
    : null;

  return (
    <ConsoleShell
      role={session.role}
      permissions={permissions}
      orgName={org?.name ?? null}
      displayName={session.displayName}
      signOut={<SignOutButton full />}
      bell={<NotificationBell userId={session.id} />}
    >
      {children}
    </ConsoleShell>
  );
}
