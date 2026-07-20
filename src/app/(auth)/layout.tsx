import type { ReactNode } from "react";

/** Centred, single-column shell for the unauthenticated screens. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted px-4 py-10">
      {/* max-w-lg rather than max-w-sm: the signup form has address fields that
          need two columns on a phone-width-plus screen. */}
      <main id="main" className="w-full max-w-lg">
        {children}
      </main>
      <footer className="mt-8 text-center text-xs text-muted-foreground">
        HealthLocker — accounts are issued by an administrator.
      </footer>
    </div>
  );
}
