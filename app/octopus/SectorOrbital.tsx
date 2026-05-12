"use client";

import { useMemo } from "react";
import { defaultClusterKey } from "@/lib/treemap";
import { displayClusterName } from "@/lib/sectors";

export interface OrbitalStock {
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

interface Props {
  stocks: OrbitalStock[];
  onClusterSelect: (cluster: string) => void;
}

// Square viewBox; the wrap centers and meet-fits it.
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const INNER_R = 95;       // hub radius
const MAX_R = 410;        // longest wedge edge
const LABEL_R = 438;      // text radius (just outside MAX_R)
const MAG_FULL = 3;       // ±3% maps to full radius

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  // 0° points up (12 o'clock), increases clockwise.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const startOuter = polar(cx, cy, outerR, startAngle);
  const endOuter = polar(cx, cy, outerR, endAngle);
  const startInner = polar(cx, cy, innerR, endAngle);
  const endInner = polar(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${startOuter.x.toFixed(2)} ${startOuter.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x.toFixed(2)} ${endOuter.y.toFixed(2)}`,
    `L ${startInner.x.toFixed(2)} ${startInner.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${endInner.x.toFixed(2)} ${endInner.y.toFixed(2)}`,
    `Z`,
  ].join(" ");
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function colorFor(mean: number | null): string {
  if (mean == null) return "#8A95A4"; // ink-mute grey for missing data
  const abs = Math.abs(mean);
  if (abs < 0.05) return "#8A95A4"; // ~zero
  const t = Math.min(1, abs / MAG_FULL);
  if (mean > 0) {
    // pale green → deep editorial green
    const r = lerp(122, 21, t);
    const g = lerp(192, 102, t);
    const b = lerp(150, 62, t);
    return `rgb(${r},${g},${b})`;
  }
  // pale red → deep editorial red
  const r = lerp(198, 122, t);
  const g = lerp(120, 36, t);
  const b = lerp(120, 36, t);
  return `rgb(${r},${g},${b})`;
}

function fmtPctSigned(p: number | null, digits = 1): string {
  if (p == null || !isFinite(p)) return "—";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(digits)}%`;
}

function labelAnchorFor(midAngle: number): "start" | "middle" | "end" {
  // 0° = top, 90° = right, 180° = bottom, 270° = left
  if ((midAngle >= 350 || midAngle <= 10) || (midAngle >= 170 && midAngle <= 190)) return "middle";
  return midAngle < 180 ? "start" : "end";
}

function baselineFor(midAngle: number): "middle" | "hanging" | "alphabetic" {
  if (midAngle >= 350 || midAngle <= 10) return "alphabetic"; // text sits above top
  if (midAngle >= 170 && midAngle <= 190) return "hanging";    // text sits below bottom
  return "middle";
}

export function SectorOrbital({ stocks, onClusterSelect }: Props) {
  const data = useMemo(() => {
    const groups: Record<string, OrbitalStock[]> = {};
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
    const clusters = Object.entries(groups)
      .map(([cluster, list]) => {
        const live = list.filter(
          (s): s is OrbitalStock & { dayPct: number } => typeof s.dayPct === "number"
        );
        const mean = live.length
          ? live.reduce((sum, s) => sum + s.dayPct, 0) / live.length
          : null;
        return {
          cluster,
          count: list.length,
          liveCount: live.length,
          upCount: live.filter((s) => s.dayPct > 0).length,
          downCount: live.filter((s) => s.dayPct < 0).length,
          mean,
        };
      })
      .sort((a, b) => a.cluster.localeCompare(b.cluster));
    const allLive = stocks.filter(
      (s): s is OrbitalStock & { dayPct: number } => typeof s.dayPct === "number"
    );
    return {
      clusters,
      total: stocks.length,
      liveCount: allLive.length,
      up: allLive.filter((s) => s.dayPct > 0).length,
      down: allLive.filter((s) => s.dayPct < 0).length,
      universeMean: allLive.length
        ? allLive.reduce((sum, s) => sum + s.dayPct, 0) / allLive.length
        : null,
    };
  }, [stocks]);

  const totalStocks = data.clusters.reduce((sum, c) => sum + c.count, 0) || 1;
  let cumAngle = 0;
  const wedges = data.clusters.map((c) => {
    const span = (c.count / totalStocks) * 360;
    const startAngle = cumAngle;
    const endAngle = cumAngle + span;
    cumAngle = endAngle;
    const midAngle = (startAngle + endAngle) / 2;
    const magnitude = c.mean == null ? 0 : Math.min(1, Math.abs(c.mean) / MAG_FULL);
    // Always reserve at least a small lip so null-data sectors are visible
    const outerR = INNER_R + Math.max(10, (MAX_R - INNER_R) * magnitude);
    const labelPos = polar(CX, CY, LABEL_R, midAngle);
    return {
      cluster: c.cluster,
      label: displayClusterName(c.cluster),
      count: c.count,
      mean: c.mean,
      midAngle,
      span,
      outerR,
      path: arcPath(CX, CY, INNER_R, outerR, startAngle, endAngle),
      color: colorFor(c.mean),
      labelPos,
      labelAnchor: labelAnchorFor(midAngle),
      baseline: baselineFor(midAngle),
    };
  });

  return (
    <div className="ox-orbital-wrap">
      <svg
        className="ox-orbital"
        viewBox={`0 0 ${VB} ${VB}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* magnitude reference rings (1%, 2%, 3%) */}
        {[1, 2, 3].map((m) => (
          <circle
            key={`ring-${m}`}
            cx={CX}
            cy={CY}
            r={INNER_R + (MAX_R - INNER_R) * (m / MAG_FULL)}
            fill="none"
            stroke="rgba(27, 36, 52, 0.10)"
            strokeWidth="1"
            strokeDasharray="2,5"
          />
        ))}

        {/* wedges */}
        {wedges.map((w) => (
          <path
            key={w.cluster}
            d={w.path}
            fill={w.color}
            stroke="#FAF8F4"
            strokeWidth="2"
            strokeLinejoin="round"
            className="ox-orbital-wedge"
            onClick={() => onClusterSelect(w.cluster)}
          />
        ))}

        {/* labels: sector name + mean % stacked, anchored just outside the wedge */}
        {wedges.map((w) => {
          const valueOffset =
            w.baseline === "alphabetic" ? -22 : w.baseline === "hanging" ? 22 : 22;
          return (
            <g key={`l-${w.cluster}`} className="ox-orbital-label-group">
              <text
                x={w.labelPos.x}
                y={w.labelPos.y}
                textAnchor={w.labelAnchor}
                dominantBaseline={w.baseline}
                className="ox-orbital-label"
              >
                {w.label}
              </text>
              <text
                x={w.labelPos.x}
                y={w.labelPos.y + valueOffset}
                textAnchor={w.labelAnchor}
                dominantBaseline={w.baseline}
                className="ox-orbital-label-value"
                data-dir={w.mean == null ? "flat" : w.mean > 0 ? "up" : w.mean < 0 ? "down" : "flat"}
              >
                {fmtPctSigned(w.mean)}
              </text>
            </g>
          );
        })}

        {/* hub */}
        <circle
          cx={CX}
          cy={CY}
          r={INNER_R}
          fill="#FFFFFF"
          stroke="rgba(27, 36, 52, 0.18)"
          strokeWidth="1.5"
        />
        <text
          x={CX}
          y={CY - 30}
          textAnchor="middle"
          dominantBaseline="middle"
          className="ox-orbital-hub-label"
        >
          UNIVERSE
        </text>
        <text
          x={CX}
          y={CY + 4}
          textAnchor="middle"
          dominantBaseline="middle"
          className="ox-orbital-hub-value"
          data-dir={
            data.universeMean == null
              ? "flat"
              : data.universeMean > 0
              ? "up"
              : data.universeMean < 0
              ? "down"
              : "flat"
          }
        >
          {fmtPctSigned(data.universeMean, 2)}
        </text>
        <text
          x={CX}
          y={CY + 42}
          textAnchor="middle"
          dominantBaseline="middle"
          className="ox-orbital-hub-meta"
        >
          {data.total} · {data.up} ↑ · {data.down} ↓
        </text>
      </svg>
    </div>
  );
}
