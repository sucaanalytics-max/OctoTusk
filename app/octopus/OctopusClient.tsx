"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMarketOpen, nextDailyResetMs } from "@/lib/marketHours";
import { Header, type DisplayState } from "./Header";
import { IndexStrip, type IndexTick } from "./IndexStrip";
import { Treemap } from "./Treemap";
import { TopMovers } from "./TopMovers";
import { SectorLadder } from "./SectorLadder";

export interface OctopusSeedStock {
  tikr: string;
  name: string;
  sector: string;
}

interface FeedStock {
  tikr: string;
  name: string;
  sector: string;
  dayPct: number | null;
}

interface FeedPayload {
  stocks: FeedStock[];
  fetchedAt: string;
}

interface IndicesPayload {
  indices: IndexTick[];
  fetchedAt: string;
}

const FEED_REFRESH_MS = 60 * 1000;
const INDICES_REFRESH_MS = 60 * 1000;
const AGE_TICK_MS = 5 * 1000;
const STALE_THRESHOLD_SEC = 90;
const DISCONNECT_THRESHOLD_SEC = 300;
const FAILURE_DISCONNECT = 3;
const BACKOFF_SCHEDULE_MS = [30_000, 60_000, 120_000, 300_000];
const LOCALSTORAGE_KEY = "octopus:lastFeed";
const LOCALSTORAGE_IDX = "octopus:lastIndices";

function loadCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveCache(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private mode, quota); not fatal.
  }
}

export default function OctopusClient({
  seed,
  displayToken,
  stockListStale,
}: {
  seed: OctopusSeedStock[];
  displayToken: string;
  stockListStale: boolean;
}) {
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [indices, setIndices] = useState<IndicesPayload | null>(null);
  const [ageSec, setAgeSec] = useState<number | null>(null);
  const [marketOpen, setMarketOpen] = useState<boolean>(false);
  const failuresRef = useRef(0);
  const feedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hydrate from offline cache on first mount ──
  useEffect(() => {
    const cached = loadCache<FeedPayload>(LOCALSTORAGE_KEY);
    const cachedIdx = loadCache<IndicesPayload>(LOCALSTORAGE_IDX);
    if (cached) setFeed(cached);
    if (cachedIdx) setIndices(cachedIdx);
  }, []);

  // ── Quote feed polling ──
  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`/api/octopus-feed?token=${encodeURIComponent(displayToken)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`octopus-feed ${res.status}`);
      const data = (await res.json()) as FeedPayload;
      setFeed(data);
      saveCache(LOCALSTORAGE_KEY, data);
      failuresRef.current = 0;
    } catch (err) {
      failuresRef.current += 1;
      console.warn(
        `[octopus] feed fetch failed (${failuresRef.current} consec):`,
        err instanceof Error ? err.message : err
      );
    }
  }, [displayToken]);

  const fetchIndices = useCallback(async () => {
    try {
      const res = await fetch(`/api/indices?token=${encodeURIComponent(displayToken)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`indices ${res.status}`);
      const data = (await res.json()) as IndicesPayload;
      setIndices(data);
      saveCache(LOCALSTORAGE_IDX, data);
    } catch (err) {
      console.warn("[octopus] indices fetch failed:", err instanceof Error ? err.message : err);
    }
  }, [displayToken]);

  // ── Scheduled polling with off-hours pause + failure backoff ──
  useEffect(() => {
    const tickMarketOpen = () => setMarketOpen(isMarketOpen());
    tickMarketOpen();
    const t = setInterval(tickMarketOpen, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const scheduleFeed = (delay: number) => {
      if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
      feedTimerRef.current = setTimeout(async () => {
        if (cancelled) return;
        if (isMarketOpen()) {
          await fetchFeed();
        }
        const f = failuresRef.current;
        const next = isMarketOpen()
          ? (f >= FAILURE_DISCONNECT
              ? BACKOFF_SCHEDULE_MS[Math.min(f - FAILURE_DISCONNECT, BACKOFF_SCHEDULE_MS.length - 1)]
              : FEED_REFRESH_MS)
          : 5 * 60 * 1000; // re-check market status every 5min when closed
        scheduleFeed(next);
      }, delay);
    };

    const scheduleIdx = (delay: number) => {
      if (idxTimerRef.current) clearTimeout(idxTimerRef.current);
      idxTimerRef.current = setTimeout(async () => {
        if (cancelled) return;
        if (isMarketOpen()) await fetchIndices();
        scheduleIdx(isMarketOpen() ? INDICES_REFRESH_MS : 5 * 60 * 1000);
      }, delay);
    };

    // Fire immediately on mount
    (async () => {
      if (isMarketOpen()) {
        await Promise.all([fetchFeed(), fetchIndices()]);
      }
      if (!cancelled) {
        scheduleFeed(FEED_REFRESH_MS);
        scheduleIdx(INDICES_REFRESH_MS);
      }
    })();

    return () => {
      cancelled = true;
      if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
      if (idxTimerRef.current) clearTimeout(idxTimerRef.current);
    };
  }, [fetchFeed, fetchIndices]);

  // ── Age ticker (5s) ──
  useEffect(() => {
    const tick = () => {
      if (!feed?.fetchedAt) {
        setAgeSec(null);
        return;
      }
      setAgeSec(Math.max(0, Math.floor((Date.now() - new Date(feed.fetchedAt).getTime()) / 1000)));
    };
    tick();
    const t = setInterval(tick, AGE_TICK_MS);
    return () => clearInterval(t);
  }, [feed?.fetchedAt]);

  // ── Daily reload at 04:00 IST ──
  useEffect(() => {
    const ms = nextDailyResetMs();
    const t = setTimeout(() => window.location.reload(), ms);
    return () => clearTimeout(t);
  }, []);

  // ── Derive display state ──
  const state: DisplayState = useMemo(() => {
    if (!marketOpen) return "CLOSED";
    if (!feed) return "LOADING";
    if (failuresRef.current >= FAILURE_DISCONNECT) return "DISCONNECTED";
    if (ageSec != null && ageSec >= DISCONNECT_THRESHOLD_SEC) return "DISCONNECTED";
    if (ageSec != null && ageSec >= STALE_THRESHOLD_SEC) return "STALE";
    return "LIVE";
  }, [marketOpen, feed, ageSec]);

  // ── Merge seed (snapshot) with live feed so we always have a name+sector even if a quote is missing ──
  const stocks = useMemo(() => {
    const liveByTikr = new Map<string, FeedStock>();
    for (const s of feed?.stocks ?? []) liveByTikr.set(s.tikr, s);
    return seed.map((s) => {
      const live = liveByTikr.get(s.tikr);
      return {
        tikr: s.tikr,
        name: live?.name ?? s.name,
        sector: live?.sector ?? s.sector,
        dayPct: live?.dayPct ?? null,
      };
    });
  }, [seed, feed]);

  const moverStocks = useMemo(
    () => stocks.map((s) => ({ tikr: s.tikr, dayPct: s.dayPct })),
    [stocks]
  );

  const ladderStocks = useMemo(
    () => stocks.map((s) => ({ sector: s.sector, dayPct: s.dayPct })),
    [stocks]
  );

  return (
    <div className="octopus-root" data-state={state.toLowerCase()}>
      <Header state={state} ageSeconds={ageSec} />
      <IndexStrip ticks={indices?.indices ?? null} />
      <div className="octopus-body">
        <div className="octopus-treemap-wrap">
          {stocks.length === 0 ? (
            <div className="octopus-loading">no coverage data</div>
          ) : (
            <Treemap stocks={stocks} />
          )}
        </div>
        <div className="octopus-rail">
          <TopMovers stocks={moverStocks} />
          <SectorLadder stocks={ladderStocks} />
        </div>
      </div>
      {stockListStale && (
        <div className="octopus-stale-ribbon" aria-live="polite">
          Stock list · stale (&gt;7d)
        </div>
      )}
    </div>
  );
}
