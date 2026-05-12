/**
 * Squarified treemap layout and red→grey→green heatmap coloring.
 *
 * Extracted from app/dashboard/DashboardClient.tsx so the Octopus full-screen
 * dashboard and the existing /dashboard tab can share the same algorithm.
 */

export interface TreeRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
}

export interface TreeItem {
  id: string;
  value: number;
}

export function squarify(
  items: TreeItem[],
  container: { x: number; y: number; w: number; h: number }
): TreeRect[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const totalValue = sorted.reduce((s, i) => s + i.value, 0);
  if (totalValue <= 0) return [];
  const result: TreeRect[] = [];
  let cx = container.x;
  let cy = container.y;
  let cw = container.w;
  let ch = container.h;
  let remaining = totalValue;

  const worstRatio = (row: TreeItem[], rowTotal: number, side: number, span: number): number => {
    let worst = 0;
    for (const it of row) {
      const d = (it.value / rowTotal) * side;
      if (d > 0 && span > 0) worst = Math.max(worst, Math.max(span / d, d / span));
      else worst = Infinity;
    }
    return worst;
  };

  const layoutRow = (row: TreeItem[], rowTotal: number) => {
    const isVert = cw >= ch;
    const span = remaining > 0 ? (rowTotal / remaining) * (isVert ? cw : ch) : 0;
    const side = isVert ? ch : cw;
    let off = 0;
    for (const item of row) {
      const frac = item.value / rowTotal;
      const d = frac * side;
      if (isVert) {
        result.push({ id: item.id, x: cx, y: cy + off, w: span, h: d, value: item.value });
        off += d;
      } else {
        result.push({ id: item.id, x: cx + off, y: cy, w: d, h: span, value: item.value });
        off += d;
      }
    }
    if (isVert) { cx += span; cw -= span; } else { cy += span; ch -= span; }
    remaining -= rowTotal;
  };

  let idx = 0;
  while (idx < sorted.length && cw > 0.1 && ch > 0.1) {
    const isVert = cw >= ch;
    const side = isVert ? ch : cw;
    let row: TreeItem[] = [];
    let rowTotal = 0;
    let bestWorst = Infinity;

    while (idx < sorted.length) {
      const c = sorted[idx];
      const nt = rowTotal + c.value;
      const span = remaining > 0 ? (nt / remaining) * (isVert ? cw : ch) : 0;
      if (span <= 0) { idx++; continue; }
      const w = worstRatio([...row, c], nt, side, span);
      if (row.length > 0 && w > bestWorst) break;
      row.push(c); rowTotal = nt; bestWorst = w; idx++;
    }
    if (row.length > 0) layoutRow(row, rowTotal);
  }
  return result;
}

/**
 * Red→grey→green heatmap fill.
 *
 * Modes:
 *  - "dayChange": ±3% range, value is already in percent units (e.g. 1.2 = +1.2%)
 *  - "upsideBase" | "upsideBear" | "upsideBull" | "pnl": ±30% range, value is fractional (e.g. 0.12 = +12%)
 *  - "conviction": discrete blues for 1-5
 *  - "octopusDay": ±5% range (wall display — wider so volatile days don't saturate)
 */
export function heatmapColor(value: number | null | undefined, mode: string): string {
  if (value == null || isNaN(value)) return "rgb(45, 48, 55)";
  if (mode === "conviction") {
    const v = Math.max(1, Math.min(5, value));
    const blues: Record<number, string> = {
      5: "rgb(37, 99, 235)",
      4: "rgb(59, 130, 246)",
      3: "rgb(96, 165, 250)",
      2: "rgb(71, 85, 105)",
      1: "rgb(100, 116, 139)",
    };
    return blues[Math.round(v)] || "rgb(45, 48, 55)";
  }
  const range =
    mode === "octopusDay" ? 5 :
    (mode === "upsideBase" || mode === "upsideBear" || mode === "upsideBull" || mode === "pnl") ? 30 :
    3;
  const pct =
    (mode === "upsideBase" || mode === "upsideBear" || mode === "upsideBull" || mode === "pnl")
      ? value * 100
      : value;
  const t = Math.max(-1, Math.min(1, pct / range));
  if (t >= 0) {
    const r = Math.round(45 + (20 - 45) * t);
    const g = Math.round(48 + (170 - 48) * t);
    const b = Math.round(55 + (70 - 55) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const at = -t;
    const r = Math.round(45 + (210 - 45) * at);
    const g = Math.round(48 + (35 - 48) * at);
    const b = Math.round(55 + (35 - 55) * at);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Equal-area, sector-clustered treemap for the Octopus wall display.
 *
 * Every stock gets the same area; sector cluster size is proportional to
 * the number of stocks in that sector. Returns sector wrapper rects plus
 * stock leaf rects, in a single 1600×900 viewBox.
 */
export interface OctopusInput {
  tikr: string;
  name: string;
  sector: string;
  dayPct: number | null;
}

export interface OctopusRect extends TreeRect {
  tikr: string;
  name: string;
  sector: string;
  dayPct: number | null;
}

export interface OctopusSectorRect extends TreeRect {
  sector: string;
}

export interface OctopusLayout {
  W: number;
  H: number;
  sectorRects: OctopusSectorRect[];
  stockRects: OctopusRect[];
}

const OCTOPUS_VIEWBOX_W = 1600;
const OCTOPUS_VIEWBOX_H = 900;
const SECTOR_OUTER_PAD = 4;
const SECTOR_LABEL_PAD = 26;
const TILE_INNER_PAD = 2;

export function computeOctopusLayout(
  stocks: OctopusInput[],
  opts: { W?: number; H?: number } = {}
): OctopusLayout {
  const W = opts.W ?? OCTOPUS_VIEWBOX_W;
  const H = opts.H ?? OCTOPUS_VIEWBOX_H;
  if (!stocks.length) return { W, H, sectorRects: [], stockRects: [] };

  const groups: Record<string, OctopusInput[]> = {};
  for (const s of stocks) {
    const k = s.sector || "Unclassified";
    (groups[k] ||= []).push(s);
  }

  const sectorItems: TreeItem[] = Object.entries(groups)
    .map(([sec, list]) => ({ id: sec, value: list.length }))
    .sort((a, b) => b.value - a.value);

  const sectorRects = squarify(sectorItems, { x: 0, y: 0, w: W, h: H });

  const stockRects: OctopusRect[] = [];
  const sectorOut: OctopusSectorRect[] = [];

  for (const sr of sectorRects) {
    sectorOut.push({ ...sr, sector: sr.id });
    const list = groups[sr.id] || [];
    const stockItems: TreeItem[] = list.map((s) => ({ id: s.tikr, value: 1 }));
    const topPad = sr.h > 40 ? SECTOR_LABEL_PAD : SECTOR_OUTER_PAD;
    const inner = {
      x: sr.x + SECTOR_OUTER_PAD,
      y: sr.y + topPad,
      w: Math.max(sr.w - SECTOR_OUTER_PAD * 2, 1),
      h: Math.max(sr.h - topPad - SECTOR_OUTER_PAD, 1),
    };
    const inner_rects = squarify(stockItems, inner);
    for (const r of inner_rects) {
      const s = list.find((x) => x.tikr === r.id);
      if (!s) continue;
      // Apply per-tile inner padding so adjacent tiles read as separate.
      stockRects.push({
        ...r,
        x: r.x + TILE_INNER_PAD / 2,
        y: r.y + TILE_INNER_PAD / 2,
        w: Math.max(r.w - TILE_INNER_PAD, 0.1),
        h: Math.max(r.h - TILE_INNER_PAD, 0.1),
        tikr: s.tikr,
        name: s.name,
        sector: s.sector,
        dayPct: s.dayPct,
      });
    }
  }

  return { W, H, sectorRects: sectorOut, stockRects };
}
