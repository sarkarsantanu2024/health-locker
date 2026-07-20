import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { logoutAction } from "@/modules/identity/actions";
import { ConsoleShell } from "@/modules/identity/console-shell";
import { ConsumerShell } from "@/modules/identity/consumer-shell";
import { NAV_BY_ROLE, PORTAL_LABEL } from "@/modules/identity/navigation";
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
 * Navigation is filtered by the session's permissions, but hiding a link is
 * presentation, not protection: every destination runs its own guard.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  const nav = NAV_BY_ROLE[session.role].filter(
    (item) => !item.permission || session.permissions.includes(item.permission),
  );
  const roleLabel = session.role.replace(/_/g, " ").toLowerCase();

  if (CONSUMER_ROLES.includes(session.role)) {
    return (
      <ConsumerShell nav={nav} displayName={session.displayName} signOut={<SignOutButton />}>
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
      nav={nav}
      portalLabel={PORTAL_LABEL[session.role]}
      orgName={org?.name ?? null}
      displayName={session.displayName}
      roleLabel={roleLabel}
      signOut={<SignOutButton full />}
    >
      {children}
    </ConsoleShell>
  );
}
