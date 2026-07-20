"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { NAV_BY_ROLE } from "@/modules/identity/navigation";
import type { Role } from "@/shared/enums";
import type { PermissionKey } from "@/shared/permissions";

/**
 * Patient shell: a calm top bar and a thumb-reachable bottom bar on mobile,
 * which is where most patients will be. Deliberately different from the provider
 * console — someone checking whether they took a tablet needs different
 * ergonomics from a receptionist working a queue all day.
 *
 * Takes `role` + `permissions` rather than a nav array, for the same reason as
 * ConsoleShell: icon components cannot cross the server→client boundary.
 */

interface ConsumerShellProps {
  role: Role;
  permissions: string[];
  displayName: string;
  signOut: ReactNode;
  children: ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ConsumerShell({
  role,
  permissions,
  displayName,
  signOut,
  children,
}: ConsumerShellProps) {
  const pathname = usePathname();

  const nav = NAV_BY_ROLE[role].filter(
    (item) => !item.permission || permissions.includes(item.permission as PermissionKey),
  );
  // Bottom bar holds the five most-used destinations; the rest stay in the top
  // bar. More than five and the targets get too narrow to hit reliably.
  const primary = nav.slice(0, 5);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4">
          <Link href="/patient" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
            >
              H
            </span>
            <span className="text-base font-semibold tracking-tight">HealthLocker</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{displayName}</span>
            {signOut}
          </div>
        </div>

        {/* Desktop gets the full set inline; mobile uses the bottom bar. */}
        <nav aria-label="Primary" className="mx-auto hidden max-w-3xl px-4 sm:block">
          <ul className="flex gap-1 pb-2">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-primary-subtle font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      {/* pb-24 on mobile keeps content clear of the fixed bottom bar. */}
      <main id="main" className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:pb-10">
        {children}
      </main>

      {/* pb-[env(safe-area-inset-bottom)] keeps the bar clear of the iOS home
          indicator once the app is installed to the home screen. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="mx-auto flex max-w-3xl">
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px]",
                    active ? "font-medium text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
