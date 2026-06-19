"use client";

import { useCallback, useEffect, useState } from "react";

// Standard VAPID key decoder.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    // iOS Safari legacy flag
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

type State = "loading" | "unsupported" | "ios-needs-install" | "default" | "subscribed" | "denied";

// Compact push opt-in control. Mirrors the codebase's alert()-based UX for guidance.
// On iOS, push only works from the installed (home-screen) PWA — so the enable CTA is
// gated behind installed-standalone detection; otherwise we show install guidance.
export default function PushOptIn() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  const detect = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    if (isIOS && !isStandalone()) return setState("ios-needs-install");
    if (!supported) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") {
        // Re-sync to the server (idempotent) — refreshes last_seen / re-adds if pruned.
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON(), userAgent: ua }),
        }).catch(() => {});
        return setState("subscribed");
      }
    } catch {
      /* fall through */
    }
    setState("default");
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        alert("Push isn't configured yet (missing VAPID public key).");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "default");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
      });
      if (!res.ok) {
        alert("Could not save your subscription. Try again.");
        return;
      }
      setState("subscribed");
    } catch {
      alert("Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Test failed.");
      } else if (!data.sent) {
        alert("Subscribed, but no device received it — check OS notification settings for OctoTusk.");
      }
      // On success the notification appears on its own.
    } catch {
      alert("Test failed.");
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState("default");
    } finally {
      setBusy(false);
    }
  }, []);

  if (state === "loading" || state === "unsupported") return null;

  const style = { fontSize: "var(--text-xs)" } as const;

  if (state === "ios-needs-install") {
    return (
      <button
        className="btn btn-ghost btn-sm"
        style={style}
        onClick={() =>
          alert(
            "To get alerts on iPhone:\n\n1. Tap the Share icon\n2. Choose “Add to Home Screen”\n3. Open OctoTusk from the Home Screen\n4. Then tap “Enable alerts”"
          )
        }
      >
        🔔 Add to Home Screen
      </button>
    );
  }
  if (state === "denied") {
    return (
      <button
        className="btn btn-ghost btn-sm"
        style={style}
        onClick={() =>
          alert("Notifications are blocked. Enable them in iOS Settings → Notifications → OctoTusk (or your browser's site settings).")
        }
      >
        🔔 Blocked
      </button>
    );
  }
  if (state === "subscribed") {
    return (
      <span className="flex items-center gap-1">
        <button className="btn btn-ghost btn-sm" style={style} onClick={sendTest} title="Send a test notification to this device">Send test</button>
        <button className="btn btn-ghost btn-sm" style={{ ...style, color: "var(--color-accent-blue)" }} disabled={busy} onClick={unsubscribe} title="Notifications on — click to turn off">
          🔔 On
        </button>
      </span>
    );
  }
  return (
    <button className="btn btn-ghost btn-sm" style={style} disabled={busy} onClick={subscribe}>
      🔔 Enable alerts
    </button>
  );
}
