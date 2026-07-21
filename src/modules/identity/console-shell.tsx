"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { NAV_BY_ROLE, PORTAL_LABEL, type NavItem } from "@/modules/identity/navigation";
import type { Role } from "@/shared/enums";
import type { PermissionKey } from "@/shared/permissions";
import { Logo } from "@/ui/logo";
import { TONE_STYLES, toneFromString } from "@/ui/tone";

/**
 * Provider console: fixed left sidebar on desktop, slide-over drawer on mobile.
 * A sidebar rather than a top bar because each portal runs to 7–9 sections,
 * which would overflow a horizontal nav on a laptop.
 *
 * Denser than the patient app — a receptionist works this all day — but still a
 * product rather than an admin panel: the sidebar sits on its own surface, the
 * active item is a filled pill instead of a highlighted row, and the drawer on
 * mobile behaves like an app's, with press feedback and safe-area padding.
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
  /** Server-rendered so the unread count is fresh without a client poll. */
  bell?: ReactNode;
  children: ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  // Exact match for section roots, prefix match for their children — otherwise
  // "/clinic" would light up on every page in the clinic portal.
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The deepest match wins, so /clinic/patients does not also light up /clinic. */
function currentItem(pathname: string, nav: NavItem[]): NavItem | undefined {
  return [...nav]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActive(pathname, item.href));
}

function NavLinks({ nav, onNavigate }: { nav: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = currentItem(pathname, nav);

  return (
    <ul className="space-y-1">
      {nav.map((item) => {
        const current = active?.href === item.href;
        const Icon = item.icon;
        const style = TONE_STYLES[item.tone];

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={current ? "page" : undefined}
              className={cn(
                "press relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm transition-colors",
                style.gradientVars,
                current
                  ? cn(style.chip, style.text, "font-semibold shadow-sm")
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {/* Weight and a bar carry "current" as well as the tint does, so
                  the state survives greyscale and colour-blindness (WCAG 1.4.1). */}
              {current ? (
                <span
                  aria-hidden
                  className="bg-hue-gradient absolute inset-y-2 left-0 w-1 rounded-r-full"
                />
              ) : null}
              <Icon
                aria-hidden
                className={cn("size-4.5 shrink-0", current ? "" : style.text)}
              />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ConsoleShell({
  role,
  permissions,
  orgName,
  displayName,
  signOut,
  bell,
  children,
}: ConsoleShellProps) {
  const pathname = usePathname();
  /*
   * The drawer remembers which screen it was opened on and is treated as closed
   * anywhere else — derived during render rather than closed from an effect, so
   * it is already shut on the first frame of the new screen and the back button
   * behaves.
   */
  const [drawer, setDrawer] = useState({ open: false, path: pathname });
  const drawerOpen = drawer.open && drawer.path === pathname;
  const setDrawerOpen = (open: boolean) => setDrawer({ open, path: pathname });

  const portalLabel = PORTAL_LABEL[role];
  const roleLabel = role.replace(/_/g, " ").toLowerCase();
  const nav = NAV_BY_ROLE[role].filter(
    (item) => !item.permission || permissions.includes(item.permission as PermissionKey),
  );

  const active = currentItem(pathname, nav);
  const ActiveIcon = active?.icon;
  const activeStyle = active ? TONE_STYLES[active.tone] : null;
  /* Stable per person rather than always teal, so two people sharing a station
     can tell at a glance whose session is open. */
  const avatar = TONE_STYLES[toneFromString(displayName)];

  return (
    <div className="min-h-dvh bg-background">
      {/* --- desktop sidebar ------------------------------------------------ */}
      <aside
        data-app-chrome
        className="bg-mesh fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex"
      >
        <div className="px-4 py-5">
          <Logo subtitle={portalLabel} />
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-3">
          <NavLinks nav={nav} />
        </nav>

        <div className="border-t border-border bg-surface/70 p-3">
          <div className="mb-2 flex items-center gap-3 px-2">
            <span
              aria-hidden
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                avatar.chipSolid,
              )}
            >
              {displayName.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-medium">{displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">{roleLabel}</span>
            </span>
          </div>
          {signOut}
        </div>
      </aside>

      {/* --- mobile drawer --------------------------------------------------- */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
          />

          <div
            data-app-chrome
            className="bg-mesh absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-surface pt-safe shadow-xl"
          >
            <div className="flex items-center justify-between px-4 py-4">
              <Logo subtitle={portalLabel} />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="press rounded-full p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-3">
              <NavLinks nav={nav} onNavigate={() => setDrawerOpen(false)} />
            </nav>

            <div className="border-t border-border p-3 pb-safe">
              <p className="truncate px-3 text-sm font-medium">{displayName}</p>
              <p className="truncate px-3 pb-2 text-xs text-muted-foreground">{roleLabel}</p>
              {signOut}
            </div>
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        {/* --- top bar ------------------------------------------------------ */}
        <header
          data-app-chrome
          className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-lg"
        >
          <div className="flex h-app-bar items-center gap-2 px-3 sm:px-4">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
              className="press rounded-xl p-2 text-muted-foreground hover:bg-muted lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            {/* The section's own mark, in the section's own hue: the app bar
                answers "where am I" with a shape as well as a word. */}
            {ActiveIcon && activeStyle ? (
              <span
                aria-hidden
                className={cn(
                  "hidden size-8 shrink-0 items-center justify-center rounded-lg sm:flex",
                  activeStyle.chipSolid,
                )}
              >
                <ActiveIcon className="size-4" />
              </span>
            ) : null}

            <div className="min-w-0 flex-1 leading-tight">
              {/* The section name is what tells you where you are; the org name
                  is context, so it is secondary. */}
              <p className="truncate text-sm font-semibold tracking-tight">
                {active?.label ?? portalLabel}
              </p>
              {orgName ? (
                <p className="truncate text-xs text-muted-foreground">{orgName}</p>
              ) : null}
            </div>

            {bell}
          </div>
        </header>

        <main
          id="main"
          key={pathname}
          className="animate-app-enter mx-auto max-w-7xl p-4 pb-16 sm:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
