import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Unauthenticated shell. Centred single column, on the app background rather
 * than plain white so the card reads as a distinct surface.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <main id="main" className="w-full max-w-lg">
          <Link href="/login" className="mb-6 flex items-center justify-center gap-2.5">
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground"
            >
              H
            </span>
            <span className="text-lg font-semibold tracking-tight">HealthLocker</span>
          </Link>

          {children}
        </main>
      </div>

      <footer className="pb-8 text-center text-xs text-muted-foreground">
        Your health records, private and in one place.
      </footer>
    </div>
  );
}
