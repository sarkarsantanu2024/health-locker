"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";

import { buttonVariants } from "@/ui/button";

/**
 * Opens WhatsApp with a pre-filled message. There is no WhatsApp adapter yet, so
 * every "send" in this product is a human pressing send — this makes that one
 * click instead of copy-paste, and records the attempt so the audit trail is the
 * same shape a real adapter would produce.
 *
 * Renders nothing when there is no number: an unusable button is worse than an
 * absent one.
 */
export function WhatsappButton({
  phone,
  message,
  label = "WhatsApp",
  notificationId = null,
}: {
  phone: string | null | undefined;
  message: string;
  label?: string;
  notificationId?: string | null;
}) {
  const [sent, setSent] = useState(false);

  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 10 ? `91${digits}` : digits;
  const href = `https://wa.me/${national}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={buttonVariants({ variant: "secondary", size: "sm" })}
      onClick={() => {
        setSent(true);
        // Fire-and-forget: the trail row must never delay opening WhatsApp, and
        // failing to log is not a reason to stop the operator sending.
        void fetch("/api/v1/notifications/whatsapp-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId, phone: national }),
          keepalive: true,
        }).catch(() => undefined);
      }}
    >
      <MessageCircle aria-hidden className="size-4" />
      {sent ? "Opened" : label}
    </a>
  );
}
