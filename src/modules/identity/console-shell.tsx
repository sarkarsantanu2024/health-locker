"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { NAV_BY_ROLE, PORTAL_LABEL, type NavItem } from "@/modules/identity/navigation";
import type { Role } from "@/shared/enums";
import type { PermissionKey } from "@/shared/permissions";

/**
 * Provider console shell: fixed left sidebar on desktop, slide-over drawer on
 * mobile. Chosen over a top bar because Phases 7–11 push each portal to 7–9
 * sections, which would overflow a horizontal nav on a laptop.
 *
 * Takes `role` + `permissions` rather than a ready-made nav array: the nav table
 * holds Lucide icon components, and a function cannot be serialised across the
 * server→client boundary. Filtering here is presentation only — every
 * destination still enforces its own guard on the server.
 */

interface ConsoleShellProps {
  role: Role;
  permissions: string[];
  orgName: string | null;
  displayName: string;
  signOut: ReactNode;
  children: ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  // Exact match for section roots, prefix match for their children — otherwise
  // "/clinic" would light up on every page in the clinic portal.
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ nav, onNavigate }: { nav: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="space-y-0.5">
      {nav.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary-subtle font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Wordmark({ portalLabel }: { portalLabel: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
      >
        H
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight">HealthLocker</span>
        <span className="block text-xs text-muted-foreground">{portalLabel}</span>
      </span>
    </div>
  );
}

export function ConsoleShell({
  role,
  permissions,
  orgName,
  displayName,
  signOut,
  children,
}: ConsoleShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const portalLabel = PORTAL_LABEL[role];
  const roleLabel = role.replace(/_/g, " ").toLowerCase();
  const nav = NAV_BY_ROLE[role].filter(
    (item) => !item.permission || permissions.includes(item.permission as PermissionKey),
  );

  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="border-b border-border px-4 py-4">
          <Wordmark portalLabel={portalLabel} />
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto p-3">
          <NavLinks nav={nav} />
        </nav>
        <div className="border-t border-border p-3">
          <p className="truncate px-3 text-sm font-medium">{displayName}</p>
          <p className="truncate px-3 pb-2 text-xs text-muted-foreground">{roleLabel}</p>
          {signOut}
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <Wordmark portalLabel={portalLabel} />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav aria-label="Primary" className="flex-1 overflow-y-auto p-3">
              <NavLinks nav={nav} onNavigate={() => setDrawerOpen(false)} />
            </nav>
            <div className="border-t border-border p-3">
              <p className="truncate px-3 text-sm font-medium">{displayName}</p>
              <p className="truncate px-3 pb-2 text-xs text-muted-foreground">{roleLabel}</p>
              {signOut}
            </div>
          </div>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{orgName ?? portalLabel}</p>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-7xl p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
