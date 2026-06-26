// Pure grouping of holdings into a Sector → Sub-sector tree with subtotals, weights and a
// portfolio total. Single source of truth for the breakdown numbers on both the desktop
// Holdings "Sectors" sub-tab and the mobile Portfolio breakdown view. No React, no quote
// fetching — feed it already-valued holdings.
import { getSectorInfo, SECTOR_ORDER, UNCLASSIFIED } from "@/lib/sectors";

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
export interface BreakdownResult {
  sectors: SectorGroup[];
  total: { value: number; invested: number; gain: number; gainPct: number | null };
  unclassifiedCount: number;
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

  return {
    sectors,
    total: { value: totalValue, invested: totalInvested, gain: totalGain, gainPct: gainPctOf(totalGain, totalInvested) },
    unclassifiedCount,
  };
}
