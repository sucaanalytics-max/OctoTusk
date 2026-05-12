"use client";

import { useMemo } from "react";
import { UNCLASSIFIED } from "@/lib/sectors";

export interface LadderStock {
  sector: string;
  dayPct: number | null;
}

interface Row {
  sector: string;
  mean: number;
  count: number;
}

const BAR_RANGE_PCT = 2; // full-width edge corresponds to ±2 %

function fmtPctSigned(p: number): string {
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

export function SectorLadder({ stocks }: { stocks: LadderStock[] }) {
  const rows = useMemo<Row[]>(() => {
    const sums: Record<string, { sum: number; n: number }> = {};
    for (const s of stocks) {
      if (typeof s.dayPct !== "number") continue;
      if (!s.sector || s.sector === UNCLASSIFIED) continue;
      (sums[s.sector] ??= { sum: 0, n: 0 });
      sums[s.sector].sum += s.dayPct;
      sums[s.sector].n += 1;
    }
    return Object.entries(sums)
      .map(([sector, { sum, n }]) => ({ sector, mean: sum / n, count: n }))
      .sort((a, b) => b.mean - a.mean);
  }, [stocks]);

  return (
    <div className="octopus-panel">
      <div className="octopus-panel-title">Sector heat</div>
      <div className="octopus-ladder">
        {rows.length === 0 ? (
          <div className="octopus-loading">waiting for data…</div>
        ) : (
          rows.map((r) => {
            const clamped = Math.max(-BAR_RANGE_PCT, Math.min(BAR_RANGE_PCT, r.mean));
            const widthPct = (Math.abs(clamped) / BAR_RANGE_PCT) * 50;
            const fillColor = r.mean >= 0 ? "var(--color-positive)" : "var(--color-negative)";
            const fillStyle = r.mean >= 0
              ? { left: "50%", width: `${widthPct}%` }
              : { right: "50%", width: `${widthPct}%` };
            const pctClass = r.mean > 0 ? "octopus-pct-pos" : r.mean < 0 ? "octopus-pct-neg" : "octopus-pct-flat";
            return (
              <div key={r.sector} className="octopus-ladder-row" title={`${r.count} stocks`}>
                <span className="octopus-ladder-name">{r.sector}</span>
                <div className="octopus-ladder-bar">
                  <span className="octopus-ladder-bar-zero" aria-hidden />
                  <span
                    className="octopus-ladder-bar-fill"
                    style={{ ...fillStyle, background: fillColor }}
                  />
                </div>
                <span className={`octopus-ladder-pct ${pctClass}`}>{fmtPctSigned(r.mean)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
