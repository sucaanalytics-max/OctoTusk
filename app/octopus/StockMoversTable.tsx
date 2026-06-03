"use client";

import { useMemo } from "react";
import { displayName } from "@/lib/displayName";

export interface MoverStock {
  tikr: string;
  name?: string;
  dayPct: number | null;
  cmp: number | null;
}

interface Props {
  stocks: MoverStock[];
  /** Movement band in percent (e.g. 3 → gainers ≥ +3%, losers ≤ −3%). */
  band: number;
  focusedTikr: string | null;
  pinnedTikr: string | null;
  onRowHover: (tikr: string | null) => void;
  onRowClick: (tikr: string) => void;
}

function fmtPctSigned(p: number | null): string {
  if (p == null || !isFinite(p)) return "—";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(2)}%`;
}

function fmtCmp(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dirOf(p: number | null): "up" | "down" | "flat" | "null" {
  if (p == null) return "null";
  if (Math.abs(p) < 0.05) return "flat";
  return p > 0 ? "up" : "down";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

type BucketKey = "gainers" | "flat" | "losers";

interface MoversBucket {
  key: BucketKey;
  label: string;
  range: string;
  rows: MoverStock[];
  median: number | null;
}

export function StockMoversTable({ stocks, band, focusedTikr, pinnedTikr, onRowHover, onRowClick }: Props) {
  const buckets: MoversBucket[] = useMemo(() => {
    const gainers: MoverStock[] = [];
    const flat: MoverStock[] = [];
    const losers: MoverStock[] = [];
    for (const s of stocks) {
      const p = s.dayPct;
      if (p != null && p >= band) gainers.push(s);
      else if (p != null && p <= -band) losers.push(s);
      else flat.push(s); // includes flat moves and unpriced (null) names
    }
    // Biggest gainer top; biggest loser top; flat by move desc with nulls last.
    gainers.sort((a, b) => (b.dayPct as number) - (a.dayPct as number));
    losers.sort((a, b) => (a.dayPct as number) - (b.dayPct as number));
    flat.sort((a, b) => {
      const aN = a.dayPct == null;
      const bN = b.dayPct == null;
      if (aN && bN) return a.tikr.localeCompare(b.tikr);
      if (aN) return 1;
      if (bN) return -1;
      return (b.dayPct as number) - (a.dayPct as number);
    });
    const med = (rows: MoverStock[]) =>
      median(rows.map((r) => r.dayPct).filter((x): x is number => x != null));
    return [
      { key: "gainers", label: "Gainers", range: `≥ +${band}%`, rows: gainers, median: med(gainers) },
      { key: "flat", label: "Flat", range: `−${band}% … +${band}%`, rows: flat, median: med(flat) },
      { key: "losers", label: "Losers", range: `≤ −${band}%`, rows: losers, median: med(losers) },
    ];
  }, [stocks, band]);

  return (
    <div className="ox-movers">
      {buckets.map((b) => (
        <section key={b.key} className="ox-movers-col" data-bucket={b.key}>
          <header className="ox-movers-col-head">
            <span className="ox-movers-col-label">
              {b.label} <span className="ox-movers-col-range">{b.range}</span>
            </span>
            <span className="ox-movers-col-meta">
              {b.rows.length}
              {b.median != null && (
                <>
                  {" · med "}
                  <span className="ox-movers-col-median">{fmtPctSigned(b.median)}</span>
                </>
              )}
            </span>
          </header>
          <div className="ox-movers-col-body">
            {b.rows.length === 0 ? (
              <div className="ox-movers-empty">No stocks</div>
            ) : (
              b.rows.map((s) => {
                const dir = dirOf(s.dayPct);
                const isFocused = focusedTikr === s.tikr || pinnedTikr === s.tikr;
                const isPinned = pinnedTikr === s.tikr;
                return (
                  <button
                    key={s.tikr}
                    type="button"
                    className="ox-table-row"
                    data-dir={dir}
                    data-focused={isFocused || undefined}
                    data-pinned={isPinned || undefined}
                    onMouseEnter={() => onRowHover(s.tikr)}
                    onMouseLeave={() => onRowHover(null)}
                    onClick={() => onRowClick(s.tikr)}
                  >
                    <span className="ox-table-name-cell">
                      <span className="ox-table-name">{displayName(s.tikr, s.name)}</span>
                      <span className="ox-table-tikr">{s.tikr}</span>
                    </span>
                    <span className="ox-table-cmp">
                      {s.cmp != null ? (
                        <>
                          <span className="ox-table-rupee">₹</span>
                          {fmtCmp(s.cmp)}
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="ox-table-pct" data-dir={dir}>
                      {fmtPctSigned(s.dayPct)}
                    </span>
                    <span className="ox-table-arrow" data-dir={dir} aria-hidden>
                      {dir === "up" ? "▲" : dir === "down" ? "▼" : " "}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
