/* HealthLocker service worker — Web Push (Phase 5) and offline shell (Phase 12).
 *
 * Deliberately conservative about what it caches. This is health data: a stale
 * cached prescription is worse than no prescription, so nothing under /api/ and
 * no authenticated HTML page is ever served from cache. Only the static shell
 * and the offline fallback are cached, and navigations fall back to that page
 * only when the network genuinely fails.
 */

const CACHE = "healthlocker-shell-v2";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/icon-maskable.svg", "/manifest.webmanifest"];

/*
 * A service worker has no business on a development origin.
 *
 * Turbopack's dev chunks live at stable, unhashed URLs whose contents change on
 * every edit, so caching them pins the browser to the first JavaScript it ever
 * saw. That then hydrates against freshly rendered HTML and fails, and posts
 * Server Action ids the running server has never heard of.
 *
 * This worker therefore retires itself on localhost. It matters that the check
 * lives HERE and not only in the registration code: once a stale bundle is being
 * served, that bundle is the very code that would have fixed the problem, so the
 * escape hatch has to be inside the worker.
 */
const IS_DEV_ORIGIN = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

self.addEventListener("install", (event) => {
  if (IS_DEV_ORIGIN) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one missing asset does not fail the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  if (IS_DEV_ORIGIN) {
    // Drop every cache, hand the pages back to the network, and unregister. The
    // next reload is served entirely by the dev server.
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.matchAll({ type: "window" }))
        .then((clients) => clients.forEach((client) => client.navigate(client.url))),
    );
    return;
  }

  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // On a dev origin this worker is on its way out; touch nothing meanwhile.
  if (IS_DEV_ORIGIN) return;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch the API, and never cache another origin.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network first, offline page as the fallback. No HTML is cached,
  // because an authenticated page cached here would be readable by the next
  // person to use the device.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Build assets are content-hashed, so cache-first is safe and makes a repeat
  // visit instant on a poor connection.
  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "HealthLocker", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "HealthLocker";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      // Same tag replaces rather than stacks, so a re-sent reminder does not
      // pile up three identical banners.
      tag: payload.notificationId || payload.type || "healthlocker",
      data: { url: payload.url || "/notifications" },
      requireInteraction: payload.type === "DRUG_INTERACTION_ALERT",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab rather than opening a third copy of the app.
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }

      return self.clients.openWindow(target);
    }),
  );
});
