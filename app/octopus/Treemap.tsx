"use client";

import { useMemo } from "react";
import {
  computeOctopusLayout,
  heatmapColor,
  type OctopusInput,
  type OctopusRect,
  type OctopusSectorRect,
} from "@/lib/treemap";

interface Props {
  stocks: OctopusInput[];
}

const TILE_TIER_BOTH = 6400;
const TILE_TIER_NAME = 2500;

function fontSizeForArea(area: number): number {
  const s = Math.sqrt(area) / 8;
  return Math.max(11, Math.min(28, s));
}

function fmtPctSigned(p: number | null | undefined): string {
  if (p == null || isNaN(p)) return "";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

function shortLabel(tikr: string, max: number): string {
  if (tikr.length <= max) return tikr;
  return tikr.slice(0, Math.max(1, max - 1)) + "…";
}

function approxCharFit(width: number, fontSize: number): number {
  return Math.max(1, Math.floor(width / (fontSize * 0.55)));
}

export function Treemap({ stocks }: Props) {
  const layout = useMemo(() => computeOctopusLayout(stocks), [stocks]);
  const { W, H, sectorRects, stockRects } = layout;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Sector-clustered heatmap of Tusk research coverage"
    >
      {sectorRects.map((sr: OctopusSectorRect) => (
        <g key={`sec-${sr.sector}`}>
          <rect
            x={sr.x}
            y={sr.y}
            width={sr.w}
            height={sr.h}
            fill="transparent"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
          {sr.h > 40 && sr.w > 80 && (
            <text
              className="octopus-sector-label"
              x={sr.x + 8}
              y={sr.y + 16}
              fontSize={Math.min(18, Math.max(9, sr.h / 36))}
            >
              {sr.sector}
            </text>
          )}
        </g>
      ))}
      {stockRects.map((r: OctopusRect) => {
        const area = r.w * r.h;
        const fill = heatmapColor(r.dayPct ?? null, "octopusDay");
        const fs = fontSizeForArea(area);
        const showBoth = area >= TILE_TIER_BOTH;
        const showName = !showBoth && area >= TILE_TIER_NAME;
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;

        return (
          <g key={r.tikr}>
            <rect
              className="octopus-rect"
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill={fill}
              rx={2}
              ry={2}
            />
            {showBoth && (
              <>
                <text
                  className="octopus-tile-text"
                  x={cx}
                  y={cy - fs * 0.45}
                  fontSize={fs}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {shortLabel(r.tikr, approxCharFit(r.w, fs))}
                </text>
                <text
                  className="octopus-tile-text-pct"
                  x={cx}
                  y={cy + fs * 0.55}
                  fontSize={fs * 0.85}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {fmtPctSigned(r.dayPct)}
                </text>
              </>
            )}
            {showName && (
              <text
                className="octopus-tile-text"
                x={cx}
                y={cy}
                fontSize={fs}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {shortLabel(r.tikr, approxCharFit(r.w, fs))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
