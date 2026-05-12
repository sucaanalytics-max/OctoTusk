"use client";

import { useMemo } from "react";
import { displayName } from "@/lib/displayName";
import { defaultClusterKey } from "@/lib/treemap";

export interface PreviewStock {
  tikr: string;
  name: string;
  sector: string;
  subsector?: string;
  dayPct: number | null;
  cmp: number | null;
  bearUpside: number | null;
  baseUpside: number | null;
  bullUpside: number | null;
  oneYearUpside: number | null;
}

interface Props {
  stocks: PreviewStock[];
  focusedTikr: string | null;
  pinnedTikr: string | null;
  /** Optional — accepted for prop-compatibility with the other views, unused here. */
  onTileHover: (tikr: string | null, e?: React.MouseEvent) => void;
  /** Optional — accepted for prop-compatibility with the other views, unused here. */
  onTileClick: (tikr: string, e: React.MouseEvent) => void;
  onClusterSelect?: (cluster: string) => void;
  compact?: boolean;
}

function fmtPctSigned(p: number | null): string {
  if (p == null || !isFinite(p)) return "—";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

function pctClass(p: number | null): string {
  if (p == null) return "ox-flat";
  if (p > 0) return "ox-pos";
  if (p < 0) return "ox-neg";
  return "ox-flat";
}

interface ClusterAggregate {
  cluster: string;
  stocks: PreviewStock[];
  liveCount: number;
  upCount: number;
  downCount: number;
  mean: number | null;
  topUp: PreviewStock[]; // up to 2
  topDown: PreviewStock[]; // up to 2
}

export function GridView({
  stocks,
  onClusterSelect,
  compact = false,
}: Props) {
  const clusters = useMemo<ClusterAggregate[]>(() => {
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
        const live = list.filter((s): s is PreviewStock & { dayPct: number } => typeof s.dayPct === "number");
        const upCount = live.filter((s) => s.dayPct > 0).length;
        const downCount = live.filter((s) => s.dayPct < 0).length;
        const mean = live.length ? live.reduce((sum, s) => sum + s.dayPct, 0) / live.length : null;
        const sortedDesc = [...live].sort((a, b) => b.dayPct - a.dayPct);
        const sortedAsc = [...live].sort((a, b) => a.dayPct - b.dayPct);
        return {
          cluster,
          stocks: list,
          liveCount: live.length,
          upCount,
          downCount,
          mean,
          topUp: sortedDesc.slice(0, 2).filter((s) => s.dayPct > 0),
          topDown: sortedAsc.slice(0, 2).filter((s) => s.dayPct < 0),
        };
      })
      .sort((a, b) => b.stocks.length - a.stocks.length);
  }, [stocks]);

  return (
    <div className={`ox-secgrid${compact ? " ox-secgrid-compact" : ""}`}>
      {clusters.map((c) => {
        const meanCls = pctClass(c.mean);
        return (
          <button
            key={c.cluster}
            type="button"
            className="ox-secgrid-card"
            onClick={() => onClusterSelect?.(c.cluster)}
          >
            <header className="ox-secgrid-card-head">
              <span className="ox-secgrid-card-label">{c.cluster}</span>
              <span className={`ox-secgrid-card-mean ${meanCls}`}>{fmtPctSigned(c.mean)}</span>
            </header>
            <div className="ox-secgrid-card-meta">
              {c.stocks.length} {c.stocks.length === 1 ? "stock" : "stocks"}
              {c.liveCount > 0 && (
                <>
                  {" · "}
                  <span className="ox-pos">{c.upCount} up</span>
                  {" · "}
                  <span className="ox-neg">{c.downCount} down</span>
                </>
              )}
            </div>
            <div className="ox-secgrid-card-body">
              {c.topUp.length === 0 && c.topDown.length === 0 ? (
                <div className="ox-secgrid-card-empty">awaiting quotes</div>
              ) : (
                <>
                  {c.topUp.map((s) => (
                    <div key={`u-${s.tikr}`} className="ox-secgrid-row">
                      <span className="ox-secgrid-arrow ox-pos">▲</span>
                      <span className="ox-secgrid-pct ox-pos">{fmtPctSigned(s.dayPct)}</span>
                      <span className="ox-secgrid-name">{displayName(s.tikr, s.name)}</span>
                    </div>
                  ))}
                  {c.topUp.length > 0 && c.topDown.length > 0 && (
                    <div className="ox-secgrid-divider" aria-hidden />
                  )}
                  {c.topDown.map((s) => (
                    <div key={`d-${s.tikr}`} className="ox-secgrid-row">
                      <span className="ox-secgrid-arrow ox-neg">▼</span>
                      <span className="ox-secgrid-pct ox-neg">{fmtPctSigned(s.dayPct)}</span>
                      <span className="ox-secgrid-name">{displayName(s.tikr, s.name)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
            <footer className="ox-secgrid-card-foot">
              View all {c.stocks.length} <span className="ox-secgrid-arrow-go" aria-hidden>→</span>
            </footer>
          </button>
        );
      })}
    </div>
  );
}
