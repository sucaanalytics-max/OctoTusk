"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { displayName } from "@/lib/displayName";

export interface HoverStock {
  tikr: string;
  name: string;
  sector: string;
  subsector?: string;
  dayPct: number | null;
  bearUpside: number | null;
  baseUpside: number | null;
  bullUpside: number | null;
  oneYearUpside: number | null;
}

const OFFSET = 18;

function fmtPct(p: number | null, asFraction: boolean): string {
  if (p == null || !isFinite(p)) return "—";
  const v = asFraction ? p * 100 : p;
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
}

function pctClass(p: number | null): string {
  if (p == null) return "octopus-pct-flat";
  if (p > 0) return "octopus-pct-pos";
  if (p < 0) return "octopus-pct-neg";
  return "octopus-pct-flat";
}

export function HoverCard({
  stock,
  cursor,
  pinned,
  onUnpin,
}: {
  stock: HoverStock;
  cursor: { x: number; y: number } | null;
  pinned: boolean;
  onUnpin: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!cursor || !ref.current) return;
    const el = ref.current;
    const w = el.offsetWidth || 280;
    const h = el.offsetHeight || 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Prefer right of cursor; flip to left if it would overflow.
    let left = cursor.x + OFFSET;
    if (left + w > vw - 8) left = Math.max(8, cursor.x - w - OFFSET);
    // Prefer below cursor; flip up if it overflows the viewport.
    let top = cursor.y + OFFSET;
    if (top + h > vh - 8) top = Math.max(8, cursor.y - h - OFFSET);
    setPlacement({ left, top });
  }, [cursor]);

  const subsector = stock.subsector && stock.subsector !== stock.sector ? stock.subsector : "";
  const meta = subsector ? `${stock.tikr} · ${subsector}` : stock.tikr;

  return (
    <div
      ref={ref}
      className={`octopus-hover-card${pinned ? " octopus-hover-card-pinned" : ""}`}
      style={{ left: placement.left, top: placement.top }}
      role="tooltip"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="octopus-hover-head">
        <div className="octopus-hover-name">{displayName(stock.tikr, stock.name)}</div>
        {pinned && (
          <button
            type="button"
            className="octopus-hover-close"
            aria-label="Unpin"
            onClick={(e) => {
              e.stopPropagation();
              onUnpin();
            }}
          >
            ✕
          </button>
        )}
      </div>
      <div className="octopus-hover-meta">{meta}</div>
      <div className="octopus-hover-divider" />
      <div className="octopus-hover-row">
        <span className="octopus-hover-label">Day</span>
        <span className={`octopus-hover-value ${pctClass(stock.dayPct)}`}>
          {fmtPct(stock.dayPct, false)}
        </span>
      </div>
      <div className="octopus-hover-divider" />
      <div className="octopus-hover-row">
        <span className="octopus-hover-label">Bear</span>
        <span className={`octopus-hover-value ${pctClass(stock.bearUpside)}`}>
          {fmtPct(stock.bearUpside, true)}
        </span>
      </div>
      <div className="octopus-hover-row">
        <span className="octopus-hover-label">Base</span>
        <span className={`octopus-hover-value ${pctClass(stock.baseUpside)}`}>
          {fmtPct(stock.baseUpside, true)}
        </span>
      </div>
      <div className="octopus-hover-row">
        <span className="octopus-hover-label">Bull</span>
        <span className={`octopus-hover-value ${pctClass(stock.bullUpside)}`}>
          {fmtPct(stock.bullUpside, true)}
        </span>
      </div>
      <div className="octopus-hover-row octopus-hover-row-emph">
        <span className="octopus-hover-label">1Y target</span>
        <span className={`octopus-hover-value ${pctClass(stock.oneYearUpside)}`}>
          {fmtPct(stock.oneYearUpside, true)}
        </span>
      </div>
    </div>
  );
}
