import Link from "next/link";

import { buttonVariants } from "@/ui/button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div className="space-y-2">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">We could not find that page</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The link may be out of date, or you may not have access to it.
        </p>
      </div>

      {/* "/" resolves to the right portal for whoever is signed in, and to the
          login screen for anyone who is not. */}
      <Link href="/" className={buttonVariants({ variant: "primary" })}>
        Go to my dashboard
      </Link>
    </div>
  );
}
