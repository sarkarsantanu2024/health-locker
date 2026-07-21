import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Illustration } from "@/ui/illustration";
import { LogoMark } from "@/ui/logo";

/**
 * Unauthenticated shell.
 *
 * Two columns on a large screen: the form on the left, and a quiet restatement
 * of what the product is on the right. Someone arriving at a bare sign-in box
 * from a link has no way to tell what they are signing in to — and the panel
 * costs nothing, because it collapses away entirely on a phone.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-2">
      {/* --- form side ----------------------------------------------------- */}
      <div className="flex min-h-dvh flex-col px-4 py-8 sm:px-8 lg:min-h-0">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <Link href="/" className="press flex items-center gap-2.5 rounded-xl">
            <LogoMark className="size-9 shrink-0 rounded-xl shadow-sm" />
            <span className="text-base font-semibold tracking-tight">
              Health<span className="text-primary">Locker</span>
            </span>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Home
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <main id="main" className="w-full max-w-lg">
            {children}
          </main>
        </div>

        <p className="mx-auto max-w-lg text-center text-xs text-muted-foreground">
          HealthLocker never sends email or SMS. Everything happens in the app.
        </p>
      </div>

      {/* --- brand side ---------------------------------------------------- */}
      <aside
        data-app-chrome
        className="relative hidden overflow-hidden bg-brand-gradient p-12 lg:flex lg:flex-col lg:justify-center"
      >
        <div className="relative z-10 max-w-md text-white">
          <h2 className="text-3xl font-semibold tracking-tight">
            Your family&apos;s health records, in one place
          </h2>
          <p className="mt-4 text-white/85">
            Prescriptions, lab reports, medicines, vaccinations and bills — for you, your children
            and your parents.
          </p>

          <ul className="mt-10 space-y-4 text-sm">
            {[
              "Every read of your record is logged",
              "Identifiers encrypted in the database, not just in transit",
              "Download or delete your data whenever you want",
              "No ads, and nothing sold to anyone",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/70" />
                <span className="text-white/90">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Decorative only, and empty, so they carry no meaning to announce. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-24 size-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-24 size-80 rounded-full bg-white/10 blur-3xl"
        />
        {/* The mark, oversized and half off the panel — brand as texture. */}
        <div aria-hidden className="pointer-events-none absolute -bottom-16 right-6 opacity-25">
          <Illustration name="shield" tone="teal" className="h-64" />
        </div>
      </aside>
    </div>
  );
}
