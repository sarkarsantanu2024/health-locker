import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/app/(auth)/change-password/change-password-form";
import { getSession } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";

export const metadata: Metadata = { title: "Change password" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  // Deliberately getSession, not requireUser: a user with mustChangePassword is
  // blocked by requireUser, and this is the one page they must be able to reach.
  const session = await getSession();

  if (!session) redirect("/login");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {session.mustChangePassword ? "Set your password" : "Change password"}
        </CardTitle>
        <CardDescription>Signed in as {session.username}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm forced={session.mustChangePassword} />
      </CardContent>
    </Card>
  );
}
