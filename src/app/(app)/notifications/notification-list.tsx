"use client";

import {
  Bell,
  CalendarDays,
  CheckCheck,
  FlaskConical,
  Pill,
  Receipt,
  ShieldAlert,
  Syringe,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markAllReadAction, markReadAction, type NotifyActionState } from "@/modules/notify/actions";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/page-header";
import { TONE_STYLES, toneFor, type Tone } from "@/ui/tone";

const initial: NotifyActionState = { ok: false };

/**
 * A notification wears the hue of whatever it is about, so a glance down the
 * list separates "your report is ready" (violet) from "take your tablet" (rose)
 * before a word is read. Every row still carries the icon and the title — the
 * colour is a second channel, never the only one.
 */
const TYPE_TONE: Record<string, Tone> = {
  MEDICINE_REMINDER: toneFor("medicine"),
  DRUG_INTERACTION_ALERT: toneFor("alert"),
  APPOINTMENT_REMINDER: toneFor("appointment"),
  REPORT_READY: toneFor("report"),
  VACCINATION_DUE: toneFor("vaccination"),
  PAYMENT_DUE: toneFor("expense"),
  PAYMENT_APPROVED: toneFor("expense"),
  PAYMENT_REJECTED: toneFor("alert"),
  STOCK_EXPIRY: toneFor("inventory"),
  ACCOUNT_NOTICE: toneFor("patient"),
};

const TYPE_ICON: Record<string, LucideIcon> = {
  MEDICINE_REMINDER: Pill,
  DRUG_INTERACTION_ALERT: ShieldAlert,
  APPOINTMENT_REMINDER: CalendarDays,
  REPORT_READY: FlaskConical,
  VACCINATION_DUE: Syringe,
  PAYMENT_DUE: Receipt,
  PAYMENT_APPROVED: Receipt,
  PAYMENT_REJECTED: Receipt,
  STOCK_EXPIRY: Receipt,
  ACCOUNT_NOTICE: UserCog,
};

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

  const tone = TYPE_TONE[item.type] ?? "teal";
  const style = TONE_STYLES[tone];
  const Icon = TYPE_ICON[item.type] ?? Bell;

  return (
    <li
      className={cn(
        "bg-hue-wash flex flex-wrap items-start gap-3 rounded-console border bg-surface p-4",
        style.gradientVars,
        // Unread keeps the hue on its edge; read steps back to a plain card.
        read ? "border-border opacity-90" : style.border,
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          read ? "bg-muted text-muted-foreground" : style.chipSolid,
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>

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
        art="bell"
        tone={toneFor("alert")}
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
