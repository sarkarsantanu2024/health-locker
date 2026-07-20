import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "@/lib/auth/session";
import { logoutAction } from "@/modules/identity/actions";
import { NAV_BY_ROLE } from "@/modules/identity/navigation";
import { Button } from "@/ui/button";

export const dynamic = "force-dynamic";

/**
 * Authenticated shell. Navigation is derived from the session's role and
 * permissions — a link the user cannot use is never rendered.
 *
 * Hiding a link is presentation, not protection: every destination still runs
 * its own `requirePermission()` server-side.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  const nav = NAV_BY_ROLE[session.role].filter(
    (item) => !item.permission || session.permissions.includes(item.permission),
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight">HealthLocker</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {session.role.replace(/_/g, " ").toLowerCase()}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {session.displayName}
            </span>
            <form action={logoutAction}>
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>

        <nav aria-label="Primary" className="mx-auto w-full max-w-6xl px-4">
          <ul className="flex gap-1 overflow-x-auto pb-2">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="inline-block whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
