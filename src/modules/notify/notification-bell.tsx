import { Bell } from "lucide-react";
import Link from "next/link";

import { unreadCount } from "@/modules/notify/notify.service";

/**
 * Header bell with an unread count.
 *
 * A server component doing one `count` query rather than a client poll: polling
 * every shell render would multiply database reads by every open tab for a
 * number that changes a handful of times a day.
 */
export async function NotificationBell({ userId }: { userId: string }) {
  // A badge is not worth a 500. This renders in the app shell, so a failed count
  // — a Neon cold start is enough — would otherwise take down every page in
  // the product rather than losing one number.
  const count = await unreadCount(userId).catch((error: unknown) => {
    console.warn("[notify] unread count failed", error);
    return 0;
  });

  return (
    <Link
      href="/notifications"
      className="relative flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={count === 0 ? "Notifications" : `Notifications, ${count} unread`}
    >
      <Bell aria-hidden className="size-5" />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
