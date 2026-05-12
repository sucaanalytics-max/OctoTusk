"use client";

import { useMemo } from "react";
import { displayName } from "@/lib/displayName";
import { heatmapColor } from "@/lib/treemap";
import { defaultClusterKey } from "@/lib/treemap";

export interface PreviewStock {
  tikr: string;
  name: string;
  sector: string;
  subsector?: string;
  dayPct: number | null;
}

interface Props {
  stocks: PreviewStock[];
  focusedTikr: string | null;
  pinnedTikr: string | null;
  onTileHover: (tikr: string | null, e?: React.MouseEvent) => void;
  onTileClick: (tikr: string, e: React.MouseEvent) => void;
  compact?: boolean;
}

function fmtPctSigned(p: number | null): string {
  if (p == null || !isFinite(p)) return "";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

export function GridView({
  stocks,
  focusedTikr,
  pinnedTikr,
  onTileHover,
  onTileClick,
  compact = false,
}: Props) {
  const clusters = useMemo(() => {
    const groups: Record<string, PreviewStock[]> = {};
    for (const s of stocks) {
      const k = defaultClusterKey({
        tikr: s.tikr,
        name: s.name,
        sector: s.sector,
        subsector: s.subsector,
        dayPct: s.dayPct,
      });
      (groups[k] ??= []).push(s);
    }
    return Object.entries(groups)
      .map(([cluster, list]) => {
        const live = list.map((s) => s.dayPct).filter((p): p is number => typeof p === "number");
        const mean = live.length ? live.reduce((a, b) => a + b, 0) / live.length : null;
        return { cluster, stocks: list, mean, count: list.length };
      })
      .sort((a, b) => b.count - a.count);
  }, [stocks]);

  return (
    <div className={`ox-gridview${compact ? " ox-gridview-compact" : ""}`}>
      {clusters.map((c) => {
        const meanCls =
          c.mean == null ? "ox-flat" : c.mean > 0 ? "ox-pos" : c.mean < 0 ? "ox-neg" : "ox-flat";
        return (
          <section key={c.cluster} className="ox-gridview-cluster">
            <header className="ox-gridview-cluster-head">
              <span className="ox-gridview-cluster-label">{c.cluster}</span>
              <span className={`ox-gridview-cluster-mean ${meanCls}`}>
                {c.mean == null ? "—" : fmtPctSigned(c.mean)}
              </span>
            </header>
            <div className="ox-gridview-cells">
              {c.stocks.map((s) => {
                const isFocused = focusedTikr === s.tikr || pinnedTikr === s.tikr;
                const isPinned = pinnedTikr === s.tikr;
                const fill = heatmapColor(s.dayPct ?? null, "octopusDay");
                return (
                  <button
                    key={s.tikr}
                    type="button"
                    className="ox-gridview-cell"
                    style={{ background: fill }}
                    data-focused={isFocused || undefined}
                    data-pinned={isPinned || undefined}
                    onMouseEnter={(e) => onTileHover(s.tikr, e)}
                    onMouseMove={(e) => onTileHover(s.tikr, e)}
                    onMouseLeave={() => onTileHover(null)}
                    onClick={(e) => onTileClick(s.tikr, e)}
                  >
                    <span className="ox-gridview-cell-name">
                      {displayName(s.tikr, s.name)}
                    </span>
                    <span className="ox-gridview-cell-pct">{fmtPctSigned(s.dayPct)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
