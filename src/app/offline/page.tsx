import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * Served by the service worker when a navigation fails. Static and
 * self-contained: it has to render with no network and no session.
 *
 * It deliberately does not claim any data is available offline. Nothing
 * authenticated is cached — a stale prescription shown as current would be worse
 * than showing nothing.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <WifiOff aria-hidden className="size-7" />
      </span>

      <div className="max-w-sm space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">You are offline</h1>
        <p className="text-sm text-muted-foreground">
          HealthLocker needs a connection to show your records. Your medical information is never
          stored on this device, so nothing is available until you reconnect.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Try again
      </Link>
    </main>
  );
}
