"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Notification } from "@/lib/notifications";

// In-memory only. NEVER persist notification bodies/ids to any storage.

export interface UseNotifications {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const POLL_INTERVAL_MS = 30_000;

export function useNotifications(): UseNotifications {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error(`notifications ${res.status}`);
      const d = await res.json();
      if (!mountedRef.current) return;
      setItems((d.notifications ?? []) as Notification[]);
      setUnreadCount(typeof d.unreadCount === "number" ? d.unreadCount : 0);
      setError(null);
    } catch {
      if (mountedRef.current) setError("Couldn't load notifications.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Optimistic markRead(id): set read_at locally + decrement count, PATCH; on error → refresh.
  const markRead = useCallback(
    async (id: number) => {
      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) => (n.id === id && n.read_at === null ? { ...n, read_at: nowIso } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        const res = await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) await refresh();
      } catch {
        await refresh();
      }
    },
    [refresh],
  );

  // Optimistic markAllRead: set all read_at locally + zero count, PATCH; on error → refresh.
  const markAllRead = useCallback(async () => {
    const nowIso = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at === null ? { ...n, read_at: nowIso } : n)));
    setUnreadCount(0);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) await refresh();
    } catch {
      await refresh();
    }
  }, [refresh]);

  // Schedule the next poll (recursive setTimeout, not setInterval, to avoid overlap).
  const scheduleNext = useCallback(() => {
    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      await refresh();
      if (mountedRef.current) scheduleNext();
    }, POLL_INTERVAL_MS);
  }, [refresh]);

  useEffect(() => {
    mountedRef.current = true;
    refresh().then(() => {
      if (mountedRef.current) scheduleNext();
    });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timerRef.current) clearTimeout(timerRef.current);
        refresh().then(() => {
          if (mountedRef.current) scheduleNext();
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh, scheduleNext]);

  return { items, unreadCount, loading, error, refresh, markRead, markAllRead };
}
