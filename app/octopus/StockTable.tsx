"use client";

import { useMemo } from "react";
import { displayName } from "@/lib/displayName";

export interface TableStock {
  tikr: string;
  name?: string;
  dayPct: number | null;
  cmp: number | null;
}

interface Props {
  stocks: TableStock[];
  focusedTikr: string | null;
  pinnedTikr: string | null;
  onRowHover: (tikr: string | null) => void;
  onRowClick: (tikr: string) => void;
  columns?: number;
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

function chunk<T>(arr: T[], n: number): T[][] {
  if (n <= 1) return [arr];
  const size = Math.ceil(arr.length / n);
  return Array.from({ length: n }, (_, i) => arr.slice(i * size, (i + 1) * size));
}

export function StockTable({
  stocks,
  focusedTikr,
  pinnedTikr,
  onRowHover,
  onRowClick,
  columns = 3,
}: Props) {
  const sorted = useMemo(() => {
    return [...stocks].sort((a, b) => {
      const aNull = a.dayPct == null;
      const bNull = b.dayPct == null;
      if (aNull && bNull) return a.tikr.localeCompare(b.tikr);
      if (aNull) return 1;
      if (bNull) return -1;
      return (b.dayPct as number) - (a.dayPct as number);
    });
  }, [stocks]);

  const cols = useMemo(() => chunk(sorted, columns), [sorted, columns]);

  return (
    <div className="ox-table" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {cols.map((col, i) => (
        <div key={i} className="ox-table-column">
          {col.map((s) => {
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
          })}
        </div>
      ))}
    </div>
  );
}
