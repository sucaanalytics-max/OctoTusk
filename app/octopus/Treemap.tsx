"use client";

import { useMemo } from "react";
import {
  computeOctopusLayout,
  heatmapColor,
  type OctopusInput,
  type OctopusRect,
  type OctopusSectorRect,
} from "@/lib/treemap";
import { displayName } from "@/lib/displayName";

interface Props {
  stocks: OctopusInput[];
  focusedTikr: string | null;
  pinnedTikr: string | null;
  flashing: Map<string, "up" | "down">;
  onTileHover: (tikr: string | null, e?: React.MouseEvent) => void;
  onTileClick: (tikr: string, e: React.MouseEvent) => void;
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

function shortLabel(name: string, max: number): string {
  if (name.length <= max) return name;
  return name.slice(0, Math.max(1, max - 1)) + "…";
}

function approxCharFit(width: number, fontSize: number): number {
  return Math.max(1, Math.floor(width / (fontSize * 0.55)));
}

export function Treemap({
  stocks,
  focusedTikr,
  pinnedTikr,
  flashing,
  onTileHover,
  onTileClick,
}: Props) {
  const layout = useMemo(() => computeOctopusLayout(stocks), [stocks]);
  const { W, H, sectorRects, stockRects } = layout;

  // Sort so the focused tile renders last (= on top, no z-index needed for SVG).
  const renderRects = useMemo(() => {
    if (!focusedTikr && !pinnedTikr) return stockRects;
    const focus = pinnedTikr ?? focusedTikr;
    return [...stockRects].sort((a, b) => {
      if (a.tikr === focus) return 1;
      if (b.tikr === focus) return -1;
      return 0;
    });
  }, [stockRects, focusedTikr, pinnedTikr]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Sector-clustered heatmap of Tusk research coverage"
      onMouseLeave={() => onTileHover(null)}
    >
      {sectorRects.map((sr: OctopusSectorRect) => {
        const labelFontSize = Math.min(18, Math.max(9, sr.h / 36));
        const meanLabel = fmtPctSigned(sr.meanDayPct);
        const meanColorClass =
          sr.meanDayPct == null
            ? "octopus-cluster-mean-flat"
            : sr.meanDayPct > 0
            ? "octopus-cluster-mean-pos"
            : sr.meanDayPct < 0
            ? "octopus-cluster-mean-neg"
            : "octopus-cluster-mean-flat";
        return (
          <g key={`sec-${sr.cluster}`} pointerEvents="none">
            <rect
              x={sr.x}
              y={sr.y}
              width={sr.w}
              height={sr.h}
              fill="transparent"
              stroke="rgba(0,0,0,0.06)"
              strokeWidth={1}
            />
            {sr.h > 40 && sr.w > 80 && (
              <>
                <text
                  className="octopus-sector-label"
                  x={sr.x + 8}
                  y={sr.y + 16}
                  fontSize={labelFontSize}
                >
                  {sr.cluster}
                </text>
                {meanLabel && sr.w > 160 && (
                  <text
                    className={`octopus-cluster-mean ${meanColorClass}`}
                    x={sr.x + sr.w - 8}
                    y={sr.y + 16}
                    fontSize={labelFontSize}
                    textAnchor="end"
                  >
                    {meanLabel}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}
      {renderRects.map((r: OctopusRect) => {
        const area = r.w * r.h;
        const fill = heatmapColor(r.dayPct ?? null, "octopusDay");
        const fs = fontSizeForArea(area);
        const showBoth = area >= TILE_TIER_BOTH;
        const showName = !showBoth && area >= TILE_TIER_NAME;
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const label = displayName(r.tikr, r.name);
        const isFocused = focusedTikr === r.tikr || pinnedTikr === r.tikr;
        const isPinned = pinnedTikr === r.tikr;
        const flashState = flashing.get(r.tikr);

        return (
          <g
            key={r.tikr}
            className="octopus-tile-group"
            data-focused={isFocused || undefined}
            data-pinned={isPinned || undefined}
            data-flash={flashState || undefined}
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => onTileHover(r.tikr, e)}
            onMouseMove={(e) => onTileHover(r.tikr, e)}
            onClick={(e) => onTileClick(r.tikr, e)}
          >
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
                  {shortLabel(label, approxCharFit(r.w, fs))}
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
                {shortLabel(label, approxCharFit(r.w, fs))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
