"use client";

import { Check, Copy, MessageCircle, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";

/**
 * Shows a generated username and password ONCE.
 *
 * This is the whole handover mechanism: HealthLocker sends no email, so the
 * admin copies these and passes them on by WhatsApp or phone. The UI makes that
 * step explicit and slightly uncomfortable on purpose — an admin who closes this
 * panel without copying cannot recover the password, only issue a new one.
 */

export interface Credentials {
  username: string;
  temporaryPassword: string;
  /** Used to prefill the WhatsApp message. */
  phone?: string | null;
  displayName?: string | null;
}

function waLink(phone: string, message: string): string {
  // wa.me needs a country code and no punctuation.
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export function CredentialsPanel({
  credentials,
  onDone,
}: {
  credentials: Credentials;
  onDone?: () => void;
}) {
  const [copied, setCopied] = useState<"none" | "username" | "password" | "both">("none");
  const [acknowledged, setAcknowledged] = useState(false);

  const message = [
    `Hello${credentials.displayName ? ` ${credentials.displayName.split(" ")[0]}` : ""},`,
    "",
    "Your HealthLocker account is ready.",
    "",
    `Username: ${credentials.username}`,
    `Password: ${credentials.temporaryPassword}`,
    "",
    "Please sign in and change your password straight away. We will never ask you for it.",
  ].join("\n");

  const copy = (text: string, which: typeof copied) => {
    void navigator.clipboard.writeText(text);
    setCopied(which);
  };

  return (
    <div className="space-y-4 rounded-xl border-2 border-primary bg-primary-subtle/40 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-semibold">Copy these now — they are shown once</p>
          <p className="text-sm text-muted-foreground">
            The password is not stored in readable form. If you lose it you must issue a new one.
          </p>
        </div>
      </div>

      <dl className="space-y-2">
        {[
          { label: "Username", value: credentials.username, key: "username" as const },
          { label: "Password", value: credentials.temporaryPassword, key: "password" as const },
        ].map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <dt className="w-20 shrink-0 text-sm text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 flex-1">
              <code className="block wrap-break-word rounded-lg bg-surface px-3 py-2 font-mono text-sm">
                {row.value}
              </code>
            </dd>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => copy(row.value, row.key)}
            >
              {copied === row.key ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
            </Button>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => copy(message, "both")}>
          <Copy aria-hidden className="size-4" />
          {copied === "both" ? "Message copied" : "Copy full message"}
        </Button>

        {credentials.phone ? (
          // WhatsApp is sent by hand for now; a Meta Cloud API adapter slots in
          // behind NotificationService later without changing this flow.
          <a
            href={waLink(credentials.phone, message)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-success px-3 text-sm font-medium text-white hover:brightness-110"
          >
            <MessageCircle aria-hidden className="size-4" />
            Open WhatsApp
          </a>
        ) : null}
      </div>

      <label className="flex items-start gap-3 border-t border-border pt-3">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 rounded border-border-strong accent-primary"
        />
        <span className="text-sm">
          I have copied these credentials and sent them to the customer.
        </span>
      </label>

      {onDone ? (
        <Button type="button" size="sm" disabled={!acknowledged} onClick={onDone} full>
          Done
        </Button>
      ) : null}

      {!credentials.phone ? (
        <Alert tone="warning">
          No phone number on file, so there is no WhatsApp link. Copy the message and send it
          another way.
        </Alert>
      ) : null}
    </div>
  );
}
