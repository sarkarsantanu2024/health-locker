import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { NOTIFICATION_META, notificationTypesForRole } from "@/modules/notify/catalog";
import { getPreferences } from "@/modules/notify/notify.service";
import { PushToggle } from "@/modules/notify/push-toggle";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";

import { PreferencesForm } from "./preferences-form";

export const metadata: Metadata = { title: "Notification settings" };
export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const user = await requireUser();

  const types = notificationTypesForRole(user.role);
  const preferences = await getPreferences(user.id, types);

  // Quiet hours are one window across all types; the first row that has one wins.
  const withWindow = preferences.find((preference) => preference.quietHoursStart);

  return (
    <>
      <PageHeader
        title="Notification settings"
        description="Web push and in-app only — HealthLocker never sends email or SMS."
        action={
          <Link href="/notifications" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </Link>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>This device</CardTitle>
            <CardDescription>
              Push has to be turned on once per browser. Turning it on here does not affect your
              other devices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* The VAPID public key is public by design — it is what the browser
                encrypts to. The private key never leaves the server. */}
            <PushToggle vapidPublicKey={env.VAPID_PUBLIC_KEY ?? null} />
          </CardContent>
        </Card>

        <PreferencesForm
          rows={preferences.map((preference) => ({
            type: preference.type,
            label: NOTIFICATION_META[preference.type].label,
            description: NOTIFICATION_META[preference.type].description,
            webPush: preference.webPush,
          }))}
          quietHours={{
            start: withWindow?.quietHoursStart ?? null,
            end: withWindow?.quietHoursEnd ?? null,
          }}
        />
      </div>
    </>
  );
}
