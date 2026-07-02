// Pure: snapshot row (Supabase sync_snapshot or bundled data/database.json) → CompareStock.
// No network, no monolith import. Keys verified against data/database.json (121 stocks).

import { getSectorInfo } from "@/lib/sectors";
import type { CompareStock } from "./types";

/** Loose shape of a raw snapshot row. Optional everywhere — coverage is uneven across stocks. */
export interface RawSnapshotRow {
  tikr: string;
  official_name?: string | null;
  sector?: string | null;
  subsector?: string | null;
  cmp?: number | null;
  bear_current?: number | null;
  base_current?: number | null;
  bull_current?: number | null;
  target_1y?: number | null;
  target_2y?: number | null;
  upside_bear?: number | null;
  upside_base?: number | null;
  upside_bull?: number | null;
  upside_1y?: number | null;
  upside_2y?: number | null;
  bear_pe?: number | null; base_pe?: number | null; bull_pe?: number | null; base_pe_2sd?: number | null;
  bear_pb?: number | null; base_pb?: number | null; bull_pb?: number | null; base_pb_2sd?: number | null;
  bear_evebitda?: number | null; base_evebitda?: number | null; bull_evebitda?: number | null; base_evebitda_2sd?: number | null;
  conviction?: number | null;
  understanding?: number | null;
  score?: number | null;
  vp?: string | null;
  sa?: string | null;
  div_yield?: number | null;
  in_fno?: boolean;
  last_updated?: string | null;
}

/**
 * Finite & strictly positive, else null. Used for BOTH prices and valuation multiples:
 * the snapshot stores 0 (and sometimes undefined) as a "no-data" sentinel for missing bands
 * (e.g. MCX has base_pe_2sd: 0, base_pb: 0), and a price/PE/PB/EV of 0 is meaningless anyway.
 */
function pos(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** Finite of any sign, else null. For upside fractions, which are legitimately negative. */
function fin(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function buildCompareStock(r: RawSnapshotRow): CompareStock {
  const info = getSectorInfo(r.tikr, { sector: r.sector ?? undefined, subsector: r.subsector ?? undefined });
  return {
    tikr: r.tikr,
    name: r.official_name ?? r.tikr,
    sector: info.sector,
    subsector: info.subsector,
    cmp: pos(r.cmp),
    bear: pos(r.bear_current),
    base: pos(r.base_current),
    bull: pos(r.bull_current),
    target1y: pos(r.target_1y),
    target2y: pos(r.target_2y),
    upsideBear: fin(r.upside_bear),
    upsideBase: fin(r.upside_base),
    upsideBull: fin(r.upside_bull),
    upside1y: fin(r.upside_1y),
    upside2y: fin(r.upside_2y),
    bearPe: pos(r.bear_pe), basePe: pos(r.base_pe), bullPe: pos(r.bull_pe), basePe2sd: pos(r.base_pe_2sd),
    bearPb: pos(r.bear_pb), basePb: pos(r.base_pb), bullPb: pos(r.bull_pb), basePb2sd: pos(r.base_pb_2sd),
    bearEv: pos(r.bear_evebitda), baseEv: pos(r.base_evebitda), bullEv: pos(r.bull_evebitda), baseEv2sd: pos(r.base_evebitda_2sd),
    conviction: fin(r.conviction),
    understanding: fin(r.understanding),
    score: fin(r.score),
    vp: str(r.vp),
    sa: str(r.sa),
    divYield: fin(r.div_yield),
    inFno: r.in_fno === true,
    lastUpdated: r.last_updated ?? null,
  };
}
