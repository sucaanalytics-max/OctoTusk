"use client";
import { useCallback, useEffect, useState } from "react";

// Standard VAPID key decoder.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

type State = "loading" | "unsupported" | "ios-needs-install" | "default" | "subscribed" | "denied";

// Mobile push opt-in (re-implements app/dashboard/PushOptIn.tsx with .m-* styles; the
// dashboard one is frozen). Reports subscription state up so the Alerts screen can nudge.
export default function PushOptInM({ onSubscribedChange }: { onSubscribedChange?: (on: boolean) => void }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onSubscribedChange?.(state === "subscribed");
  }, [state, onSubscribedChange]);

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
      if (!res.ok) alert(data.error || "Test failed.");
      else if (!data.sent) alert("Subscribed, but no device received it — check OS notification settings for OctoTusk.");
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

  if (state === "subscribed") {
    return (
      <div className="m-push m-push--on">
        <span className="m-push-txt">🔔 Notifications on</span>
        <span className="m-push-actions">
          <button className="m-chip" onClick={sendTest}>Send test</button>
          <button className="m-chip" disabled={busy} onClick={unsubscribe}>Turn off</button>
        </span>
      </div>
    );
  }

  const cta =
    state === "ios-needs-install" ? (
      <button
        className="m-push-btn"
        onClick={() =>
          alert(
            "To get alerts on iPhone:\n\n1. Tap the Share icon\n2. Choose “Add to Home Screen”\n3. Open OctoTusk from the Home Screen\n4. Then tap “Enable notifications”",
          )
        }
      >
        🔔 Add to Home Screen
      </button>
    ) : state === "denied" ? (
      <button
        className="m-push-btn"
        onClick={() => alert("Notifications are blocked. Enable them in iOS Settings → Notifications → OctoTusk (or your browser's site settings).")}
      >
        🔔 Notifications blocked
      </button>
    ) : (
      <button className="m-push-btn" disabled={busy} onClick={subscribe}>
        🔔 Enable notifications
      </button>
    );

  return (
    <div className="m-push">
      <span className="m-push-txt">Turn on notifications to receive your alerts on this device.</span>
      {cta}
    </div>
  );
}
