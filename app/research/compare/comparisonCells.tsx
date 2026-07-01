"use client";
// Presentational cell sub-components for the Verdict Table (ComparisonTable.tsx).
// Extracted to keep ComparisonTable under 400 lines.
// All are pure functional components — no state, no hooks.

import { fmtRupee } from "@/lib/format";
import type { ScorecardRow } from "@/lib/compare/types";
import type { CompareStock } from "@/lib/compare/types";

// ── Winner / bar logic helpers ───────────────────────────────────────────────

import type { ComparisonRow } from "./comparisonRows";
import type { Col } from "./comparisonRows";

/** Determine winning column index. Returns -1 when no unique winner. */
export function findWinner(groupRow: ComparisonRow, cols: Col[]): number {
  if (!groupRow.metric || !groupRow.goal) return -1;
  const values = cols.map((col) => groupRow.metric!(col));
  const finite = values.filter((v) => v != null && Number.isFinite(v));
  if (finite.length < 2) return -1;

  let bestIdx = -1;
  let bestVal = groupRow.goal === "max" ? -Infinity : Infinity;
  let bestCount = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || (!Number.isFinite(v) && v !== Number.POSITIVE_INFINITY)) continue;
    const better =
      groupRow.goal === "max" ? v > bestVal : Math.abs(v) < Math.abs(bestVal);
    const tied =
      groupRow.goal === "max" ? v === bestVal : Math.abs(v) === Math.abs(bestVal);
    if (better) { bestVal = v; bestIdx = i; bestCount = 1; }
    else if (tied) { bestCount += 1; }
  }
  return bestCount === 1 ? bestIdx : -1;
}

/** Row-max absolute value for normalizing bar widths. */
export function computeRowMaxAbs(groupRow: ComparisonRow, cols: Col[]): number {
  if (!groupRow.metric || !groupRow.bar) return 0;
  const mags = cols
    .map((col) => groupRow.metric!(col))
    .filter((v): v is number => v != null && Number.isFinite(v))
    .map(Math.abs);
  return mags.length > 0 ? Math.max(...mags) : 0;
}

// ── Center-zero signed magnitude bar ─────────────────────────────────────────

interface MagBarProps {
  value: number | null;
  rowMaxAbs: number;
  barStyle: "signed" | "risk";
}

export function MagBar({ value, rowMaxAbs, barStyle }: MagBarProps) {
  if (value == null || !Number.isFinite(value) || rowMaxAbs === 0) return null;
  if (barStyle === "risk" && value <= 0) return null;

  const halfPct = (Math.abs(value) / rowMaxAbs) * 50;
  const w = Math.max(0, halfPct).toFixed(1) + "%";

  if (barStyle === "risk") {
    return (
      <span className="cmp-vt-magbar" aria-hidden="true">
        <span className="cmp-vt-magbar-zero" />
        <span className="cmp-vt-magbar-fill is-risk" style={{ width: w }} />
      </span>
    );
  }

  const side = value >= 0 ? "is-pos" : "is-neg";
  return (
    <span className="cmp-vt-magbar" aria-hidden="true">
      <span className="cmp-vt-magbar-zero" />
      <span className={`cmp-vt-magbar-fill ${side}`} style={{ width: w }} />
    </span>
  );
}

// ── 5-pip meter ──────────────────────────────────────────────────────────────

interface PipMeterProps {
  value: number | null;
  isWin: boolean;
}

export function PipMeter({ value, isWin }: PipMeterProps) {
  const n = value != null ? Math.round(Math.min(5, Math.max(0, value))) : 0;
  return (
    <span className="cmp-vt-rating-line">
      {isWin && (
        <span className="cmp-vt-win-mark" aria-label="best in row">
          &#x25B8;
        </span>
      )}
      <span className="cmp-vt-pips" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`cmp-vt-pip${i < n ? " on" : ""}`} />
        ))}
      </span>
      <span className="cmp-vt-single">{value != null ? `${n}/5` : "—"}</span>
    </span>
  );
}

// ── Position-in-range mini-track ─────────────────────────────────────────────

interface RangeTrackProps {
  row: ScorecardRow;
  stock: CompareStock;
  isLeader: boolean;
}

export function RangeTrack({ row, stock, isLeader }: RangeTrackProps) {
  const zone = row.scenarioZone;
  const bp = row.bandPos;
  if (zone == null || bp == null) return <span className="is-muted">—</span>;

  const dotPct = `${(Math.max(0, Math.min(1, bp)) * 100).toFixed(1)}%`;

  let basePct = "50%";
  if (
    stock.bear != null &&
    stock.bull != null &&
    stock.bull > stock.bear &&
    stock.base != null
  ) {
    const bf = (stock.base - stock.bear) / (stock.bull - stock.bear);
    basePct = `${(Math.max(0, Math.min(1, bf)) * 100).toFixed(1)}%`;
  }

  const vClass =
    zone === "cheap" ? "is-cheap" : zone === "rich" ? "is-rich" : "is-fair";
  const vGlyph = zone === "cheap" ? "◂" : zone === "rich" ? "▸" : "◆";
  const vWord = zone === "cheap" ? "CHEAP" : zone === "rich" ? "RICH" : "FAIR";

  return (
    <div className={`cmp-vt-range-wrap${isLeader ? " cmp-vt-leader-range" : ""}`}>
      <span className={`cmp-vt-range-verdict ${vClass}`} aria-hidden="true">
        <span>{vGlyph}</span>
        {vWord}
      </span>
      <div
        className="cmp-vt-range-track"
        role="img"
        aria-label={`CMP at ${Math.round(bp * 100)}% of bear-to-bull band, ${vWord}`}
      >
        <span className="cmp-vt-range-base" style={{ left: basePct }} />
        <span className="cmp-vt-range-dot" style={{ left: dotPct }} />
      </div>
      <div className="cmp-vt-range-ends">
        <span>{stock.bear != null ? fmtRupee(stock.bear) : "—"}</span>
        <span>{stock.bull != null ? fmtRupee(stock.bull) : "—"}</span>
      </div>
    </div>
  );
}
