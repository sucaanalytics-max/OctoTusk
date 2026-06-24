"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { isMarketOpen } from "@/lib/marketHours";
import type { QuotesMap, FreshnessState } from "./types";

// Mirrors the proven poll pattern in app/octopus/OctopusClient.tsx, adapted for the
// session-gated GET /api/quotes (no display token). Caches ONLY live prices (non-sensitive)
// to localStorage for an instant cold start — never holdings/PII (see CLAUDE.md → Security).

const REFRESH_MS = 60 * 1000;
const STALE_SEC = 90;
const DISCONNECT_SEC = 300;
const FAILURE_DISCONNECT = 3;
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000];
const CACHE_KEY = "mobile:lastQuotes.v1"; // live prices only — never sensitive data

interface CachePayload {
  quotes: QuotesMap;
  fetchedAt: string;
}

export interface UseQuotesResult {
  quotes: QuotesMap;
  fetchedAt: string | null;
  state: FreshnessState;
}

export function useQuotes(): UseQuotesResult {
  const [quotes, setQuotes] = useState<QuotesMap>({});
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const failuresRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Force a re-render every 30s so the age-derived freshness state (LIVE/STALE/DISCONNECTED)
  // recomputes even when polls are FAILING (no setQuotes to trigger it) — avoids a frozen "LIVE"
  // badge during an outage.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => (n + 1) % 1_000_000), 30_000);
    return () => clearInterval(t);
  }, []);

  // Hydrate from cache + seed market state on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw) as CachePayload;
        if (c?.quotes) {
          setQuotes(c.quotes);
          setFetchedAt(c.fetchedAt ?? null);
        }
      }
    } catch {
      /* ignore corrupt cache */
    }
    setMarketOpen(isMarketOpen());
  }, []);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/quotes", { cache: "no-store" });
      if (!res.ok) throw new Error(`quotes ${res.status}`);
      const data = (await res.json()) as { quotes?: QuotesMap; fetchedAt?: string };
      if (data?.quotes) {
        const at = data.fetchedAt ?? new Date().toISOString();
        setQuotes(data.quotes);
        setFetchedAt(at);
        failuresRef.current = 0;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ quotes: data.quotes, fetchedAt: at }));
        } catch {
          /* quota / private mode — non-fatal */
        }
      }
    } catch {
      failuresRef.current += 1;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const schedule = (delay: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (cancelled) return;
        const open = isMarketOpen();
        setMarketOpen(open);
        if (open) await fetchQuotes();
        const f = failuresRef.current;
        const next = open
          ? f >= FAILURE_DISCONNECT
            ? BACKOFF_MS[Math.min(f - FAILURE_DISCONNECT, BACKOFF_MS.length - 1)]
            : REFRESH_MS
          : 5 * 60 * 1000;
        schedule(next);
      }, delay);
    };
    // Always fetch once on mount (server returns previous-session data when closed).
    (async () => {
      await fetchQuotes();
      if (!cancelled) schedule(REFRESH_MS);
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchQuotes]);

  const ageSec = fetchedAt ? (Date.now() - new Date(fetchedAt).getTime()) / 1000 : null;
  let state: FreshnessState;
  if (!fetchedAt && Object.keys(quotes).length === 0) state = "LOADING";
  else if (!marketOpen) state = "CLOSED";
  else if (failuresRef.current >= FAILURE_DISCONNECT) state = "DISCONNECTED";
  else if (ageSec != null && ageSec >= DISCONNECT_SEC) state = "DISCONNECTED";
  else if (ageSec != null && ageSec >= STALE_SEC) state = "STALE";
  else state = "LIVE";

  return { quotes, fetchedAt, state };
}
