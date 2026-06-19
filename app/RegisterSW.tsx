"use client";

import { useEffect } from "react";

// Registers the service worker on every route (idempotent). Registration only —
// the notification-permission request lives in PushOptIn and must be user-gesture
// triggered (an iOS requirement).
export default function RegisterSW() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* registration failures are non-fatal */
      });
    }
  }, []);
  return null;
}
