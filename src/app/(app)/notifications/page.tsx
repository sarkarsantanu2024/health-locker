import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { listNotifications } from "@/modules/notify/notify.service";
import { buttonVariants } from "@/ui/button";
import { PageHeader } from "@/ui/page-header";

import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id, { take: 50 });

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Reminders and alerts. These are kept even when you have push turned off."
        action={
          <Link
            href="/notifications/settings"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Settings2 aria-hidden className="size-4" />
            Settings
          </Link>
        }
      />

      <NotificationList items={items} />
    </>
  );
}
