import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/app/(auth)/signup/signup-form";
import { listSignupPlans } from "@/modules/identity/signup.service";
import { Alert } from "@/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";

export const metadata: Metadata = { title: "Create an account" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const plans = await listSignupPlans();

  return (
    <div className="w-full">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create your HealthLocker account</CardTitle>
          <CardDescription>
            For individuals and families. Clinics, hospitals, diagnostic centres and pharmacies
            are set up by our team — get in touch instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert tone="info">
            You choose your own username and password now. Your account is activated once we
            confirm your payment — we will message you on WhatsApp.
          </Alert>

          <SignupForm plans={plans} />

          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
