"use client";
// Lazy enrichment fetcher for /research/compare.
// Fetches /api/enrichment/[tikr] per-tikr on demand; dedupes in-flight; never refetches cached.
// Maps the full API response to the CompareEnrichment subset.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CompareEnrichment, CompareEnrichmentMap } from "./types";

// Full response shape from GET /api/enrichment/[tikr] — superset of CompareEnrichment.
interface RawEnrichment {
  tikr?: string;
  beta?: number | null;
  pegRatio?: number | null;
  enterpriseValue?: number | null;
  enterpriseToEbitda?: number | null;
  revenueGrowth?: number | null;
  earningsGrowth?: number | null;
  grossMargins?: number | null;
  ebitdaMargins?: number | null;
  operatingMargins?: number | null;
  profitMargins?: number | null;
  freeCashflow?: number | null;
  debtToEquity?: number | null;
  returnOnEquity?: number | null;
  returnOnAssets?: number | null;
  currentRatio?: number | null;
  targetMeanPrice?: number | null;
  targetHighPrice?: number | null;
  targetLowPrice?: number | null;
  numberOfAnalystOpinions?: number | null;
  recommendationKey?: string | null;
  [key: string]: unknown;
}

function mapEnrichment(r: RawEnrichment): CompareEnrichment {
  return {
    beta: r.beta ?? null,
    pegRatio: r.pegRatio ?? null,
    enterpriseValue: r.enterpriseValue ?? null,
    enterpriseToEbitda: r.enterpriseToEbitda ?? null,
    revenueGrowth: r.revenueGrowth ?? null,
    earningsGrowth: r.earningsGrowth ?? null,
    grossMargins: r.grossMargins ?? null,
    ebitdaMargins: r.ebitdaMargins ?? null,
    operatingMargins: r.operatingMargins ?? null,
    profitMargins: r.profitMargins ?? null,
    freeCashflow: r.freeCashflow ?? null,
    debtToEquity: r.debtToEquity ?? null,
    returnOnEquity: r.returnOnEquity ?? null,
    returnOnAssets: r.returnOnAssets ?? null,
    currentRatio: r.currentRatio ?? null,
    targetMeanPrice: r.targetMeanPrice ?? null,
    targetHighPrice: r.targetHighPrice ?? null,
    targetLowPrice: r.targetLowPrice ?? null,
    numberOfAnalystOpinions: r.numberOfAnalystOpinions ?? null,
    recommendationKey: r.recommendationKey ?? null,
  };
}

export interface UseEnrichmentResult {
  enrichment: CompareEnrichmentMap;
  loading: Record<string, boolean>;
}

/**
 * Lazily fetches enrichment for each tikr in the array.
 * - Already-cached tikrs are never re-fetched.
 * - In-flight requests are deduped via a ref set.
 * - Per-tikr loading state is tracked separately.
 */
export function useEnrichment(tikrs: string[]): UseEnrichmentResult {
  const [enrichment, setEnrichment] = useState<CompareEnrichmentMap>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Track in-flight tikrs to prevent duplicate requests across renders.
  const inFlightRef = useRef<Set<string>>(new Set());
  // Track cached tikrs so we never re-request them even if tikrs array changes.
  const cachedRef = useRef<Set<string>>(new Set());

  const fetchTikr = useCallback(async (tikr: string) => {
    if (cachedRef.current.has(tikr) || inFlightRef.current.has(tikr)) return;
    inFlightRef.current.add(tikr);
    setLoading((prev) => ({ ...prev, [tikr]: true }));
    try {
      const res = await fetch(`/api/enrichment/${encodeURIComponent(tikr)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`enrichment ${res.status}`);
      const raw = (await res.json()) as RawEnrichment;
      const mapped = mapEnrichment(raw);
      cachedRef.current.add(tikr);
      setEnrichment((prev) => ({ ...prev, [tikr]: mapped }));
    } catch {
      // Non-fatal: enrichment is optional supplemental data.
      // Mark as cached anyway so we don't retry in a tight loop.
      cachedRef.current.add(tikr);
    } finally {
      inFlightRef.current.delete(tikr);
      setLoading((prev) => {
        const next = { ...prev };
        delete next[tikr];
        return next;
      });
    }
  }, []);

  // Fire off fetches after commit (never during render) for any tikr not yet
  // cached/in-flight. fetchTikr is stable (useCallback []) and dedupes internally,
  // so completion-driven re-renders don't re-trigger this effect.
  useEffect(() => {
    tikrs
      .filter((t) => !cachedRef.current.has(t) && !inFlightRef.current.has(t))
      .forEach((t) => fetchTikr(t));
  }, [tikrs, fetchTikr]);

  return { enrichment, loading };
}
