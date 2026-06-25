// Single valuation gauge: horizontal band bar with a current-multiple marker.
// Each gauge has its OWN axis — never share a scale across PE/PB/EV-EBITDA.
// Band points drawn in ascending order of present values.

import { fmtNum } from "@/lib/format";

export interface ValuationGaugeProps {
  label: string;
  bear: number | null;
  base: number | null;
  bull: number | null;
  plus2sd: number | null;
  current: number | null;
  currentLabel?: string;
}

const BAR_H = 10;
const SVG_W = 300;
const SVG_H = 52;
const PAD_L = 4;
const PAD_R = 4;
const BAR_Y = 22;

// Color ramp: segments left→right from cheapest to most stretched.
// We map sorted band indices to color tokens.
const SEGMENT_COLORS = [
  "var(--color-positive)",   // cheapest zone
  "var(--color-warning)",    // fair/base zone
  "var(--color-negative)",   // stretched / +2SD zone
];

function segColor(idx: number, total: number): string {
  if (total <= 1) return SEGMENT_COLORS[1];
  const t = idx / (total - 1);
  if (t < 0.4) return SEGMENT_COLORS[0];
  if (t < 0.75) return SEGMENT_COLORS[1];
  return SEGMENT_COLORS[2];
}

export default function ValuationGauge({
  label, bear, base, bull, plus2sd, current, currentLabel = "current (TTM)"
}: ValuationGaugeProps) {
  // Collect present (non-null, finite, >0) band points in ascending order.
  const rawPoints = [bear, base, bull, plus2sd].filter(
    (v): v is number => v != null && Number.isFinite(v) && v > 0
  );
  const seenPts = new Set<number>();
  const points = rawPoints.filter((v) => { if (seenPts.has(v)) return false; seenPts.add(v); return true; }).sort((a, b) => a - b);

  if (points.length < 2) {
    return (
      <div className="cmp-gauge-wrap">
        <span className="cmp-gauge-label">{label}</span>
        <span className="cmp-gauge-empty">insufficient bands —</span>
      </div>
    );
  }

  // Axis: [min of points UNION current, max of points UNION current]
  // ensures the marker is always visible even if current is outside band.
  const allValues = current != null && Number.isFinite(current) && current > 0
    ? [...points, current]
    : points;
  const axisMin = Math.min(...allValues);
  const axisMax = Math.max(...allValues);
  const axisSpan = axisMax - axisMin;
  const PAD_FRAC = 0.08; // 8% padding on each side
  const lo = axisMin - axisSpan * PAD_FRAC;
  const hi = axisMax + axisSpan * PAD_FRAC;
  const span = hi - lo;

  function x(v: number): number {
    return PAD_L + ((v - lo) / span) * (SVG_W - PAD_L - PAD_R);
  }

  // Clamp marker position to visible range.
  function xClamped(v: number): number {
    return Math.max(PAD_L, Math.min(SVG_W - PAD_R, x(v)));
  }

  const hasMarker = current != null && Number.isFinite(current) && current > 0;

  return (
    <div className="cmp-gauge-wrap" aria-label={`${label} valuation gauge`}>
      <span className="cmp-gauge-label">{label}</span>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: "100%", maxWidth: "100%", display: "block" }}
        aria-hidden="true"
      >
        {/* Band segments between consecutive band points */}
        {points.slice(0, -1).map((v, i) => {
          const x1 = x(v);
          const x2 = x(points[i + 1]);
          return (
            <rect
              key={i}
              x={x1} y={BAR_Y} width={Math.max(1, x2 - x1)} height={BAR_H}
              fill={segColor(i, points.length - 1)}
              opacity={0.65}
            />
          );
        })}
        {/* Band outline */}
        <rect
          x={x(points[0])} y={BAR_Y}
          width={Math.max(1, x(points[points.length - 1]) - x(points[0]))}
          height={BAR_H}
          fill="none" stroke="var(--color-border)" strokeWidth={1} rx={2}
        />

        {/* Band point labels */}
        {points.map((v, i) => (
          <text
            key={i}
            x={x(v)} y={BAR_Y - 4}
            textAnchor="middle" fontSize={9}
            fill="var(--color-text-secondary)"
          >
            {fmtNum(v, 1)}
          </text>
        ))}

        {/* Current marker */}
        {hasMarker && current != null && (
          <>
            <line
              x1={xClamped(current)} y1={BAR_Y - 2}
              x2={xClamped(current)} y2={BAR_Y + BAR_H + 2}
              stroke="var(--color-text-primary)" strokeWidth={2}
            />
            <text
              x={xClamped(current)} y={BAR_Y + BAR_H + 14}
              textAnchor="middle" fontSize={9}
              fill="var(--color-text-primary)" fontWeight={600}
            >
              {fmtNum(current, 1)}
            </text>
            <text
              x={xClamped(current)} y={BAR_Y + BAR_H + 24}
              textAnchor="middle" fontSize={8}
              fill="var(--color-text-muted)"
            >
              {currentLabel}
            </text>
          </>
        )}
        {!hasMarker && (
          <text x={SVG_W / 2} y={BAR_Y + BAR_H + 16} textAnchor="middle" fontSize={9} fill="var(--color-text-muted)">
            no current multiple
          </text>
        )}
      </svg>
    </div>
  );
}
