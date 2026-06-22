"use client";
import { useCallback, useEffect, useState } from "react";
import type { RawHolding } from "@/lib/holdingsPnl";

// PIN-gated holdings hook. Holds the unlocked payload ONLY in memory — never localStorage,
// never the PIN (CLAUDE.md Security). Re-locks when the app is backgrounded so sensitive
// P&L doesn't linger in a hidden tab or the OS app-switcher snapshot.

export interface FoPosition {
  instrument_name: string;
  underlying: string;
  instrument_type: string;
  expiry: string;
  direction: string;
  quantity: number;
  avg_cost: number;
  curr_price: number;
  exposure: number;
  unrealised_pnl: number;
  strike?: number;
  option_type?: string;
  broker?: string;
}

export interface UseHoldings {
  unlocked: boolean;
  holdings: RawHolding[];
  foPositions: FoPosition[];
  holdingsDate: string | null;
  loading: boolean;
  error: string | null;
  retryAfter: number | null;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
}

export function useHoldings(): UseHoldings {
  const [unlocked, setUnlocked] = useState(false);
  const [holdings, setHoldings] = useState<RawHolding[]>([]);
  const [foPositions, setFoPositions] = useState<FoPosition[]>([]);
  const [holdingsDate, setHoldingsDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  const lock = useCallback(() => {
    setUnlocked(false);
    setHoldings([]);
    setFoPositions([]);
    setHoldingsDate(null);
    setError(null);
  }, []);

  // Re-lock on background (hidden tab / app switch) — sensitive data must not linger.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") lock();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", lock);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", lock);
    };
  }, [lock]);

  const unlock = useCallback(async (pin: string) => {
    setLoading(true);
    setError(null);
    setRetryAfter(null);
    try {
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.status === 429) {
        const ra = parseInt(res.headers.get("Retry-After") || "60", 10);
        setRetryAfter(Number.isFinite(ra) ? ra : 60);
        setError("Too many attempts. Try again shortly.");
        return false;
      }
      if (res.status === 403) {
        setError("Incorrect PIN.");
        return false;
      }
      if (!res.ok) {
        setError("Couldn't unlock holdings.");
        return false;
      }
      const data = await res.json();
      setHoldings((data.holdings || []) as RawHolding[]);
      setFoPositions((data.fo_positions || []) as FoPosition[]);
      setHoldingsDate(data.holdingsDate ?? null);
      setUnlocked(true);
      return true;
    } catch {
      setError("Couldn't unlock holdings.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { unlocked, holdings, foPositions, holdingsDate, loading, error, retryAfter, unlock, lock };
}
