"use client";

import { useMemo } from "react";
import { displayName } from "@/lib/displayName";
import { heatmapColor, defaultClusterKey } from "@/lib/treemap";
import type { PreviewStock } from "./GridView";

interface Props {
  stocks: PreviewStock[];
  focusedTikr: string | null;
  pinnedTikr: string | null;
  onTileHover: (tikr: string | null, e?: React.MouseEvent) => void;
  onTileClick: (tikr: string, e: React.MouseEvent) => void;
}

const VIEW_W = 1600;
const VIEW_H = 900;
const CLUSTER_GAP = 18;
const CLUSTER_PAD = 14;
const HEX_GAP = 2;

interface HexCell {
  stock: PreviewStock;
  cx: number;
  cy: number;
}

interface ClusterLayout {
  cluster: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hexes: HexCell[];
  meanDayPct: number | null;
}

/** Flat-top hex geometry given the in-circle radius (R). */
function hexPoints(cx: number, cy: number, R: number): string {
  const W = R * 2;
  const Hh = R * Math.sqrt(3);
  const half = W / 2;
  const quart = W / 4;
  return [
    [cx - quart, cy - Hh / 2],
    [cx + quart, cy - Hh / 2],
    [cx + half, cy],
    [cx + quart, cy + Hh / 2],
    [cx - quart, cy + Hh / 2],
    [cx - half, cy],
  ]
    .map((p) => p.join(","))
    .join(" ");
}

/**
 * Pack hexagons (flat-top) into a rect of given size; returns positions
 * relative to (0,0). For n hexes choose cols × rows that minimize wasted
 * cells while keeping each cell large.
 */
function packHexCluster(n: number, maxW: number, maxH: number) {
  // Try col counts 1..ceil(n). For each, compute hex size that fits.
  // Flat-top hex: width = 2R, height = R*sqrt(3). Row stride = R * 1.5.
  let best = { R: 0, cols: 1, rows: n, totalW: 0, totalH: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    // Width: first col contributes 2R; each subsequent col adds 1.5R; plus stagger half-row.
    // Actually for flat-top: col i is at x = i * 1.5R + R. Total span = (cols - 1) * 1.5R + 2R = 1.5R*cols + 0.5R
    const totalWFor1 = 1.5 * (cols) + 0.5; // in units of R
    // Height: rows + 0.5 (stagger if cols > 1)
    const totalHFor1 = (rows + (cols > 1 ? 0.5 : 0)) * Math.sqrt(3);
    const R_byW = (maxW - HEX_GAP * (cols - 1)) / totalWFor1;
    const R_byH = (maxH - HEX_GAP * (rows - 1)) / totalHFor1;
    const R = Math.max(0, Math.min(R_byW, R_byH));
    if (R > best.R) {
      best = {
        R,
        cols,
        rows,
        totalW: R * totalWFor1 + HEX_GAP * (cols - 1),
        totalH: R * totalHFor1 + HEX_GAP * (rows - 1),
      };
    }
  }
  const positions: { col: number; row: number }[] = [];
  let count = 0;
  outer: for (let col = 0; col < best.cols; col++) {
    for (let row = 0; row < best.rows; row++) {
      if (count >= n) break outer;
      positions.push({ col, row });
      count++;
    }
  }
  return { positions, R: best.R, cols: best.cols, rows: best.rows };
}

function hexPosition(col: number, row: number, R: number) {
  const cx = R + col * (1.5 * R + HEX_GAP);
  const cy = R * Math.sqrt(3) / 2 + row * (R * Math.sqrt(3) + HEX_GAP) + (col % 2 ? R * Math.sqrt(3) / 2 : 0);
  return { cx, cy };
}

/** Shelf-pack cluster rects greedily into the viewport. */
function shelfPack(items: { cluster: string; w: number; h: number; stocks: PreviewStock[]; R: number; positions: { col: number; row: number }[] }[]) {
  const layouts: ClusterLayout[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let shelfHeight = 0;
  for (const it of items) {
    if (cursorX + it.w > VIEW_W) {
      cursorX = 0;
      cursorY += shelfHeight + CLUSTER_GAP;
      shelfHeight = 0;
    }
    const cellX = cursorX + CLUSTER_PAD;
    const cellY = cursorY + CLUSTER_PAD + 18; // 18 reserved for label
    const hexes: HexCell[] = it.positions.map(({ col, row }, i) => {
      const p = hexPosition(col, row, it.R);
      return { stock: it.stocks[i], cx: cellX + p.cx, cy: cellY + p.cy };
    });
    const live = it.stocks.map((s) => s.dayPct).filter((p): p is number => typeof p === "number");
    const meanDayPct = live.length ? live.reduce((a, b) => a + b, 0) / live.length : null;
    layouts.push({
      cluster: it.cluster,
      x: cursorX,
      y: cursorY,
      w: it.w,
      h: it.h,
      hexes,
      meanDayPct,
    });
    cursorX += it.w + CLUSTER_GAP;
    shelfHeight = Math.max(shelfHeight, it.h);
  }
  return layouts;
}

function fmtPctSigned(p: number | null): string {
  if (p == null || !isFinite(p)) return "";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

export function HexView({
  stocks,
  focusedTikr,
  pinnedTikr,
  onTileHover,
  onTileClick,
}: Props) {
  const clusters = useMemo(() => {
    const groups: Record<string, PreviewStock[]> = {};
    for (const s of stocks) {
      const k = defaultClusterKey({
        tikr: s.tikr,
        name: s.name,
        sector: s.sector,
        subsector: s.subsector,
        dayPct: s.dayPct,
      });
      (groups[k] ??= []).push(s);
    }
    return Object.entries(groups)
      .map(([cluster, list]) => ({ cluster, list }))
      .sort((a, b) => b.list.length - a.list.length);
  }, [stocks]);

  const layouts = useMemo(() => {
    // Allocate target area proportional to stock count.
    const totalArea = VIEW_W * VIEW_H * 0.78; // 22% reserved for padding/labels/gaps
    const totalStocks = clusters.reduce((sum, c) => sum + c.list.length, 0);
    const aspect = VIEW_W / VIEW_H;
    const items = clusters.map(({ cluster, list }) => {
      const targetArea = (list.length / totalStocks) * totalArea;
      const w = Math.sqrt(targetArea * aspect);
      const h = w / aspect;
      const innerW = Math.max(40, w - CLUSTER_PAD * 2);
      const innerH = Math.max(40, h - CLUSTER_PAD * 2 - 18);
      const { positions, R, cols, rows } = packHexCluster(list.length, innerW, innerH);
      return {
        cluster,
        stocks: list,
        positions,
        R,
        w: Math.max(120, cols * 1.5 * R + 0.5 * R + CLUSTER_PAD * 2),
        h: Math.max(70, (rows + (cols > 1 ? 0.5 : 0)) * R * Math.sqrt(3) + CLUSTER_PAD * 2 + 18),
      };
    });
    return shelfPack(items);
  }, [clusters]);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Hexagonal hive of stock universe"
      onMouseLeave={() => onTileHover(null)}
      className="ox-hexview"
    >
      {layouts.map((cluster) => {
        const meanCls =
          cluster.meanDayPct == null
            ? "ox-cluster-mean-flat"
            : cluster.meanDayPct > 0
            ? "ox-cluster-mean-pos"
            : cluster.meanDayPct < 0
            ? "ox-cluster-mean-neg"
            : "ox-cluster-mean-flat";
        return (
          <g key={`hex-cluster-${cluster.cluster}`}>
            <text
              className="ox-cluster-label"
              x={cluster.x + CLUSTER_PAD}
              y={cluster.y + 14}
              fontSize={12}
              pointerEvents="none"
            >
              {cluster.cluster}
              {cluster.meanDayPct != null && (
                <tspan className={meanCls} dx={8}>
                  {fmtPctSigned(cluster.meanDayPct)}
                </tspan>
              )}
            </text>
            {cluster.hexes.map(({ stock, cx, cy }) => {
              const isFocused = focusedTikr === stock.tikr || pinnedTikr === stock.tikr;
              const isPinned = pinnedTikr === stock.tikr;
              const fill = heatmapColor(stock.dayPct ?? null, "octopusDay");
              // Find R from cluster's first hex
              const R = cluster.hexes[0]
                ? Math.abs(cluster.hexes[1] ? cluster.hexes[1].cx - cluster.hexes[0].cx : 30)
                : 30;
              const hexR = Math.max(R / 1.5, 12);
              const fs = Math.max(7, Math.min(13, hexR / 2.4));
              const showText = hexR > 18;
              const label = displayName(stock.tikr, stock.name);
              const charBudget = Math.max(3, Math.floor(hexR / (fs * 0.32)));
              const shortName = label.length > charBudget ? label.slice(0, charBudget - 1) + "…" : label;
              return (
                <g
                  key={stock.tikr}
                  className="ox-hex-group"
                  data-focused={isFocused || undefined}
                  data-pinned={isPinned || undefined}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => onTileHover(stock.tikr, e)}
                  onMouseMove={(e) => onTileHover(stock.tikr, e)}
                  onClick={(e) => onTileClick(stock.tikr, e)}
                >
                  <polygon
                    className="ox-hex"
                    points={hexPoints(cx, cy, hexR)}
                    fill={fill}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth={1}
                  />
                  {showText && (
                    <>
                      <text
                        className="octopus-tile-text"
                        x={cx}
                        y={cy - fs * 0.4}
                        fontSize={fs}
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {shortName}
                      </text>
                      <text
                        className="octopus-tile-text-pct"
                        x={cx}
                        y={cy + fs * 0.6}
                        fontSize={fs * 0.82}
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {fmtPctSigned(stock.dayPct)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
