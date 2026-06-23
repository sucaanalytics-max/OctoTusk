"use client";
import { useCallback, useEffect, useState } from "react";
import type { UserAlert, AlertMetric, AlertTargetType } from "@/lib/userAlerts";

// Per-user custom alerts hook. In-memory only (no localStorage) — user-scoped data.

export interface CreateAlertInput {
  tikr: string;
  stock_name?: string;
  metric: AlertMetric;
  target_type?: AlertTargetType | null;
  threshold: number;
  one_shot: boolean;
}

export interface UseUserAlerts {
  alerts: UserAlert[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: CreateAlertInput) => Promise<string | null>; // null on success, else error msg
  toggle: (id: number, active: boolean) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export function useUserAlerts(): UseUserAlerts {
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/user-alerts", { cache: "no-store" });
      if (!res.ok) throw new Error(`alerts ${res.status}`);
      const d = await res.json();
      setAlerts((d.alerts || []) as UserAlert[]);
    } catch {
      setError("Couldn't load alerts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: CreateAlertInput) => {
      try {
        const res = await fetch("/api/user-alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) return (d.error as string) || "Couldn't save alert.";
      } catch {
        return "Couldn't save alert.";
      }
      await refresh();
      return null;
    },
    [refresh],
  );

  const toggle = useCallback(
    async (id: number, active: boolean) => {
      try {
        await fetch(`/api/user-alerts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active }),
        });
      } catch {
        /* refresh reconciles */
      }
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await fetch(`/api/user-alerts/${id}`, { method: "DELETE" });
      } catch {
        /* refresh reconciles */
      }
      await refresh();
    },
    [refresh],
  );

  return { alerts, loading, error, refresh, create, toggle, remove };
}
