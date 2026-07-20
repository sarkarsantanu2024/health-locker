import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const params = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in to HealthLocker</CardTitle>
        <CardDescription>
          Use the username and password your administrator gave you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm passwordChanged={params.changed === "1"} />

        <div className="mt-6 space-y-3 border-t border-border pt-4 text-sm">
          <p className="text-muted-foreground">
            New here?{" "}
            <Link href="/signup" className="underline underline-offset-4 hover:text-foreground">
              Create an account
            </Link>
          </p>
          {/*
            No "forgot password" link, by design: there is no email in this
            product and reset is an admin action. Saying so beats a dead end.
          */}
          <p className="text-xs text-muted-foreground">
            Lost your password? Contact your administrator — they will issue a new one.
            HealthLocker never sends email.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
