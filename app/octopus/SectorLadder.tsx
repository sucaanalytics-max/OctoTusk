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

const BAR_RANGE_PCT = 2; // ±2% maps to the full scale width

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
    <section className="ox-panel ox-panel-ladder">
      <header className="ox-section-head">
        <span className="ox-section-label">Sector Heat</span>
        <span className="ox-section-trail" aria-hidden />
      </header>
      <div className="ox-ladder">
        {rows.length === 0 ? (
          <div className="ox-ladder-empty">awaiting data</div>
        ) : (
          rows.map((r) => {
            const clamped = Math.max(-BAR_RANGE_PCT, Math.min(BAR_RANGE_PCT, r.mean));
            // Position dot 0%..100% across the scale, with 50% being zero.
            const dotPosPct = 50 + (clamped / BAR_RANGE_PCT) * 50;
            const cls = r.mean > 0 ? "ox-pos" : r.mean < 0 ? "ox-neg" : "ox-flat";
            return (
              <div key={r.sector} className="ox-ladder-row" title={`${r.count} stocks`}>
                <span className="ox-ladder-name">{r.sector}</span>
                <div className="ox-ladder-scale">
                  <span className="ox-ladder-track" aria-hidden />
                  <span className="ox-ladder-zero" aria-hidden />
                  <span
                    className={`ox-ladder-dot ${cls}`}
                    style={{ left: `${dotPosPct}%` }}
                  />
                </div>
                <span className={`ox-ladder-pct ${cls}`}>{fmtPctSigned(r.mean)}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
