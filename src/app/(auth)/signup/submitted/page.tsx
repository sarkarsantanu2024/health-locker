import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";

export const metadata: Metadata = { title: "Account created" };

/**
 * Deliberately shows no account detail. This page is reachable by anyone who
 * knows the URL, so confirming a username or plan here would leak it.
 */
export default function SignupSubmittedPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Account created</CardTitle>
        <CardDescription>One step left before you can sign in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ol className="space-y-3">
          <li className="flex gap-3">
            <span className="font-mono text-muted-foreground">1.</span>
            <span>We will message you on WhatsApp with payment details.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-muted-foreground">2.</span>
            <span>Pay by UPI, QR or bank transfer and send us the reference number.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-muted-foreground">3.</span>
            <span>
              Once we confirm the payment your account is activated — then sign in with the
              username and password you just chose.
            </span>
          </li>
        </ol>

        <p className="text-muted-foreground">
          Keep your password safe. We never email it, and support cannot read it back to you.
        </p>

        <Link href="/login" className={buttonVariants({ variant: "secondary", full: true })}>
          Go to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
