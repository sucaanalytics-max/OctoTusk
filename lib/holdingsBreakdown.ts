// Pure grouping of holdings into a Sector → Sub-sector tree with subtotals, weights and a
// portfolio total. Single source of truth for the breakdown numbers on both the desktop
// Holdings "Sectors" sub-tab and the mobile Portfolio breakdown view. No React, no quote
// fetching — feed it already-valued holdings.
import { getSectorInfo, SECTOR_ORDER, UNCLASSIFIED } from "@/lib/sectors";

// ── Concentration thresholds ──────────────────────────────────────────────────
/** Single sector ≥ 25% of portfolio → amber ⚠ */
export const SECTOR_CONCENTRATED_PCT = 25;
/** Single sector ≥ 40% of portfolio → red ⚠ Dom. */
export const SECTOR_DOMINANT_PCT = 40;

export interface BreakdownInput {
  assetName: string;
  tikr?: string | null;
  fallbackSector?: string | null;
  fallbackSubsector?: string | null;
  value: number;     // current market value (CMP × qty; snapshot value if unpriced)
  invested: number;  // cost basis
  gain: number;      // unrealised P&L = value − invested
}

export interface BreakdownLine {
  assetName: string;
  tikr: string | null;
  value: number;
  invested: number;
  gain: number;
  gainPct: number | null;  // null when invested <= 0
  weightPct: number;
}
export interface SubSectorGroup {
  subsector: string;       // "" rendered as "Other" by the UI
  value: number; invested: number; gain: number; gainPct: number | null; weightPct: number;
  lines: BreakdownLine[];
}
export interface SectorGroup {
  sector: string;
  value: number; invested: number; gain: number; gainPct: number | null; weightPct: number;
  subsectors: SubSectorGroup[];
}
export interface BreakdownSummary {
  /** Number of sectors whose value > 0 */
  sectorCount: number;
  /** The highest-value sector (sectors[0] after sort), or null if portfolio is empty */
  largestSector: { name: string; weightPct: number } | null;
  /** Sum of weightPct for the first 3 sectors (value-desc, Unclassified last) */
  top3WeightPct: number;
  /** largestSector.weightPct, or 0 when portfolio is empty */
  maxSectorPct: number;
  /** true when maxSectorPct ≥ SECTOR_CONCENTRATED_PCT */
  isConcentrated: boolean;
}

export interface BreakdownResult {
  sectors: SectorGroup[];
  total: { value: number; invested: number; gain: number; gainPct: number | null };
  unclassifiedCount: number;
  summary: BreakdownSummary;
}

const CANONICAL = new Set(SECTOR_ORDER); // SECTOR_ORDER already includes UNCLASSIFIED

const pct = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);
const gainPctOf = (gain: number, invested: number): number | null =>
  invested > 0 ? (gain / invested) * 100 : null;

export function buildHoldingsBreakdown(items: BreakdownInput[]): BreakdownResult {
  const resolved = items.map((it) => {
    const info = getSectorInfo(it.tikr ?? "", {
      sector: it.fallbackSector ?? null,
      subsector: it.fallbackSubsector ?? null,
    });
    // Canonical guard: a loose fallback sector (e.g. "BFSI") that isn't a real top-level
    // sector must never appear as a phantom bucket — force it into Unclassified.
    const sector = CANONICAL.has(info.sector) ? info.sector : UNCLASSIFIED;
    const subsector = sector === UNCLASSIFIED ? "" : info.subsector;
    return { sector, subsector, in: it };
  });

  const totalValue = resolved.reduce((s, r) => s + r.in.value, 0);
  const totalInvested = resolved.reduce((s, r) => s + r.in.invested, 0);
  const totalGain = totalValue - totalInvested;
  const unclassifiedCount = resolved.filter((r) => r.sector === UNCLASSIFIED).length;

  const sectorMap = new Map<string, Map<string, BreakdownLine[]>>();
  for (const r of resolved) {
    if (!sectorMap.has(r.sector)) sectorMap.set(r.sector, new Map());
    const subMap = sectorMap.get(r.sector)!;
    if (!subMap.has(r.subsector)) subMap.set(r.subsector, []);
    subMap.get(r.subsector)!.push({
      assetName: r.in.assetName,
      tikr: r.in.tikr ?? null,
      value: r.in.value,
      invested: r.in.invested,
      gain: r.in.gain,
      gainPct: gainPctOf(r.in.gain, r.in.invested),
      weightPct: pct(r.in.value, totalValue),
    });
  }

  const sectors: SectorGroup[] = [];
  for (const [sector, subMap] of Array.from(sectorMap)) {
    const subsectors: SubSectorGroup[] = [];
    for (const [subsector, lines] of Array.from(subMap)) {
      lines.sort((a: BreakdownLine, b: BreakdownLine) => b.value - a.value || a.assetName.localeCompare(b.assetName));
      const value = lines.reduce((s: number, l: BreakdownLine) => s + l.value, 0);
      const invested = lines.reduce((s: number, l: BreakdownLine) => s + l.invested, 0);
      const gain = value - invested;
      subsectors.push({ subsector, value, invested, gain, gainPct: gainPctOf(gain, invested), weightPct: pct(value, totalValue), lines });
    }
    subsectors.sort((a: SubSectorGroup, b: SubSectorGroup) => b.value - a.value || a.subsector.localeCompare(b.subsector));
    const value = subsectors.reduce((s: number, x: SubSectorGroup) => s + x.value, 0);
    const invested = subsectors.reduce((s: number, x: SubSectorGroup) => s + x.invested, 0);
    const gain = value - invested;
    sectors.push({ sector, value, invested, gain, gainPct: gainPctOf(gain, invested), weightPct: pct(value, totalValue), subsectors });
  }

  // Value desc, but Unclassified always last.
  sectors.sort((a, b) => {
    if (a.sector === UNCLASSIFIED) return 1;
    if (b.sector === UNCLASSIFIED) return -1;
    return b.value - a.value || a.sector.localeCompare(b.sector);
  });

  // ── Summary — computed from already-sorted sectors ──────────────────────────
  const positiveSectors = sectors.filter((s) => s.value > 0);
  const sectorCount = positiveSectors.length;
  const top = sectors.length > 0 && sectors[0].value > 0 ? sectors[0] : null;
  const largestSector = top ? { name: top.sector, weightPct: top.weightPct } : null;
  const maxSectorPct = largestSector ? largestSector.weightPct : 0;
  const top3WeightPct = sectors.slice(0, 3).reduce((s, x) => s + x.weightPct, 0);
  const summary: BreakdownSummary = {
    sectorCount,
    largestSector,
    top3WeightPct,
    maxSectorPct,
    isConcentrated: maxSectorPct >= SECTOR_CONCENTRATED_PCT,
  };

  return {
    sectors,
    total: { value: totalValue, invested: totalInvested, gain: totalGain, gainPct: gainPctOf(totalGain, totalInvested) },
    unclassifiedCount,
    summary,
  };
}

// ── Composition grouping ──────────────────────────────────────────────────────

export interface CompositionSlice {
  key: string;
  value: number;
  weightPct: number;
  isOther: boolean;
}

/**
 * Returns the top-N sectors as composition slices, plus (if any tail exists with
 * summed value > 0) a single synthesised "Other" slice. Used by the donut (desktop)
 * and stacked bar (mobile) charts. Color assignment is left to each renderer.
 */
export function topSectorsWithOther(sectors: SectorGroup[], n = 6): CompositionSlice[] {
  const head = sectors.slice(0, n);
  const tail = sectors.slice(n);

  const slices: CompositionSlice[] = head.map((s) => ({
    key: s.sector,
    value: s.value,
    weightPct: s.weightPct,
    isOther: false,
  }));

  const tailValue = tail.reduce((s, x) => s + x.value, 0);
  if (tailValue > 0) {
    const tailWeightPct = tail.reduce((s, x) => s + x.weightPct, 0);
    slices.push({ key: "Other", value: tailValue, weightPct: tailWeightPct, isOther: true });
  }

  return slices;
}
