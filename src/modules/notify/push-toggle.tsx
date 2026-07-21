"use client";

import { BellOff, BellRing } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";

/**
 * Enables or disables Web Push for this browser.
 *
 * Everything here is per-device, not per-account: a push subscription belongs to
 * a browser install. That is why the state is read from the browser on mount
 * rather than passed in from the server — the server knows how many
 * subscriptions exist, but not whether *this* one is among them.
 *
 * The permission prompt is only ever raised from a click. Asking on page load
 * gets denied by reflex, and a denial is sticky — the user then has to go into
 * browser settings to undo it.
 */

type State = "checking" | "unsupported" | "blocked" | "off" | "on" | "not-configured";

/**
 * VAPID keys travel as URL-safe base64; `applicationServerKey` wants raw bytes.
 * Typed as ArrayBuffer rather than Uint8Array because the DOM signature does not
 * accept a view over a possibly-shared buffer.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);

  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);

  return bytes.buffer;
}

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detection is async and runs entirely inside the effect: the initial render
  // must be identical on server and client, so nothing about this browser can be
  // read during render without a hydration mismatch.
  useEffect(() => {
    let cancelled = false;

    async function detect(): Promise<State> {
      if (!vapidPublicKey) return "not-configured";

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
      if (Notification.permission === "denied") return "blocked";

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        return subscription ? "on" : "off";
      } catch {
        return "unsupported";
      }
    }

    void detect().then((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    setBusy(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(vapidPublicKey!),
      });

      const response = await fetch("/api/v1/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) throw new Error("save-failed");

      setState("on");
    } catch {
      setError("Could not turn on push notifications for this device. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Tell the server first: if unsubscribing locally succeeded but the row
        // stayed, every future send would fail against a dead endpoint.
        await fetch("/api/v1/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setState("off");
    } catch {
      setError("Could not turn push off. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "not-configured") {
    return (
      <Alert tone="info">
        Push notifications are not configured on this deployment. In-app notifications still work.
      </Alert>
    );
  }

  if (state === "unsupported") {
    return (
      <Alert tone="info">
        This browser does not support push notifications. On iPhone, add HealthLocker to your home
        screen first — Safari only allows push for installed apps.
      </Alert>
    );
  }

  if (state === "blocked") {
    return (
      <Alert tone="warning">
        Notifications are blocked for this site in your browser settings. Allow them there, then
        reload this page.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Push on this device</p>
          <p className="text-sm text-muted-foreground">
            {state === "on"
              ? "This browser will show reminders even when HealthLocker is closed."
              : "Turn on to get reminders when HealthLocker is closed."}
          </p>
        </div>

        {state === "on" ? (
          <Button type="button" variant="secondary" size="sm" onClick={disable} disabled={busy}>
            <BellOff aria-hidden className="size-4" />
            {busy ? "Turning off…" : "Turn off"}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={enable} disabled={busy || state === "checking"}>
            <BellRing aria-hidden className="size-4" />
            {busy ? "Turning on…" : "Turn on"}
          </Button>
        )}
      </div>
    </div>
  );
}
