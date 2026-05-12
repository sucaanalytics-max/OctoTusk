"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMarketOpen, nextDailyResetMs } from "@/lib/marketHours";
import { Header, type DisplayState } from "./Header";
import { IndexStrip, type IndexTick } from "./IndexStrip";
import { Treemap } from "./Treemap";
import { TopMovers } from "./TopMovers";
import { SectorLadder } from "./SectorLadder";
import { HoverCard, type HoverStock } from "./HoverCard";

export interface OctopusSeedStock {
  tikr: string;
  name: string;
  sector: string;
  subsector?: string;
  bearUpside: number | null;
  baseUpside: number | null;
  bullUpside: number | null;
  oneYearUpside: number | null;
}

interface FeedStock {
  tikr: string;
  name: string;
  sector: string;
  subsector: string;
  dayPct: number | null;
  bearUpside: number | null;
  baseUpside: number | null;
  bullUpside: number | null;
  oneYearUpside: number | null;
}

interface FeedPayload {
  stocks: FeedStock[];
  fetchedAt: string;
}

interface IndicesPayload {
  indices: IndexTick[];
  fetchedAt: string;
}

interface MergedStock {
  tikr: string;
  name: string;
  sector: string;
  subsector: string;
  dayPct: number | null;
  bearUpside: number | null;
  baseUpside: number | null;
  bullUpside: number | null;
  oneYearUpside: number | null;
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
const FLASH_DELTA_PP = 1.5;
const FLASH_DURATION_MS = 2000;

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

  // Interaction state
  const [hoveredTikr, setHoveredTikr] = useState<string | null>(null);
  const [pinnedTikr, setPinnedTikr] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [pinnedCursor, setPinnedCursor] = useState<{ x: number; y: number } | null>(null);

  // Flash tracking
  const prevPctRef = useRef<Map<string, number>>(new Map());
  const [flashing, setFlashing] = useState<Map<string, "up" | "down">>(new Map());

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

  // ── Detect big intraday tick-to-tick moves; trigger 2s flash ──
  useEffect(() => {
    if (!feed?.stocks) return;
    const prev = prevPctRef.current;
    const triggered: Array<{ tikr: string; dir: "up" | "down" }> = [];
    const next = new Map<string, number>();
    for (const s of feed.stocks) {
      if (typeof s.dayPct !== "number") continue;
      next.set(s.tikr, s.dayPct);
      const before = prev.get(s.tikr);
      if (typeof before === "number") {
        const delta = s.dayPct - before;
        if (Math.abs(delta) >= FLASH_DELTA_PP) {
          triggered.push({ tikr: s.tikr, dir: delta > 0 ? "up" : "down" });
        }
      }
    }
    prevPctRef.current = next;
    if (triggered.length > 0) {
      setFlashing((current) => {
        const updated = new Map(current);
        for (const t of triggered) updated.set(t.tikr, t.dir);
        return updated;
      });
      const timeouts = triggered.map((t) =>
        setTimeout(() => {
          setFlashing((current) => {
            if (!current.has(t.tikr)) return current;
            const updated = new Map(current);
            updated.delete(t.tikr);
            return updated;
          });
        }, FLASH_DURATION_MS)
      );
      return () => timeouts.forEach((id) => clearTimeout(id));
    }
  }, [feed]);

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
          : 5 * 60 * 1000;
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

  // ── ESC + click-outside to clear pin ──
  useEffect(() => {
    if (!pinnedTikr) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinnedTikr(null);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".octopus-hover-card")) return;
      if (target.closest(".octopus-tile-group")) return;
      if (target.closest(".octopus-mover-row-interactive")) return;
      setPinnedTikr(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [pinnedTikr]);

  // ── Derive display state ──
  const state: DisplayState = useMemo(() => {
    if (!marketOpen) return "CLOSED";
    if (!feed) return "LOADING";
    if (failuresRef.current >= FAILURE_DISCONNECT) return "DISCONNECTED";
    if (ageSec != null && ageSec >= DISCONNECT_THRESHOLD_SEC) return "DISCONNECTED";
    if (ageSec != null && ageSec >= STALE_THRESHOLD_SEC) return "STALE";
    return "LIVE";
  }, [marketOpen, feed, ageSec]);

  // ── Merge seed (snapshot) with live feed ──
  const stocks: MergedStock[] = useMemo(() => {
    const liveByTikr = new Map<string, FeedStock>();
    for (const s of feed?.stocks ?? []) liveByTikr.set(s.tikr, s);
    return seed.map((s) => {
      const live = liveByTikr.get(s.tikr);
      return {
        tikr: s.tikr,
        name: live?.name ?? s.name,
        sector: live?.sector ?? s.sector,
        subsector: live?.subsector ?? s.subsector ?? "",
        dayPct: live?.dayPct ?? null,
        bearUpside: live?.bearUpside ?? s.bearUpside ?? null,
        baseUpside: live?.baseUpside ?? s.baseUpside ?? null,
        bullUpside: live?.bullUpside ?? s.bullUpside ?? null,
        oneYearUpside: live?.oneYearUpside ?? s.oneYearUpside ?? null,
      };
    });
  }, [seed, feed]);

  const moverStocks = useMemo(
    () => stocks.map((s) => ({ tikr: s.tikr, name: s.name, dayPct: s.dayPct })),
    [stocks]
  );

  const ladderStocks = useMemo(
    () => stocks.map((s) => ({ sector: s.sector, dayPct: s.dayPct })),
    [stocks]
  );

  const activeTikr = pinnedTikr ?? hoveredTikr;
  const activeStock = useMemo(
    () => (activeTikr ? stocks.find((s) => s.tikr === activeTikr) ?? null : null),
    [activeTikr, stocks]
  );
  const activeHoverStock: HoverStock | null = activeStock
    ? {
        tikr: activeStock.tikr,
        name: activeStock.name,
        sector: activeStock.sector,
        subsector: activeStock.subsector,
        dayPct: activeStock.dayPct,
        bearUpside: activeStock.bearUpside,
        baseUpside: activeStock.baseUpside,
        bullUpside: activeStock.bullUpside,
        oneYearUpside: activeStock.oneYearUpside,
      }
    : null;

  const handleTileHover = useCallback(
    (tikr: string | null, e?: React.MouseEvent) => {
      setHoveredTikr(tikr);
      if (e && tikr) setCursor({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleTileClick = useCallback(
    (tikr: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setPinnedCursor({ x: e.clientX, y: e.clientY });
      setPinnedTikr((current) => (current === tikr ? null : tikr));
    },
    []
  );

  const handleRowHover = useCallback((tikr: string | null) => {
    setHoveredTikr(tikr);
  }, []);

  const handleRowClick = useCallback((tikr: string) => {
    setPinnedTikr((current) => (current === tikr ? null : tikr));
    // Position pinned card near the row — for keyboard-ish flow, just use last cursor.
  }, []);

  return (
    <div className="octopus-root" data-state={state.toLowerCase()}>
      <Header state={state} ageSeconds={ageSec} />
      <IndexStrip ticks={indices?.indices ?? null} />
      <div className="octopus-body">
        <div className="octopus-treemap-wrap">
          {stocks.length === 0 ? (
            <div className="octopus-loading">no coverage data</div>
          ) : (
            <Treemap
              stocks={stocks}
              focusedTikr={hoveredTikr}
              pinnedTikr={pinnedTikr}
              flashing={flashing}
              onTileHover={handleTileHover}
              onTileClick={handleTileClick}
            />
          )}
        </div>
        <div className="octopus-rail">
          <TopMovers
            stocks={moverStocks}
            focusedTikr={hoveredTikr}
            pinnedTikr={pinnedTikr}
            onRowHover={handleRowHover}
            onRowClick={handleRowClick}
          />
          <SectorLadder stocks={ladderStocks} />
        </div>
      </div>
      {activeHoverStock && (cursor || pinnedCursor) && (
        <HoverCard
          stock={activeHoverStock}
          cursor={pinnedTikr ? pinnedCursor : cursor}
          pinned={!!pinnedTikr}
          onUnpin={() => setPinnedTikr(null)}
        />
      )}
      {stockListStale && (
        <div className="octopus-stale-ribbon" aria-live="polite">
          Stock list · stale (&gt;7d)
        </div>
      )}
    </div>
  );
}
