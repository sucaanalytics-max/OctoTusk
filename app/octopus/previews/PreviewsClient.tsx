"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GridView, type PreviewStock } from "./GridView";
import { BubbleView } from "./BubbleView";
import { HexView } from "./HexView";
import { ScatterView, type ScatterStock } from "./ScatterView";
import { SectorDrawer } from "./SectorDrawer";
import { defaultClusterKey } from "@/lib/treemap";

export interface PreviewSeedStock {
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
  cmp: number | null;
  bearUpside: number | null;
  baseUpside: number | null;
  bullUpside: number | null;
  oneYearUpside: number | null;
}

interface FeedPayload {
  stocks: FeedStock[];
  fetchedAt: string;
}

type ViewKind = "grid" | "bubble" | "hex" | "scatter";

const VIEW_META: Record<ViewKind, { letter: string; name: string; sub: string; oneLiner: string }> = {
  grid: {
    letter: "A",
    name: "Sector Cards",
    sub: "summary · click to expand",
    oneLiner: "One card per sector with top movers; click reveals the full stock table.",
  },
  bubble: {
    letter: "B",
    name: "Bubble Pack",
    sub: "organic · finviz-style",
    oneLiner: "Packed circles per sector. Premium, distinctive, less efficient with text.",
  },
  hex: {
    letter: "C",
    name: "Hexagonal Hive",
    sub: "distinctive · on-brand",
    oneLiner: "Hexagons per sector hive. Tessellates without gaps. Narrow cells.",
  },
  scatter: {
    letter: "D",
    name: "Scatter · Upside × Day",
    sub: "research lens · not a heat map",
    oneLiner: "1Y upside vs today. Outliers jump. Different paradigm.",
  },
};

const FEED_REFRESH_MS = 60 * 1000;

export default function PreviewsClient({
  seed,
  displayToken,
}: {
  seed: PreviewSeedStock[];
  displayToken: string;
}) {
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [selected, setSelected] = useState<ViewKind | null>(null);
  const [focusedTikr, setFocusedTikr] = useState<string | null>(null);
  const [pinnedTikr, setPinnedTikr] = useState<string | null>(null);
  const [openCluster, setOpenCluster] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`/api/octopus-feed?token=${encodeURIComponent(displayToken)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`octopus-feed ${res.status}`);
      const data = (await res.json()) as FeedPayload;
      setFeed(data);
    } catch (err) {
      console.warn("[previews] feed fetch failed:", err instanceof Error ? err.message : err);
    }
  }, [displayToken]);

  useEffect(() => {
    fetchFeed();
    timerRef.current = setInterval(fetchFeed, FEED_REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchFeed]);

  const stocks: PreviewStock[] = useMemo(() => {
    const live = new Map<string, FeedStock>();
    for (const s of feed?.stocks ?? []) live.set(s.tikr, s);
    return seed.map((s) => {
      const l = live.get(s.tikr);
      return {
        tikr: s.tikr,
        name: l?.name ?? s.name,
        sector: l?.sector ?? s.sector,
        subsector: l?.subsector ?? s.subsector,
        dayPct: l?.dayPct ?? null,
        cmp: l?.cmp ?? null,
        bearUpside: l?.bearUpside ?? s.bearUpside ?? null,
        baseUpside: l?.baseUpside ?? s.baseUpside ?? null,
        bullUpside: l?.bullUpside ?? s.bullUpside ?? null,
        oneYearUpside: l?.oneYearUpside ?? s.oneYearUpside ?? null,
      };
    });
  }, [seed, feed]);

  const scatterStocks: ScatterStock[] = useMemo(
    () =>
      stocks.map((s) => ({
        tikr: s.tikr,
        name: s.name,
        sector: s.sector,
        dayPct: s.dayPct,
        oneYearUpside: s.oneYearUpside,
      })),
    [stocks]
  );

  const drawerStocks = useMemo(() => {
    if (!openCluster) return [] as PreviewStock[];
    return stocks.filter(
      (s) =>
        defaultClusterKey({
          tikr: s.tikr,
          name: s.name,
          sector: s.sector,
          subsector: s.subsector,
          dayPct: s.dayPct,
        }) === openCluster
    );
  }, [stocks, openCluster]);

  const handleHover = useCallback((tikr: string | null) => setFocusedTikr(tikr), []);
  const handleClick = useCallback((tikr: string) => {
    setPinnedTikr((cur) => (cur === tikr ? null : tikr));
  }, []);
  const handleClusterSelect = useCallback((cluster: string) => setOpenCluster(cluster), []);

  const renderView = (kind: ViewKind, options: { compact?: boolean } = {}) => {
    const common = {
      focusedTikr,
      pinnedTikr,
      onTileHover: (t: string | null) => handleHover(t),
      onTileClick: (t: string) => handleClick(t),
    };
    switch (kind) {
      case "grid":
        return (
          <GridView
            stocks={stocks}
            onClusterSelect={handleClusterSelect}
            compact={options.compact}
            {...common}
          />
        );
      case "bubble":
        return <BubbleView stocks={stocks} {...common} />;
      case "hex":
        return <HexView stocks={stocks} {...common} />;
      case "scatter":
        return <ScatterView stocks={scatterStocks} {...common} />;
    }
  };

  if (selected) {
    return (
      <div className="octopus-root ox-previews-root" data-state="live">
        <header className="ox-previews-masthead">
          <button type="button" className="ox-previews-back" onClick={() => setSelected(null)}>
            ← all previews
          </button>
          <h1 className="ox-previews-title">
            <span className="ox-previews-letter">{VIEW_META[selected].letter}</span>
            {VIEW_META[selected].name}
          </h1>
          <Link href="/octopus" className="ox-previews-link">
            current /octopus →
          </Link>
        </header>
        <div className="ox-previews-canvas">{renderView(selected)}</div>
        <SectorDrawer
          open={!!openCluster}
          cluster={openCluster}
          stocks={drawerStocks}
          onClose={() => setOpenCluster(null)}
        />
      </div>
    );
  }

  return (
    <div className="octopus-root ox-previews-root" data-state="live">
      <header className="ox-previews-masthead">
        <h1 className="ox-previews-title">
          <span className="ox-previews-letter">·</span>
          Octopus · Previews
        </h1>
        <p className="ox-previews-sub">
          Pick the centerpiece that replaces the current treemap. Click any preview to view it full-canvas.
        </p>
        <Link href="/octopus" className="ox-previews-link">
          current /octopus →
        </Link>
      </header>
      <div className="ox-previews-grid">
        {(Object.keys(VIEW_META) as ViewKind[]).map((k) => {
          const meta = VIEW_META[k];
          return (
            <button
              key={k}
              type="button"
              className="ox-previews-card"
              onClick={() => setSelected(k)}
            >
              <div className="ox-previews-card-head">
                <span className="ox-previews-card-letter">{meta.letter}</span>
                <div>
                  <h2 className="ox-previews-card-title">{meta.name}</h2>
                  <p className="ox-previews-card-sub">{meta.sub}</p>
                </div>
              </div>
              <div className="ox-previews-card-canvas">{renderView(k, { compact: true })}</div>
              <p className="ox-previews-card-line">{meta.oneLiner}</p>
            </button>
          );
        })}
      </div>
      <SectorDrawer
        open={!!openCluster}
        cluster={openCluster}
        stocks={drawerStocks}
        onClose={() => setOpenCluster(null)}
      />
    </div>
  );
}
