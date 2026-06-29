import { NextResponse } from "next/server";

// The service worker is served from a ROUTE (not public/) on purpose: its bytes must
// change every deploy so an installed standalone PWA can detect a new version. We stamp
// the build's commit SHA into SW_VERSION; on the next foreground, RegisterSW's reg.update()
// sees new bytes -> the new worker installs, skipWaiting()s, claims clients, fires
// 'controllerchange' -> RegisterSW reloads once -> fresh document + JS chunks. Without this,
// iOS keeps running the old in-memory bundle until a true cold launch.
//
// SECURITY INVARIANT: this SW has NO `fetch` handler, so it NEVER caches anything — including
// /api/* (which must never be cached). Do not add a fetch handler without a hard early-return
// for /api/* and non-GET requests.
export const dynamic = "force-dynamic";

const BUILD = process.env.VERCEL_GIT_COMMIT_SHA || "dev";

const SW_SOURCE = `/* OctoTusk service worker — served dynamically; bytes change per deploy.
 * Web push + notification click only. NO fetch caching — a trading dashboard must never
 * serve stale prices, and /api/* must never be cached. 'activate' purges old caches.
 */
const SW_VERSION = "octotusk-${BUILD}";

self.addEventListener("install", () => {
  // Activate a new deploy's SW immediately so it takes control and fires controllerchange.
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
`;

export async function GET() {
  return new NextResponse(SW_SOURCE, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Broaden scope to the whole origin even though served from /sw.js.
      "Service-Worker-Allowed": "/",
      // Always revalidate the worker script so a new deploy is picked up promptly.
      "Cache-Control": "no-cache, must-revalidate",
    },
  });
}
