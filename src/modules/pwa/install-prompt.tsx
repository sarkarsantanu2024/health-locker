"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/ui/button";

/**
 * "Add to home screen".
 *
 * Chrome fires `beforeinstallprompt` and lets us defer it; iOS Safari fires
 * nothing and requires the user to use the Share menu, so iOS gets an
 * instruction instead of a button. That split is the whole reason this component
 * exists rather than a single generic banner.
 *
 * Dismissal is remembered in localStorage — a banner that returns on every page
 * load is an advertisement, not an offer.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "hl.install-prompt.dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;

    // Already installed: `display-mode: standalone` means there is nothing to offer.
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      // Queued rather than set inline: reading the user agent during an effect
      // and updating state in the same tick is a cascading render, and this
      // banner is in no hurry.
      const timer = setTimeout(() => {
        setIosHint(true);
        setDismissed(false);
      }, 0);

      return () => clearTimeout(timer);
    }

    const onPrompt = (event: Event) => {
      // Chrome shows its own mini-infobar unless we take the event.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function close() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;

    await deferred.prompt();
    await deferred.userChoice;
    // The event is single-use, whatever the user chose.
    setDeferred(null);
    close();
  }

  if (dismissed || (!deferred && !iosHint)) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-consumer border border-border bg-primary-subtle p-4">
      <Download aria-hidden className="size-5 shrink-0 text-primary" />

      <p className="min-w-0 flex-1 text-sm">
        {iosHint ? (
          <>
            Add HealthLocker to your home screen: tap <strong>Share</strong>, then{" "}
            <strong>Add to Home Screen</strong>. On iPhone this is also what enables reminders.
          </>
        ) : (
          "Install HealthLocker for quicker access and reminders when the app is closed."
        )}
      </p>

      {deferred ? (
        <Button type="button" size="sm" onClick={install}>
          Install
        </Button>
      ) : null}

      <button
        type="button"
        onClick={close}
        aria-label="Dismiss install prompt"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
