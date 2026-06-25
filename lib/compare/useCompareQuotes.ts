"use client";
// Quotes poll hook for /research/compare.
// Mirrors lib/mobile/useQuotes.ts poll logic exactly; adapted to return CompareQuotesMap.
// Fetches /api/quotes, unwraps .quotes wrapper, maps QuoteData → CompareQuote.
// Polls every 60 s only when isMarketOpen(); else single fetch on mount.

import { useCallback, useEffect, useRef, useState } from "react";
import { isMarketOpen } from "@/lib/marketHours";
import type { CompareQuote, CompareQuotesMap } from "./types";

const REFRESH_MS = 60 * 1_000;
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000] as const;
const FAILURE_BACKOFF_AT = 3;

// Raw shape returned by GET /api/quotes — a superset of CompareQuote.
interface RawQuoteData {
  price: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp?: string;
  dayHigh?: number | null;
  dayLow?: number | null;
  prevClose?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  marketCap?: number | null;
  trailingPE?: number | null;
  forwardPE?: number | null;
  priceToBook?: number | null;
  fiftyDayAverage?: number | null;
  twoHundredDayAverage?: number | null;
  dividendYield?: number | null;
}

function mapRaw(r: RawQuoteData): CompareQuote {
  return {
    price: r.price ?? 0,
    change: r.change ?? 0,
    changePct: r.changePct ?? 0,
    prevClose: r.prevClose ?? null,
    dayHigh: r.dayHigh ?? null,
    dayLow: r.dayLow ?? null,
    fiftyTwoWeekHigh: r.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: r.fiftyTwoWeekLow ?? null,
    marketCap: r.marketCap ?? null,
    trailingPE: r.trailingPE ?? null,
    forwardPE: r.forwardPE ?? null,
    priceToBook: r.priceToBook ?? null,
    fiftyDayAverage: r.fiftyDayAverage ?? null,
    twoHundredDayAverage: r.twoHundredDayAverage ?? null,
    dividendYield: r.dividendYield ?? null,
    volume: r.volume ?? 0,
  };
}

export interface UseCompareQuotesResult {
  quotes: CompareQuotesMap;
  loading: boolean;
}

/**
 * Fetches /api/quotes once on mount (always) and then every 60 s while market is open.
 * When closed, stops polling after the initial fetch.
 * The `tikrs` parameter is unused in the fetch (the API returns all tickers) but is
 * kept in the signature so callers can pass only their selected set — the hook returns
 * the full map and callers index into it by tikr.
 */
export function useCompareQuotes(_tikrs: string[]): UseCompareQuotesResult {
  const [quotes, setQuotes] = useState<CompareQuotesMap>({});
  const [loading, setLoading] = useState(true);
  const failuresRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/quotes", { cache: "no-store" });
      if (!res.ok) throw new Error(`quotes ${res.status}`);
      const data = (await res.json()) as { quotes?: Record<string, RawQuoteData> };
      if (data?.quotes) {
        const mapped: CompareQuotesMap = {};
        for (const [tikr, raw] of Object.entries(data.quotes)) {
          mapped[tikr] = mapRaw(raw);
        }
        setQuotes(mapped);
        failuresRef.current = 0;
      }
    } catch {
      failuresRef.current += 1;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const schedule = (delay: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (cancelled) return;
        const open = isMarketOpen();
        if (open) {
          await fetchQuotes();
          const f = failuresRef.current;
          const next =
            f >= FAILURE_BACKOFF_AT
              ? BACKOFF_MS[Math.min(f - FAILURE_BACKOFF_AT, BACKOFF_MS.length - 1)]
              : REFRESH_MS;
          schedule(next);
        }
        // When closed: no further scheduling after the initial mount fetch.
      }, delay);
    };

    // Always fetch once on mount; then poll only if market is open.
    (async () => {
      await fetchQuotes();
      if (!cancelled && isMarketOpen()) {
        schedule(REFRESH_MS);
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchQuotes]);

  return { quotes, loading };
}
