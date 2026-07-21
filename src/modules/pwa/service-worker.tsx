"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * Deliberately not in the push toggle: the worker also provides the offline
 * fallback, which everyone needs, while push is opt-in per device. Registering
 * it here means someone who declines notifications still gets a usable page when
 * their train goes into a tunnel.
 *
 * Renders nothing.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // After load, so registration never competes with the first paint on a slow
    // connection — which is exactly when the offline shell matters most.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.warn("[pwa] service worker registration failed", error);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
