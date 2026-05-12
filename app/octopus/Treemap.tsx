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

const PADDING_X = 4;
const PADDING_Y = 4;
const LINE_HEIGHT_MULT = 1.18;
const CHAR_ADVANCE = 0.55;

const AREA_HIDE = 1800;
const AREA_SINGLE = 4000;
const AREA_BOTH = 8000;

function fontSizeForArea(area: number): number {
  const s = Math.sqrt(area) / 9;
  return Math.max(10, Math.min(24, s));
}

function fmtPctSigned(p: number | null | undefined): string {
  if (p == null || isNaN(p)) return "";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

function fits(s: string, maxWidth: number, fontSize: number): boolean {
  return s.length * fontSize * CHAR_ADVANCE <= maxWidth;
}

/**
 * Greedy word-wrap for SVG <tspan> rendering.
 *
 * - Splits on whitespace and packs words onto lines that fit `maxWidth`.
 * - If a single word doesn't fit, breaks it at a character boundary.
 * - Truncates the last visible line with "…" if content exceeds `maxLines`.
 */
function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  if (maxLines <= 0) return [];
  if (fits(text, maxWidth, fontSize)) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const trial = current ? `${current} ${word}` : word;
    if (fits(trial, maxWidth, fontSize)) {
      current = trial;
    } else {
      if (current) {
        lines.push(current);
        if (lines.length >= maxLines) break;
        current = "";
      }
      if (fits(word, maxWidth, fontSize)) {
        current = word;
      } else {
        // Character-break a single word that exceeds the line.
        let buf = "";
        for (const ch of word) {
          if (fits(buf + ch, maxWidth, fontSize)) {
            buf += ch;
          } else {
            lines.push(buf);
            if (lines.length >= maxLines) break;
            buf = ch;
          }
        }
        if (lines.length < maxLines && buf) current = buf;
      }
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  // Did we run out of room? Truncate the last visible line.
  if (lines.length === maxLines) {
    // Reconstruct the rendered portion and the remainder.
    const rendered = lines.join(" ");
    if (rendered.length < text.length - 2) {
      const last = lines[maxLines - 1];
      // Trim characters until "…" fits.
      let trimmed = last;
      while (trimmed.length > 0 && !fits(trimmed + "…", maxWidth, fontSize)) {
        trimmed = trimmed.slice(0, -1);
      }
      lines[maxLines - 1] = (trimmed || last.slice(0, 1)) + "…";
    }
  }
  return lines;
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
        const labelFontSize = Math.min(14, Math.max(8, sr.h / 48));
        const meanLabel = fmtPctSigned(sr.meanDayPct);
        const meanColorClass =
          sr.meanDayPct == null
            ? "ox-cluster-mean-flat"
            : sr.meanDayPct > 0
            ? "ox-cluster-mean-pos"
            : sr.meanDayPct < 0
            ? "ox-cluster-mean-neg"
            : "ox-cluster-mean-flat";
        const showHeader = sr.h > 50 && sr.w > 90;
        return (
          <g key={`sec-${sr.cluster}`} pointerEvents="none">
            <rect
              x={sr.x}
              y={sr.y}
              width={sr.w}
              height={sr.h}
              fill="transparent"
              stroke="rgba(27,36,52,0.05)"
              strokeWidth={1}
            />
            {showHeader && (
              <>
                <text
                  className="ox-cluster-label"
                  x={sr.x + 8}
                  y={sr.y + 14}
                  fontSize={labelFontSize}
                >
                  {sr.cluster}
                </text>
                {meanLabel && sr.w > 160 && (
                  <text
                    className={`ox-cluster-mean ${meanColorClass}`}
                    x={sr.x + sr.w - 8}
                    y={sr.y + 14}
                    fontSize={labelFontSize}
                    textAnchor="end"
                  >
                    {meanLabel}
                  </text>
                )}
                {sr.h > 80 && (
                  <line
                    x1={sr.x + 8}
                    x2={sr.x + sr.w - 8}
                    y1={sr.y + 20}
                    y2={sr.y + 20}
                    stroke="rgba(27,36,52,0.08)"
                    strokeWidth={1}
                  />
                )}
              </>
            )}
          </g>
        );
      })}
      {renderRects.map((r: OctopusRect) => {
        const area = r.w * r.h;
        const fill = heatmapColor(r.dayPct ?? null, "octopusDay");
        const isFocused = focusedTikr === r.tikr || pinnedTikr === r.tikr;
        const isPinned = pinnedTikr === r.tikr;
        const flashState = flashing.get(r.tikr);
        const label = displayName(r.tikr, r.name);

        // Tile content tier: hide entirely on the smallest tiles.
        const showAny = area >= AREA_HIDE;
        const showBoth = area >= AREA_BOTH;
        const allowWrap = area >= AREA_SINGLE;

        const fs = fontSizeForArea(area);
        const lineHeight = fs * LINE_HEIGHT_MULT;
        const innerW = Math.max(r.w - PADDING_X * 2, 4);
        const innerH = Math.max(r.h - PADDING_Y * 2, 4);

        // How many lines can fit, reserving one for day-% if applicable.
        const maxLinesAvailable = Math.max(1, Math.floor(innerH / lineHeight));
        const reservedForPct = showBoth ? 1 : 0;
        const maxNameLines = Math.max(1, maxLinesAvailable - reservedForPct);

        const nameLines: string[] = showAny
          ? allowWrap
            ? wrapText(label, innerW, fs, Math.min(maxNameLines, 3))
            : wrapText(label, innerW, fs, 1)
          : [];

        const totalLines = nameLines.length + reservedForPct;
        const stackHeight = totalLines * lineHeight;
        const startY = r.y + r.h / 2 - stackHeight / 2 + fs * 0.78;

        return (
          <g
            key={r.tikr}
            className="octopus-tile-group"
            data-focused={isFocused || undefined}
            data-pinned={isPinned || undefined}
            data-flash={flashState || undefined}
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
            {showAny && nameLines.length > 0 && (
              <text
                className="octopus-tile-text"
                x={r.x + r.w / 2}
                y={startY}
                fontSize={fs}
                textAnchor="middle"
              >
                {nameLines.map((line, i) => (
                  <tspan key={i} x={r.x + r.w / 2} dy={i === 0 ? 0 : lineHeight}>
                    {line}
                  </tspan>
                ))}
              </text>
            )}
            {showBoth && (
              <text
                className="octopus-tile-text-pct"
                x={r.x + r.w / 2}
                y={startY + nameLines.length * lineHeight}
                fontSize={fs * 0.85}
                textAnchor="middle"
              >
                {fmtPctSigned(r.dayPct)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
