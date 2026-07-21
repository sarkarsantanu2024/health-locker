import type { ReactNode } from "react";

import { SiteFooter, SiteHeader } from "@/modules/marketing/site-chrome";

/**
 * The public site. Everything under here is reachable without a session and IS
 * indexable — unlike the app, which the (app) layout marks noindex, because
 * health data must never be crawled.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
