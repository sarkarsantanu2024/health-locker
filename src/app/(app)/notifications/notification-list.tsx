"use client";

import { CheckCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { formatDateTime } from "@/lib/format";
import { markAllReadAction, markReadAction, type NotifyActionState } from "@/modules/notify/actions";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/page-header";

const initial: NotifyActionState = { ok: false };

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

function PendingButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} disabled={pending}>
      {children}
    </Button>
  );
}

function Row({ item }: { item: NotificationItem }) {
  const [state, action] = useActionState(markReadAction, initial);
  const read = Boolean(item.readAt) || state.ok;

  return (
    <li
      className={
        "flex flex-wrap items-start gap-3 rounded-console border p-4 " +
        (read ? "border-border bg-surface" : "border-primary/30 bg-primary-subtle/40")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{item.title}</p>
          {read ? null : <Badge tone="primary">New</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {item.url ? (
          <Link
            href={item.url}
            className="text-sm font-medium text-primary underline underline-offset-4"
          >
            Open
          </Link>
        ) : null}
        {read ? null : (
          <form action={action}>
            <input type="hidden" name="notificationId" value={item.id} />
            <PendingButton type="submit" variant="ghost" size="sm">
              Mark read
            </PendingButton>
          </form>
        )}
      </div>
    </li>
  );
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const [state, action] = useActionState(markAllReadAction, initial);
  const unread = items.filter((item) => !item.readAt).length;

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing yet"
        description="Reminders, report alerts and payment updates will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {unread > 0 && !state.ok ? (
        <form action={action}>
          <PendingButton type="submit" variant="secondary" size="sm">
            <CheckCheck aria-hidden className="size-4" />
            Mark all {unread} as read
          </PendingButton>
        </form>
      ) : null}

      <ul className="space-y-2">
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}
