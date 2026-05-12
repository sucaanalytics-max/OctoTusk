"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { displayName } from "@/lib/displayName";

export interface HoverStock {
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

const OFFSET = 18;

function fmtPct(p: number | null, asFraction: boolean): string {
  if (p == null || !isFinite(p)) return "—";
  const v = asFraction ? p * 100 : p;
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
}

function fmtCmp(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctClass(p: number | null): string {
  if (p == null) return "ox-flat";
  if (p > 0) return "ox-pos";
  if (p < 0) return "ox-neg";
  return "ox-flat";
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
    const h = el.offsetHeight || 240;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = cursor.x + OFFSET;
    if (left + w > vw - 8) left = Math.max(8, cursor.x - w - OFFSET);
    let top = cursor.y + OFFSET;
    if (top + h > vh - 8) top = Math.max(8, cursor.y - h - OFFSET);
    setPlacement({ left, top });
  }, [cursor]);

  const subsector = stock.subsector && stock.subsector !== stock.sector ? stock.subsector : "";
  const metaSuffix = subsector ? ` · ${subsector}` : "";

  return (
    <div
      ref={ref}
      className={`ox-hover-card${pinned ? " ox-hover-card-pinned" : ""}`}
      style={{ left: placement.left, top: placement.top }}
      role="tooltip"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ox-hover-head">
        <h3 className="ox-hover-name">{displayName(stock.tikr, stock.name)}</h3>
        {pinned && (
          <button
            type="button"
            className="ox-hover-close"
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
      <div className="ox-hover-meta">
        <span className="ox-hover-meta-tikr">{stock.tikr}</span>
        {metaSuffix}
      </div>

      <div className="ox-hover-cmp-row">
        <span className="ox-hover-cmp">
          <span className="ox-rupee">₹</span>
          {fmtCmp(stock.cmp)}
        </span>
        <span className={`ox-hover-day ${pctClass(stock.dayPct)}`}>
          {fmtPct(stock.dayPct, false)}
        </span>
      </div>

      <div className="ox-hover-divider" />

      <div className="ox-hover-section">
        <div className="ox-hover-section-label">Upside vs CMP</div>
        <div className="ox-hover-row">
          <span className="ox-hover-label">Bear</span>
          <span className={`ox-hover-value ${pctClass(stock.bearUpside)}`}>
            {fmtPct(stock.bearUpside, true)}
          </span>
        </div>
        <div className="ox-hover-row">
          <span className="ox-hover-label">Base</span>
          <span className={`ox-hover-value ${pctClass(stock.baseUpside)}`}>
            {fmtPct(stock.baseUpside, true)}
          </span>
        </div>
        <div className="ox-hover-row">
          <span className="ox-hover-label">Bull</span>
          <span className={`ox-hover-value ${pctClass(stock.bullUpside)}`}>
            {fmtPct(stock.bullUpside, true)}
          </span>
        </div>
        <div className="ox-hover-row ox-hover-row-emph">
          <span className="ox-hover-label">1Y target</span>
          <span className={`ox-hover-value ${pctClass(stock.oneYearUpside)}`}>
            {fmtPct(stock.oneYearUpside, true)}
          </span>
        </div>
      </div>
    </div>
  );
}
