"use client";

import { useEffect } from "react";

// Registers the service worker (idempotent) AND keeps installed PWAs fresh.
// The SW is served from app/sw.js/route.ts with the commit SHA stamped into it, so its
// bytes change every deploy. On mount and on every return-to-foreground we call reg.update();
// when it finds a new worker, the worker skipWaiting()s + claims clients, firing
// 'controllerchange' — we then reload ONCE to pick up the new HTML + JS chunks. Without this,
// an installed standalone PWA keeps running the old in-memory bundle until a true cold launch.
//
// Permission requests stay in PushOptIn (must be user-gesture triggered on iOS).

// Module-level so a re-mount can't trigger a second reload (guards the reload loop).
let reloaded = false;

export default function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;

    // If the page already had a controller at mount, a later controllerchange means a NEW
    // worker replaced the old one (a deploy) -> reload. On a first-ever install there is no
    // prior controller, so the initial clients.claim() must NOT trigger a reload.
    const hadController = !!sw.controller;

    let reg: ServiceWorkerRegistration | undefined;
    sw.register("/sw.js", { scope: "/" })
      .then((r) => {
        reg = r;
        r.update().catch(() => {});
      })
      .catch(() => {
        /* registration failures are non-fatal */
      });

    // Re-check for a new worker whenever the PWA returns to the foreground. iOS standalone
    // PWAs fire `visibilitychange` inconsistently on app-switch resume, so also bind
    // `pageshow` (covers bfcache restore) and `focus` — otherwise a resumed (not cold-launched)
    // install can miss the deploy entirely.
    const checkForUpdate = () => reg?.update().catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);

    const onControllerChange = () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    };
    sw.addEventListener("controllerchange", onControllerChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
      sw.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
