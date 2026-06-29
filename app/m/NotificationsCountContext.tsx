"use client";
// Lightweight context: the shell polls only the count; the notifications screen
// calls refreshCount() after markRead/markAllRead to sync the badge immediately.
// COUNT ONLY — notification bodies/ids are never stored here.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface NotificationsCountCtx {
  unreadCount: number;
  refreshCount: () => void;
}

const NotificationsCountContext = createContext<NotificationsCountCtx>({
  unreadCount: 0,
  refreshCount: () => {},
});

export function useNotificationsCount() {
  return useContext(NotificationsCountContext);
}

const POLL_MS = 45_000; // shell polls at a slower cadence — the screen hook is faster

export function NotificationsCountProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unread=1&limit=1", { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      if (mountedRef.current && typeof d.unreadCount === "number") {
        setUnreadCount(d.unreadCount);
      }
    } catch {
      // silent — badge is non-critical
    }
  }, []);

  const scheduleNext = useCallback(() => {
    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      await fetchCount();
      if (mountedRef.current) scheduleNext();
    }, POLL_MS);
  }, [fetchCount]);

  // refreshCount is called by NotificationsClient after marking read.
  const refreshCount = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    fetchCount().then(() => {
      if (mountedRef.current) scheduleNext();
    });
  }, [fetchCount, scheduleNext]);

  useEffect(() => {
    mountedRef.current = true;
    fetchCount().then(() => {
      if (mountedRef.current) scheduleNext();
    });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timerRef.current) clearTimeout(timerRef.current);
        fetchCount().then(() => {
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
  }, [fetchCount, scheduleNext]);

  return (
    <NotificationsCountContext.Provider value={{ unreadCount, refreshCount }}>
      {children}
    </NotificationsCountContext.Provider>
  );
}
