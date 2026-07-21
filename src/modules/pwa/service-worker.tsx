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

    /*
     * NEVER in development.
     *
     * The worker caches /_next/static cache-first, which is safe in production
     * because those URLs are content-hashed — a new build is a new URL. Turbopack
     * dev chunks are NOT hashed: the path stays the same and the contents change
     * on every edit. Caching them pins the browser to whatever JavaScript it saw
     * first, which then hydrates against freshly rendered HTML and fails, and
     * posts stale Server Action ids that the running server has never heard of.
     *
     * Worse, it is self-sustaining: the stale bundle is the very code that would
     * have fixed it. So dev actively tears down any worker and cache left behind
     * by a production build on the same origin.
     */
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .then(async (unregistered) => {
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
          }

          // One reload is needed to escape the cached bundle currently running.
          if (unregistered.some(Boolean)) {
            console.warn("[pwa] removed a development service worker — reloading once");
            window.location.reload();
          }
        })
        .catch(() => undefined);

      return;
    }

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
