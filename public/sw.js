/* OctoTusk service worker — hand-rolled (no build step).
 * Phase 1: web push + notification click handling. NO fetch caching yet — a trading
 * dashboard must never serve stale prices. Offline read caching arrives in Phase 2,
 * gated to slow-changing snapshot data with a staleness banner.
 * Bump SW_VERSION on changes so `activate` purges old caches.
 */
const SW_VERSION = "octotusk-v1";

self.addEventListener("install", () => {
  // Activate this SW immediately so push payload-format changes take effect on next load.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("octotusk-") && k !== SW_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  // iOS revokes the subscription if a push does not result in a visible notification,
  // so always show something.
  const title = data.title || "OctoTusk";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/dashboard" },
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsArr) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              /* navigation across some states can throw; focus is enough */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })()
  );
});
