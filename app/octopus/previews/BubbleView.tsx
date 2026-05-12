"use client";

import { useMemo } from "react";
import { hierarchy, pack } from "d3-hierarchy";
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

interface PackNode {
  type: "root" | "cluster" | "leaf";
  name: string;
  children?: PackNode[];
  stock?: PreviewStock;
}

const VIEW_W = 1600;
const VIEW_H = 900;

function fmtPctSigned(p: number | null): string {
  if (p == null || !isFinite(p)) return "";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

export function BubbleView({
  stocks,
  focusedTikr,
  pinnedTikr,
  onTileHover,
  onTileClick,
}: Props) {
  const layout = useMemo(() => {
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
    const root: PackNode = {
      type: "root",
      name: "root",
      children: Object.entries(groups).map(([name, list]) => ({
        type: "cluster" as const,
        name,
        children: list.map((s) => ({ type: "leaf" as const, name: s.tikr, stock: s })),
      })),
    };
    const h = hierarchy<PackNode>(root).sum((d) => (d.type === "leaf" ? 1 : 0));
    const packed = pack<PackNode>().size([VIEW_W, VIEW_H]).padding((n) => (n.depth === 1 ? 14 : 4))(h);
    return packed;
  }, [stocks]);

  const clusterNodes = layout.descendants().filter((n) => n.depth === 1);
  const leafNodes = layout.descendants().filter((n) => n.depth === 2);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Bubble-packed stock universe"
      onMouseLeave={() => onTileHover(null)}
      className="ox-bubbleview"
    >
      {/* Cluster outlines + labels */}
      {clusterNodes.map((n) => {
        const liveDayPcts = (n.data.children ?? [])
          .map((c) => c.stock?.dayPct ?? null)
          .filter((p): p is number => typeof p === "number");
        const mean = liveDayPcts.length
          ? liveDayPcts.reduce((a, b) => a + b, 0) / liveDayPcts.length
          : null;
        const meanCls =
          mean == null ? "ox-cluster-mean-flat" : mean > 0 ? "ox-cluster-mean-pos" : mean < 0 ? "ox-cluster-mean-neg" : "ox-cluster-mean-flat";
        return (
          <g key={`cluster-${n.data.name}`} pointerEvents="none">
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill="none"
              stroke="rgba(27,36,52,0.08)"
              strokeWidth={1}
            />
            {n.r > 70 && (
              <text
                className="ox-cluster-label"
                x={n.x}
                y={n.y - n.r - 6}
                textAnchor="middle"
                fontSize={Math.min(14, Math.max(9, n.r / 12))}
              >
                {n.data.name}
                {mean != null && (
                  <tspan className={meanCls} dx={8}>
                    {fmtPctSigned(mean)}
                  </tspan>
                )}
              </text>
            )}
          </g>
        );
      })}

      {/* Leaf stock bubbles */}
      {leafNodes.map((n) => {
        const s = n.data.stock!;
        const isFocused = focusedTikr === s.tikr || pinnedTikr === s.tikr;
        const isPinned = pinnedTikr === s.tikr;
        const fill = heatmapColor(s.dayPct ?? null, "octopusDay");
        const showText = n.r >= 22;
        const showPct = n.r >= 32;
        const fs = Math.max(8, Math.min(16, n.r / 3));
        const label = displayName(s.tikr, s.name);
        const charBudget = Math.max(2, Math.floor((n.r * 1.7) / (fs * 0.55)));
        const shortName = label.length > charBudget ? label.slice(0, charBudget - 1) + "…" : label;
        return (
          <g
            key={s.tikr}
            className="ox-bubble-group"
            data-focused={isFocused || undefined}
            data-pinned={isPinned || undefined}
            onMouseEnter={(e) => onTileHover(s.tikr, e)}
            onMouseMove={(e) => onTileHover(s.tikr, e)}
            onClick={(e) => onTileClick(s.tikr, e)}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={fill}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1}
              className="ox-bubble"
            />
            {showText && (
              <text
                className="octopus-tile-text"
                x={n.x}
                y={showPct ? n.y - fs * 0.4 : n.y}
                fontSize={fs}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {shortName}
              </text>
            )}
            {showPct && (
              <text
                className="octopus-tile-text-pct"
                x={n.x}
                y={n.y + fs * 0.65}
                fontSize={fs * 0.85}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {fmtPctSigned(s.dayPct)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
