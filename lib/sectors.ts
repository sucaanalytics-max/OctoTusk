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

export function getSectorInfo(
  tikr: string,
  fallback?: { sector?: string | null; subsector?: string | null }
): SectorInfo {
  const canonical = ALIAS[tikr] ?? tikr;
  const entry = MAP[canonical] ?? MAP[tikr];
  if (entry && entry.sector) {
    return { sector: entry.sector, subsector: entry.subsector || fallback?.subsector || "" };
  }
  // Fall back to the snapshot's own sector / subsector, then Unclassified.
  return {
    sector: fallback?.sector?.trim() || UNCLASSIFIED,
    subsector: fallback?.subsector?.trim() || "",
  };
}

export function getSector(
  tikr: string,
  fallback?: { sector?: string | null; subsector?: string | null }
): string {
  return getSectorInfo(tikr, fallback).sector;
}

export function sectorMetadata() {
  return { version: M.version, lastReviewed: M.lastReviewed, sectorCount: M.sectorOrder.length };
}

/**
 * Display-friendly abbreviations for long sector / subsector / cluster names.
 * Applied at render time only — does NOT mutate the source data.
 *
 * Goal: keep titles legible inside a narrow (~220px) card without ellipsis.
 */
const SECTOR_DISPLAY_MAP: Record<string, string> = {
  // Subsectors used as cluster names (Financials split)
  "Private Sector Bank": "Pvt Bank",
  "Public Sector Bank": "PSU Bank",
  "Housing Finance Company": "HFC",
  "Asset Management Company": "AMC",
  "Stockbroking & Allied Services": "Stockbroking",
  "Registrar & Transfer Agent": "Registrar (RTA)",
  "Holding Company (Diversified Financials)": "Diversified Hldg",
  "Specialised Finance — Power": "Power Finance",
  "NBFC (Gold Loan)": "NBFC · Gold Loan",
  "NBFC (Credit Card)": "NBFC · Credit",
  "Power Exchange": "Power Exchange",
  "Commodity Exchange": "Commodity Exch",
  "Stock Exchange": "Stock Exchange",
  "Diversified Financials": "Diversified Fin",
  // Top-level sectors
  "Information Technology": "IT",
  "Fast Moving Consumer Goods": "FMCG",
  "Oil, Gas & Consumable Fuels": "Oil & Gas",
  "Construction Materials": "Constr. Mat.",
  "Media Entertainment & Publication": "Media & Entmt",
};

/**
 * Shorten a cluster name for display (e.g. "FIN · Stockbroking & Allied
 * Services" → "FIN · Stockbroking"). Idempotent and safe on names that
 * have no shorter form.
 */
export function displayClusterName(cluster: string): string {
  // Cluster format: "FIN · <subsector>" or "<sector>"
  const finPrefix = "FIN · ";
  if (cluster.startsWith(finPrefix)) {
    const sub = cluster.slice(finPrefix.length);
    const short = SECTOR_DISPLAY_MAP[sub] ?? sub;
    return `${finPrefix}${short}`;
  }
  return SECTOR_DISPLAY_MAP[cluster] ?? cluster;
}
