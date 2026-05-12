"use client";

import { useMemo } from "react";
import { displayName } from "@/lib/displayName";
import { SECTOR_ORDER } from "@/lib/sectors";

export interface ScatterStock {
  tikr: string;
  name: string;
  sector: string;
  dayPct: number | null;
  oneYearUpside: number | null; // fraction (e.g. 0.23 = +23%)
}

interface Props {
  stocks: ScatterStock[];
  focusedTikr: string | null;
  pinnedTikr: string | null;
  onTileHover: (tikr: string | null, e?: React.MouseEvent) => void;
  onTileClick: (tikr: string, e: React.MouseEvent) => void;
}

const VIEW_W = 1600;
const VIEW_H = 900;
const PAD_L = 80;
const PAD_R = 40;
const PAD_T = 50;
const PAD_B = 60;

// Plot range
const X_MIN = -30; // 1Y upside %
const X_MAX = 60;
const Y_MIN = -5; // day %
const Y_MAX = 5;

// Sector → hue lookup, deterministic across renders.
function sectorHue(sector: string): number {
  const idx = SECTOR_ORDER.indexOf(sector);
  const fallback = (sector
    .split("")
    .reduce((sum, c) => sum + c.charCodeAt(0), 0)) % 360;
  return idx >= 0 ? (idx * 137.5) % 360 : fallback;
}

function sectorColor(sector: string): string {
  return `hsl(${sectorHue(sector)} 55% 42%)`;
}

function xToPx(x: number): number {
  const clamped = Math.max(X_MIN, Math.min(X_MAX, x));
  return PAD_L + ((clamped - X_MIN) / (X_MAX - X_MIN)) * (VIEW_W - PAD_L - PAD_R);
}
function yToPx(y: number): number {
  const clamped = Math.max(Y_MIN, Math.min(Y_MAX, y));
  return PAD_T + (1 - (clamped - Y_MIN) / (Y_MAX - Y_MIN)) * (VIEW_H - PAD_T - PAD_B);
}

const X_TICKS = [-30, -15, 0, 15, 30, 45, 60];
const Y_TICKS = [-5, -2.5, 0, 2.5, 5];

export function ScatterView({
  stocks,
  focusedTikr,
  pinnedTikr,
  onTileHover,
  onTileClick,
}: Props) {
  const points = useMemo(
    () =>
      stocks
        .filter((s) => typeof s.dayPct === "number" && typeof s.oneYearUpside === "number")
        .map((s) => ({
          ...s,
          xPx: xToPx(s.oneYearUpside! * 100),
          yPx: yToPx(s.dayPct!),
        })),
    [stocks]
  );

  const zeroX = xToPx(0);
  const zeroY = yToPx(0);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Stock scatter: 1Y upside × today's change"
      onMouseLeave={() => onTileHover(null)}
      className="ox-scatterview"
    >
      {/* Quadrant background tints */}
      <rect
        x={zeroX}
        y={PAD_T}
        width={VIEW_W - PAD_R - zeroX}
        height={zeroY - PAD_T}
        className="ox-scatter-q-tr"
      />
      <rect
        x={PAD_L}
        y={zeroY}
        width={zeroX - PAD_L}
        height={VIEW_H - PAD_B - zeroY}
        className="ox-scatter-q-bl"
      />

      {/* Grid lines */}
      {X_TICKS.map((t) => (
        <line
          key={`gx-${t}`}
          x1={xToPx(t)}
          x2={xToPx(t)}
          y1={PAD_T}
          y2={VIEW_H - PAD_B}
          className="ox-scatter-grid"
        />
      ))}
      {Y_TICKS.map((t) => (
        <line
          key={`gy-${t}`}
          x1={PAD_L}
          x2={VIEW_W - PAD_R}
          y1={yToPx(t)}
          y2={yToPx(t)}
          className="ox-scatter-grid"
        />
      ))}

      {/* Zero axes */}
      <line
        x1={zeroX}
        x2={zeroX}
        y1={PAD_T}
        y2={VIEW_H - PAD_B}
        className="ox-scatter-axis-zero"
      />
      <line
        x1={PAD_L}
        x2={VIEW_W - PAD_R}
        y1={zeroY}
        y2={zeroY}
        className="ox-scatter-axis-zero"
      />

      {/* Quadrant labels */}
      <text className="ox-scatter-quad ox-scatter-quad-tr" x={VIEW_W - PAD_R - 18} y={PAD_T + 22} textAnchor="end">
        BUY ZONE · rising AND undervalued
      </text>
      <text className="ox-scatter-quad" x={PAD_L + 18} y={PAD_T + 22}>
        MOMENTUM · rising despite full price
      </text>
      <text className="ox-scatter-quad" x={VIEW_W - PAD_R - 18} y={VIEW_H - PAD_B - 14} textAnchor="end">
        OVERSOLD · falling but undervalued
      </text>
      <text className="ox-scatter-quad ox-scatter-quad-bl" x={PAD_L + 18} y={VIEW_H - PAD_B - 14}>
        AVOID · falling AND overvalued
      </text>

      {/* X-axis labels */}
      {X_TICKS.map((t) => (
        <text
          key={`xl-${t}`}
          className="ox-scatter-tick"
          x={xToPx(t)}
          y={VIEW_H - PAD_B + 22}
          textAnchor="middle"
        >
          {t > 0 ? `+${t}%` : `${t}%`}
        </text>
      ))}
      <text className="ox-scatter-axis-title" x={(PAD_L + VIEW_W - PAD_R) / 2} y={VIEW_H - 14} textAnchor="middle">
        1-year upside →
      </text>

      {/* Y-axis labels */}
      {Y_TICKS.map((t) => (
        <text
          key={`yl-${t}`}
          className="ox-scatter-tick"
          x={PAD_L - 12}
          y={yToPx(t) + 4}
          textAnchor="end"
        >
          {t > 0 ? `+${t}%` : `${t}%`}
        </text>
      ))}
      <text
        className="ox-scatter-axis-title"
        x={20}
        y={(PAD_T + VIEW_H - PAD_B) / 2}
        textAnchor="middle"
        transform={`rotate(-90 20 ${(PAD_T + VIEW_H - PAD_B) / 2})`}
      >
        today's change ↑
      </text>

      {/* Dots */}
      {points.map((p) => {
        const isFocused = focusedTikr === p.tikr || pinnedTikr === p.tikr;
        const isPinned = pinnedTikr === p.tikr;
        const r = isFocused ? 9 : 6;
        return (
          <g
            key={p.tikr}
            className="ox-scatter-dot-group"
            data-focused={isFocused || undefined}
            data-pinned={isPinned || undefined}
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => onTileHover(p.tikr, e)}
            onMouseMove={(e) => onTileHover(p.tikr, e)}
            onClick={(e) => onTileClick(p.tikr, e)}
          >
            <circle
              cx={p.xPx}
              cy={p.yPx}
              r={r}
              fill={sectorColor(p.sector)}
              stroke="white"
              strokeWidth={1.5}
              className="ox-scatter-dot"
            />
            {isFocused && (
              <text
                className="ox-scatter-label"
                x={p.xPx + r + 4}
                y={p.yPx + 4}
                fontSize={13}
              >
                {displayName(p.tikr, p.name)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
