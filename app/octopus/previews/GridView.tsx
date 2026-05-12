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
  /** Unused — kept for prop-compatibility with the other preview views. */
  onTileHover: (tikr: string | null, e?: React.MouseEvent) => void;
  /** Unused — kept for prop-compatibility with the other preview views. */
  onTileClick: (tikr: string, e: React.MouseEvent) => void;
  onClusterSelect?: (cluster: string) => void;
  compact?: boolean;
}

function fmtPctSigned(p: number | null): string {
  if (p == null || !isFinite(p)) return "—";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

interface ClusterAggregate {
  cluster: string;
  stocks: PreviewStock[];
  liveCount: number;
  upCount: number;
  downCount: number;
  mean: number | null;
  best: number | null;
  worst: number | null;
  topUp: PreviewStock[];
  topDown: PreviewStock[];
}

const STRIP_RANGE = 5; // Distribution strip range: -5% to +5%

function dotXPosition(dayPct: number): number {
  const clamped = Math.max(-STRIP_RANGE, Math.min(STRIP_RANGE, dayPct));
  return ((clamped + STRIP_RANGE) / (STRIP_RANGE * 2)) * 100;
}

export function GridView({ stocks, onClusterSelect, compact = false }: Props) {
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
          best: sortedDesc[0]?.dayPct ?? null,
          worst: sortedAsc[0]?.dayPct ?? null,
          topUp: sortedDesc.slice(0, 2).filter((s) => s.dayPct > 0),
          topDown: sortedAsc.slice(0, 2).filter((s) => s.dayPct < 0),
        };
      })
      .sort((a, b) => b.stocks.length - a.stocks.length);
  }, [stocks]);

  return (
    <div className={`ox-secgrid${compact ? " ox-secgrid-compact" : ""}`}>
      {clusters.map((c) => {
        const direction =
          c.mean == null ? "flat" : c.mean > 0 ? "up" : c.mean < 0 ? "down" : "flat";
        const liveStocks = c.stocks.filter((s): s is PreviewStock & { dayPct: number } => typeof s.dayPct === "number");
        return (
          <button
            key={c.cluster}
            type="button"
            className="ox-secgrid-card"
            data-direction={direction}
            onClick={() => onClusterSelect?.(c.cluster)}
          >
            {/* Row 1: name | count | mean (mirrors the reference's "Dow 30 / 0.11% / 26.56" pattern) */}
            <header className="ox-secgrid-card-head">
              <div className="ox-secgrid-card-titleblock">
                <span className="ox-secgrid-card-label">{c.cluster}</span>
                <span className="ox-secgrid-card-sub">
                  {c.stocks.length} {c.stocks.length === 1 ? "stock" : "stocks"}
                  {c.liveCount > 0 && (
                    <>
                      <span className="ox-secgrid-meta-dot" aria-hidden> · </span>
                      <span className="ox-secgrid-meta-up">{c.upCount} ↑</span>
                      <span className="ox-secgrid-meta-dot" aria-hidden> </span>
                      <span className="ox-secgrid-meta-down">{c.downCount} ↓</span>
                    </>
                  )}
                </span>
              </div>
              <div className="ox-secgrid-card-mean">
                <span className="ox-secgrid-card-mean-value">{fmtPctSigned(c.mean)}</span>
                <span className="ox-secgrid-card-mean-label">MEAN</span>
              </div>
            </header>

            {/* Row 2: top mover list. Mirrors reference's "value + H/L" cluster — */}
            {/* but for sector cards, the analogous "extremes" are top up + top down stocks. */}
            <div className="ox-secgrid-card-body">
              {c.topUp.length === 0 && c.topDown.length === 0 ? (
                <div className="ox-secgrid-card-empty">awaiting quotes</div>
              ) : (
                <>
                  {c.topUp.map((s) => (
                    <div key={`u-${s.tikr}`} className="ox-secgrid-row" data-side="up">
                      <span className="ox-secgrid-pct">{fmtPctSigned(s.dayPct)}</span>
                      <span className="ox-secgrid-name">{displayName(s.tikr, s.name)}</span>
                    </div>
                  ))}
                  {c.topDown.map((s) => (
                    <div key={`d-${s.tikr}`} className="ox-secgrid-row" data-side="down">
                      <span className="ox-secgrid-pct">{fmtPctSigned(s.dayPct)}</span>
                      <span className="ox-secgrid-name">{displayName(s.tikr, s.name)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Row 3: distribution strip — every stock's dayPct as a dot on a -5%..+5% axis. */}
            {/* The spatial analog of the reference's intraday sparkline (which we can't compute */}
            {/* without intraday history). Communicates sector composition at a glance. */}
            <div className="ox-secgrid-card-strip">
              <div className="ox-secgrid-strip-track" aria-hidden>
                <div className="ox-secgrid-strip-zero" />
                {liveStocks.map((s, i) => (
                  <span
                    key={`d-${s.tikr}-${i}`}
                    className="ox-secgrid-strip-dot"
                    data-sign={s.dayPct > 0 ? "up" : s.dayPct < 0 ? "down" : "flat"}
                    style={{ left: `${dotXPosition(s.dayPct)}%` }}
                  />
                ))}
              </div>
              <div className="ox-secgrid-strip-axis" aria-hidden>
                <span>−{STRIP_RANGE}%</span>
                <span>0</span>
                <span>+{STRIP_RANGE}%</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
