"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketplaceAlert } from "@/lib/marketplace";
import type { AlertMetric, AlertTargetType } from "@/lib/userAlerts";

// Marketplace hook. In-memory only (no localStorage) — team-scoped read + clone.

export interface UseMarketplace {
  items: MarketplaceAlert[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clone: (item: MarketplaceAlert) => Promise<string | null>; // null on success, else error msg
  added: (item: MarketplaceAlert) => boolean;
}

/** Stable composite key for a marketplace item (no row id exposed). */
function itemKey(item: MarketplaceAlert): string {
  return `${item.stock_key}|${item.metric}|${item.target_type ?? ""}|${item.threshold}`;
}

interface CloneBody {
  tikr: string;
  stock_name: string | null | undefined;
  metric: AlertMetric;
  target_type: AlertTargetType | null | undefined;
  threshold: number;
  one_shot: true;
}

export function useMarketplace(): UseMarketplace {
  const [items, setItems] = useState<MarketplaceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which items were successfully cloned this session; never persisted.
  const addedSet = useRef<Set<string>>(new Set());
  // Force re-render when addedSet changes (ref mutation doesn't trigger it).
  const [addedVer, setAddedVer] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/user-alerts/marketplace", { cache: "no-store" });
      if (!res.ok) throw new Error(`marketplace ${res.status}`);
      const d = await res.json();
      setItems((d.items || []) as MarketplaceAlert[]);
    } catch {
      setError("Couldn't load team alerts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clone = useCallback(async (item: MarketplaceAlert): Promise<string | null> => {
    const body: CloneBody = {
      tikr: item.original_tikr,
      stock_name: item.stock_name,
      metric: item.metric,
      target_type: item.target_type,
      threshold: item.threshold,
      one_shot: true,
    };
    try {
      const res = await fetch("/api/user-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) return "Already in your alerts";
        return (d.error as string) || "Couldn't add alert.";
      }
    } catch {
      return "Couldn't add alert.";
    }
    addedSet.current.add(itemKey(item));
    setAddedVer((v) => v + 1);
    return null;
  }, []);

  const added = useCallback(
    (item: MarketplaceAlert): boolean => {
      void addedVer; // consumed so React re-runs when version bumps
      return addedSet.current.has(itemKey(item));
    },
    [addedVer],
  );

  return { items, loading, error, refresh, clone, added };
}
