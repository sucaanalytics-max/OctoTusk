"use client";

import { useMemo } from "react";
import { defaultClusterKey } from "@/lib/treemap";
import { displayClusterName } from "@/lib/sectors";

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
}

const STRIP_RANGE = 5;

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
        return {
          cluster,
          stocks: list,
          liveCount: live.length,
          upCount,
          downCount,
          mean,
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
        const caption =
          c.liveCount > 0
            ? `${c.stocks.length} ${c.stocks.length === 1 ? "stock" : "stocks"} · ${c.upCount} ↑ · ${c.downCount} ↓`
            : `${c.stocks.length} ${c.stocks.length === 1 ? "stock" : "stocks"}`;
        return (
          <button
            key={c.cluster}
            type="button"
            className="ox-secgrid-card"
            data-direction={direction}
            onClick={() => onClusterSelect(c.cluster)}
          >
            {/* ZONE 1 — Title (sector name + chevron + hairline) */}
            <header className="ox-secgrid-card-title">
              <span className="ox-secgrid-card-label">{displayClusterName(c.cluster)}</span>
              <span className="ox-secgrid-card-chevron" aria-hidden>→</span>
            </header>

            {/* ZONE 2 — Hero mean % (single dominant element) */}
            <div className="ox-secgrid-card-hero">
              <span className="ox-secgrid-card-mean-value">{fmtPctSigned(c.mean)}</span>
            </div>

            {/* ZONE 3 — Distribution strip */}
            <div className="ox-secgrid-card-strip" aria-hidden>
              <span className="ox-secgrid-strip-tick" style={{ left: "25%" }} />
              <span className="ox-secgrid-strip-zero" />
              <span className="ox-secgrid-strip-tick" style={{ left: "75%" }} />
              {liveStocks.map((s, i) => (
                <span
                  key={`d-${s.tikr}-${i}`}
                  className="ox-secgrid-strip-dot"
                  data-sign={s.dayPct > 0 ? "up" : s.dayPct < 0 ? "down" : "flat"}
                  style={{ left: `${dotXPosition(s.dayPct)}%` }}
                />
              ))}
            </div>

            {/* ZONE 4 — Footer caption */}
            <div className="ox-secgrid-card-caption">{caption}</div>
          </button>
        );
      })}
    </div>
  );
}
