/**
 * Canonical sector lookup for the Octopus dashboard.
 *
 * Reads the firm's existing `data/sector-mapping.json` (the same source used
 * by scripts/build-sector-csv.ts, scripts/rescan-sectors.ts and the holdings
 * pipeline). Resolves TIKR aliases (e.g. SMARTWORKS -> Smartworks) before
 * looking up sector/subsector.
 *
 * Last data review: see `lastReviewed` field in sector-mapping.json.
 */

import sectorMappingJson from "../data/sector-mapping.json";

interface SectorMapping {
  version: number;
  lastReviewed: string;
  sectorOrder: string[];
  tikrToSector: Record<string, { sector: string; subsector: string }>;
  tikrAlias?: Record<string, string>;
  substantiveNotes?: Record<string, string>;
}

const M = sectorMappingJson as SectorMapping;
const ALIAS = M.tikrAlias ?? {};
const MAP = M.tikrToSector;

export const UNCLASSIFIED = "Unclassified";

export const SECTOR_ORDER: string[] = [...M.sectorOrder, UNCLASSIFIED];

export interface SectorInfo {
  sector: string;
  subsector: string;
}

export function getSectorInfo(tikr: string): SectorInfo {
  const canonical = ALIAS[tikr] ?? tikr;
  const entry = MAP[canonical] ?? MAP[tikr];
  if (!entry) return { sector: UNCLASSIFIED, subsector: "" };
  return { sector: entry.sector || UNCLASSIFIED, subsector: entry.subsector || "" };
}

export function getSector(tikr: string): string {
  return getSectorInfo(tikr).sector;
}

export function sectorMetadata() {
  return { version: M.version, lastReviewed: M.lastReviewed, sectorCount: M.sectorOrder.length };
}
