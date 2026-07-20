import type { Metadata } from "next";
import Link from "next/link";

import { TotpSetup } from "@/app/(app)/account/totp-setup";
import { requireUser } from "@/lib/auth/session";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="Account" description="Your sign-in details and security settings." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sign-in</CardTitle>
            <CardDescription>Your username cannot be changed by you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Username</dt>
                <dd className="font-mono">{user.username}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Name</dt>
                <dd>{user.displayName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Role</dt>
                <dd>{user.role.replace(/_/g, " ").toLowerCase()}</dd>
              </div>
            </dl>

            <Link href="/change-password" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Change password
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Two-factor authentication</CardTitle>
            <CardDescription>
              Optional. Uses an authenticator app — HealthLocker sends no email or SMS.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* The secret is minted by an explicit action, not on render — see
                beginTotpAction. */}
            <TotpSetup enabled={user.twoFactorEnabled} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
