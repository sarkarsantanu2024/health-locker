"use client";

import { MoreHorizontal, UserCog, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { NAV_BY_ROLE, type NavItem } from "@/modules/identity/navigation";
import type { Role } from "@/shared/enums";
import type { PermissionKey } from "@/shared/permissions";
import { Logo } from "@/ui/logo";
import { TONE_STYLES, toneFor, type Tone } from "@/ui/tone";

/**
 * Patient shell — an Android app that happens to be built with web technology.
 *
 * The things that make it read as an app rather than a website, in order of how
 * much they matter:
 *
 *  1. **A fixed app bar and tab bar**, both inside the safe areas, so content
 *     scrolls *under* them instead of the whole page moving as one sheet.
 *  2. **The app bar names the screen**, the way a native one does. A logo that
 *     never changes tells you nothing about where you are.
 *  3. **Five tabs, then "More".** More than five targets on a phone and they
 *     get too narrow to hit; the overflow sheet is the standard answer.
 *  4. **Press feedback on touch.** Hover does nothing on a touchscreen, so the
 *     active state is what confirms the tap landed.
 *  5. **No sign-out in the chrome.** Native apps bury it in account settings —
 *     putting it next to the tabs invites a mis-tap that loses your place.
 *
 * Takes `role` + `permissions` rather than a nav array, because the nav table
 * holds Lucide icon components and a function cannot cross the server→client
 * boundary.
 */

interface ConsumerShellProps {
  role: Role;
  permissions: string[];
  displayName: string;
  signOut: ReactNode;
  bell?: ReactNode;
  children: ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The deepest matching nav entry wins, so /patient/timeline beats /patient. */
function currentItem(pathname: string, nav: NavItem[]): NavItem | undefined {
  return [...nav]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActive(pathname, item.href));
}

/**
 * A tab carries the hue of the thing behind it, not the brand's.
 *
 * A single teal indicator tells you only *that* something is selected; six hues
 * tell you *which*, and they are the same six the destination screen is painted
 * in — so the tab bar becomes a legend for the app rather than decoration.
 * Domains that already own a hue read it out of `DOMAIN_TONE`; the rest are
 * spelled here because they are shell concepts, not record kinds.
 */
const NAV_TONE: Record<string, Tone> = {
  "/patient": "teal", // home wears the brand
  "/patient/timeline": toneFor("document"),
  "/patient/medicines": toneFor("medicine"),
  "/patient/reports": toneFor("report"),
  "/patient/family": toneFor("family"),
  "/patient/emergency": toneFor("alert"),
  "/patient/billing": toneFor("expense"),
  "/notifications": toneFor("expense"),
  "/account": toneFor("vaccination"),
};

function navTone(href: string): Tone {
  return NAV_TONE[href] ?? "teal";
}

export function ConsumerShell({
  role,
  permissions,
  displayName,
  signOut,
  bell,
  children,
}: ConsumerShellProps) {
  const pathname = usePathname();
  /*
   * The sheet remembers which screen it was opened on, and is treated as closed
   * anywhere else. Deriving it during render rather than closing it from an
   * effect means it is already closed on the first frame of the new screen —
   * and it handles the back button, which an onClick handler would miss.
   */
  const [sheet, setSheet] = useState({ open: false, path: pathname });
  const moreOpen = sheet.open && sheet.path === pathname;
  const setMoreOpen = (open: boolean) => setSheet({ open, path: pathname });

  const [scrolled, setScrolled] = useState(false);

  const nav = NAV_BY_ROLE[role].filter(
    (item) => !item.permission || permissions.includes(item.permission as PermissionKey),
  );

  // Five tabs, and everything else behind "More".
  const tabs = nav.slice(0, 4);
  const overflow = nav.slice(4);

  const active = currentItem(pathname, nav);
  const title = active && active.href !== nav[0]?.href ? active.label : "HealthLocker";

  // The app bar gains a hairline and a shadow only once content is behind it —
  // a permanently shadowed bar looks detached at rest.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);

    // The initial read is deferred a frame so it is not a synchronous setState
    // inside the effect; it also lets a restored scroll position settle first.
    const frame = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className="min-h-dvh bg-background">
      {/* --- app bar -------------------------------------------------------- */}
      <header
        data-app-chrome
        className={cn(
          "fixed inset-x-0 top-0 z-40 bg-background/90 backdrop-blur-lg transition-shadow",
          scrolled && "border-b border-border shadow-sm",
        )}
      >
        <div className="mx-auto flex h-app-bar max-w-3xl items-center gap-3 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {title === "HealthLocker" ? (
              /* The real mark, not a letter in a box: this is the one screen
                 that is branding rather than a named destination. */
              <Logo size="sm" className="min-w-0" />
            ) : (
              <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
            )}
          </div>

          {bell}

          <Link
            href="/account"
            aria-label="Account"
            className="press flex size-10 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary"
          >
            {displayName.trim().charAt(0).toUpperCase() || "?"}
          </Link>

          {/* On a phone this lives in the More sheet, which is the native place
              for it. There is no sheet on desktop, so it has to be here. */}
          <div className="hidden sm:block">{signOut}</div>
        </div>

        {/* Desktop keeps a full nav row; the tab bar is a phone pattern. */}
        <nav aria-label="Primary" className="mx-auto hidden max-w-3xl px-4 sm:block">
          <ul className="no-scrollbar flex gap-1 overflow-x-auto pb-2">
            {nav.map((item) => {
              const current = isActive(pathname, item.href);
              const Icon = item.icon;
              const style = TONE_STYLES[navTone(item.href)];

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                      current
                        ? cn("font-medium", style.chipSolid)
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

      {/*
       * Padded rather than offset: the top padding clears the fixed bar (taller
       * on desktop, which adds the nav row), and the bottom clears the tab bar
       * plus the gesture area.
       */}
      <main
        id="main"
        key={pathname}
        className="animate-app-enter mx-auto max-w-3xl px-4 pb-[calc(var(--app-tabbar-height)+env(safe-area-inset-bottom)+1.5rem)] pt-[calc(var(--app-bar-height)+env(safe-area-inset-top)+1rem)] sm:pb-12 sm:pt-[calc(var(--app-bar-height)+env(safe-area-inset-top)+3.5rem)]"
      >
        {children}
      </main>

      {/* --- overflow sheet -------------------------------------------------- */}
      {moreOpen ? (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
          />

          <div
            data-app-chrome
            className="animate-app-enter absolute inset-x-0 bottom-0 rounded-t-consumer border-t border-border bg-surface pb-safe shadow-xl"
          >
            <div className="flex items-center justify-between px-5 pt-4">
              <p className="text-sm font-medium text-muted-foreground">More</p>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMoreOpen(false)}
                className="press rounded-full p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="size-5" />
              </button>
            </div>

            <ul className="p-3">
              {overflow.map((item) => {
                const Icon = item.icon;
                const style = TONE_STYLES[navTone(item.href)];

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="press flex items-center gap-3.5 rounded-xl px-3 py-3.5 hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "flex size-10 items-center justify-center rounded-xl",
                          style.chipSolid,
                        )}
                      >
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-border p-3">{signOut}</div>
          </div>
        </div>
      ) : null}

      {/* --- tab bar --------------------------------------------------------- */}
      <nav
        data-app-chrome
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-safe backdrop-blur-lg sm:hidden"
      >
        <ul className="mx-auto flex max-w-3xl">
          {tabs.map((item) => {
            const current = isActive(pathname, item.href);
            const Icon = item.icon;
            const style = TONE_STYLES[navTone(item.href)];

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className="press flex h-16 flex-col items-center justify-center gap-1 px-1"
                >
                  {/* Material's active pill: the indicator, not the icon
                      colour, is what reads at a glance — and it is the
                      destination's own hue, so the bar doubles as a legend. */}
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      current ? style.chipSolid : "text-muted-foreground",
                    )}
                  >
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span
                    className={cn(
                      "truncate text-[11px]",
                      current ? cn("font-medium", style.text) : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}

          {overflow.length > 0 ? (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-expanded={moreOpen}
                className="press flex h-16 w-full flex-col items-center justify-center gap-1 px-1"
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    moreOpen ? "bg-primary-subtle text-primary" : "text-muted-foreground",
                  )}
                >
                  <MoreHorizontal aria-hidden className="size-5" />
                </span>
                <span
                  className={cn(
                    "text-[11px]",
                    moreOpen ? "font-medium text-primary" : "text-muted-foreground",
                  )}
                >
                  More
                </span>
              </button>
            </li>
          ) : (
            <li className="flex-1">
              <Link
                href="/account"
                className="press flex h-16 flex-col items-center justify-center gap-1 px-1"
              >
                <span className="flex h-7 w-12 items-center justify-center rounded-full text-muted-foreground">
                  <UserCog aria-hidden className="size-5" />
                </span>
                <span className="text-[11px] text-muted-foreground">Account</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
