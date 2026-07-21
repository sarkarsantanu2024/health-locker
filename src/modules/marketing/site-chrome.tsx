"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { buttonVariants } from "@/ui/button";

/**
 * Public site header and footer.
 *
 * Deliberately separate from the app shells: this is the one surface an
 * anonymous visitor sees, and it has a different job — explain the product and
 * get out of the way. It never renders a link into the app, because every one of
 * those would bounce off the auth guard.
 */

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#providers", label: "For providers" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#security", label: "Security" },
];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-sm font-bold text-white shadow-sm"
      >
        H
      </span>
      <span className="text-base font-semibold tracking-tight">HealthLocker</span>
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header
      data-app-chrome
      className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-lg"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Wordmark />

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonVariants({ size: "sm" })}>
            Get started
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border bg-background md:hidden">
          <nav aria-label="Primary" className="mx-auto max-w-6xl space-y-1 px-4 py-3">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
            <div className="flex gap-2 pt-2">
              <Link
                href="/login"
                className={buttonVariants({ variant: "secondary", size: "md", full: true })}
              >
                Sign in
              </Link>
              <Link href="/signup" className={buttonVariants({ size: "md", full: true })}>
                Get started
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer data-app-chrome className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-xs space-y-3">
            <Wordmark />
            <p className="text-sm text-muted-foreground">
              Your family&apos;s health records, in one place. Built in India, for India.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            <div className="space-y-2">
              <p className="font-medium">Product</p>
              <Link href="/#features" className="block text-muted-foreground hover:text-foreground">
                For patients
              </Link>
              <Link href="/#providers" className="block text-muted-foreground hover:text-foreground">
                For providers
              </Link>
              <Link href="/pricing" className="block text-muted-foreground hover:text-foreground">
                Pricing
              </Link>
            </div>

            <div className="space-y-2">
              <p className="font-medium">Trust</p>
              <Link href="/#security" className="block text-muted-foreground hover:text-foreground">
                Security
              </Link>
              <Link href="/#security" className="block text-muted-foreground hover:text-foreground">
                Your data rights
              </Link>
            </div>

            <div className="space-y-2">
              <p className="font-medium">Account</p>
              <Link href="/login" className="block text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
              <Link href="/signup" className="block text-muted-foreground hover:text-foreground">
                Create an account
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} HealthLocker</p>
          <p>
            HealthLocker stores records. It does not give medical advice — always talk to your
            doctor.
          </p>
        </div>
      </div>
    </footer>
  );
}
