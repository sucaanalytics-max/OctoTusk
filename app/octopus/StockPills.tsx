"use client";

import { useMemo } from "react";
import { displayName } from "@/lib/displayName";

export interface PillStock {
  tikr: string;
  name?: string;
  dayPct: number | null;
  cmp: number | null;
}

interface Props {
  stocks: PillStock[];
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

type Intensity =
  | "big-up"
  | "med-up"
  | "sm-up"
  | "flat"
  | "sm-down"
  | "med-down"
  | "big-down"
  | "null";

// Buckets from the Bloomberg-saturated palette: lightness encodes magnitude.
// Thresholds are |day %|: small <1, medium 1-3, big ≥3.
function intensityOf(p: number | null): Intensity {
  if (p == null || !isFinite(p)) return "null";
  if (Math.abs(p) < 0.1) return "flat";
  if (p >= 3) return "big-up";
  if (p >= 1) return "med-up";
  if (p > 0) return "sm-up";
  if (p <= -3) return "big-down";
  if (p <= -1) return "med-down";
  return "sm-down";
}

function dirOf(p: number | null): "up" | "down" | "flat" {
  if (p == null || Math.abs(p) < 0.05) return "flat";
  return p > 0 ? "up" : "down";
}

export function StockPills({
  stocks,
  focusedTikr,
  pinnedTikr,
  onRowHover,
  onRowClick,
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

  return (
    <div className="ox-pills">
      {sorted.map((s) => {
        const dir = dirOf(s.dayPct);
        const intensity = intensityOf(s.dayPct);
        const isFocused = focusedTikr === s.tikr || pinnedTikr === s.tikr;
        const isPinned = pinnedTikr === s.tikr;
        return (
          <button
            key={s.tikr}
            type="button"
            className="ox-pill"
            data-dir={dir}
            data-intensity={intensity}
            data-focused={isFocused || undefined}
            data-pinned={isPinned || undefined}
            onMouseEnter={() => onRowHover(s.tikr)}
            onMouseLeave={() => onRowHover(null)}
            onClick={() => onRowClick(s.tikr)}
          >
            <span className="ox-pill-row ox-pill-row-1">
              <span className="ox-pill-tikr">{s.tikr}</span>
              <span className="ox-pill-pct" data-dir={dir}>
                {fmtPctSigned(s.dayPct)} {dir === "up" ? "▲" : dir === "down" ? "▼" : ""}
              </span>
            </span>
            <span className="ox-pill-row ox-pill-row-2">
              <span className="ox-pill-name">{displayName(s.tikr, s.name)}</span>
              <span className="ox-pill-cmp">
                {s.cmp != null ? <><span className="ox-pill-rupee">₹</span>{fmtCmp(s.cmp)}</> : "—"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
