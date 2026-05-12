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

const MAG_FULL_PCT = 3; // ±3% day → full background saturation
const SLATE = "#1B2434";

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

function dirOf(p: number | null): "up" | "down" | "flat" {
  if (p == null || Math.abs(p) < 0.05) return "flat";
  return p > 0 ? "up" : "down";
}

function bgFor(p: number | null): string {
  const d = dirOf(p);
  if (d === "flat" || p == null) return SLATE;
  const t = Math.min(1, Math.abs(p) / MAG_FULL_PCT);
  // strong tint on the left, fades right. Editorial palette colors.
  if (d === "up") {
    const aL = 0.12 + t * 0.34;
    const aR = 0.04 + t * 0.06;
    return `linear-gradient(to right, rgba(22, 163, 74, ${aL.toFixed(2)}), rgba(22, 163, 74, ${aR.toFixed(2)})), ${SLATE}`;
  }
  const aL = 0.12 + t * 0.34;
  const aR = 0.04 + t * 0.06;
  return `linear-gradient(to right, rgba(220, 38, 38, ${aL.toFixed(2)}), rgba(220, 38, 38, ${aR.toFixed(2)})), ${SLATE}`;
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
        const isFocused = focusedTikr === s.tikr || pinnedTikr === s.tikr;
        const isPinned = pinnedTikr === s.tikr;
        return (
          <button
            key={s.tikr}
            type="button"
            className="ox-pill"
            data-dir={dir}
            data-focused={isFocused || undefined}
            data-pinned={isPinned || undefined}
            style={{ background: bgFor(s.dayPct) }}
            onMouseEnter={() => onRowHover(s.tikr)}
            onMouseLeave={() => onRowHover(null)}
            onClick={() => onRowClick(s.tikr)}
          >
            <span className="ox-pill-bar" aria-hidden />
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
