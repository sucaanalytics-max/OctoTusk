"use client";

import { useMemo } from "react";
import { displayName } from "@/lib/displayName";
import { defaultClusterKey } from "@/lib/treemap";

/**
 * Stock shape consumed by the sector-card centerpiece.
 *
 * Matches the MergedStock shape produced by OctopusClient so the same
 * object can flow into both the cards (summary) and the drawer
 * (full detail) without reshaping.
 */
export interface SectorGridStock {
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
  stocks: SectorGridStock[];
  onClusterSelect: (cluster: string) => void;
}

function fmtPctSigned(p: number | null): string {
  if (p == null || !isFinite(p)) return "—";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

interface ClusterAggregate {
  cluster: string;
  stocks: SectorGridStock[];
  liveCount: number;
  upCount: number;
  downCount: number;
  mean: number | null;
  topUp: SectorGridStock[];
  topDown: SectorGridStock[];
}

const STRIP_RANGE = 5; // distribution strip: -5%..+5%

function dotXPosition(dayPct: number): number {
  const clamped = Math.max(-STRIP_RANGE, Math.min(STRIP_RANGE, dayPct));
  return ((clamped + STRIP_RANGE) / (STRIP_RANGE * 2)) * 100;
}

export function SectorGrid({ stocks, onClusterSelect }: Props) {
  const clusters = useMemo<ClusterAggregate[]>(() => {
    const groups: Record<string, SectorGridStock[]> = {};
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
        const live = list.filter(
          (s): s is SectorGridStock & { dayPct: number } => typeof s.dayPct === "number"
        );
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
    <div className="ox-secgrid">
      {clusters.map((c) => {
        const direction =
          c.mean == null ? "flat" : c.mean > 0 ? "up" : c.mean < 0 ? "down" : "flat";
        const liveStocks = c.stocks.filter(
          (s): s is SectorGridStock & { dayPct: number } => typeof s.dayPct === "number"
        );
        return (
          <button
            key={c.cluster}
            type="button"
            className="ox-secgrid-card"
            data-direction={direction}
            onClick={() => onClusterSelect(c.cluster)}
          >
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
