// Server-only: seeds the mobile UI with the stock universe (stocks only — never holdings).
// Reads the Supabase snapshot directly (the page is already auth-gated by app/m/layout.tsx),
// falling back to the static database.json. Mirrors app/octopus/page.tsx's seed pattern.

import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { getSectorInfo } from "@/lib/sectors";
import { isRemovedStock } from "@/lib/removedStocks";
import staticDb from "@/data/database.json";
import type { MobileStock } from "./types";

interface SnapStock {
  tikr: string;
  official_name?: string;
  sector?: string;
  subsector?: string;
  cmp?: number;
  bear_current?: number;
  base_current?: number;
  bull_current?: number;
  target_1y?: number;
  base_pe?: number;
  base_pb?: number;
  base_evebitda?: number;
  conviction?: number;
  understanding?: number;
  vp?: string;
  sa?: string;
  div_yield?: number;
  in_fno?: string;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function toMobile(s: SnapStock): MobileStock {
  const info = getSectorInfo(s.tikr, { sector: s.sector, subsector: s.subsector });
  return {
    tikr: s.tikr,
    name: s.official_name ?? s.tikr,
    sector: info.sector,
    subsector: info.subsector,
    cmp: num(s.cmp),
    bear: num(s.bear_current),
    base: num(s.base_current),
    bull: num(s.bull_current),
    target1y: num(s.target_1y),
    basePe: num(s.base_pe),
    basePb: num(s.base_pb),
    baseEvEbitda: num(s.base_evebitda),
    conviction: num(s.conviction),
    understanding: num(s.understanding),
    vp: s.vp ?? null,
    sa: s.sa ?? null,
    divYield: num(s.div_yield),
    inFno: (s.in_fno ?? "").toLowerCase() === "yes",
  };
}

async function loadRaw(): Promise<SnapStock[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await getSupabase()
        .from("sync_snapshot")
        .select("stocks")
        .eq("id", 1)
        .single();
      if (!error && data && Array.isArray(data.stocks) && data.stocks.length > 0) {
        const seen = new Set<string>();
        return (data.stocks as SnapStock[]).filter((s) => {
          const k = s.tikr?.toLowerCase();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }
    } catch {
      /* fall through to static */
    }
  }
  return (staticDb.stocks as SnapStock[]) ?? [];
}

/** Full mobile stock universe (removed stocks filtered out). */
export async function loadMobileStocks(): Promise<MobileStock[]> {
  const raw = await loadRaw();
  return raw.filter((s) => !isRemovedStock(s)).map(toMobile);
}

/** Single stock by tikr (case-insensitive), or null. */
export async function loadMobileStock(tikr: string): Promise<MobileStock | null> {
  const all = await loadMobileStocks();
  const key = tikr.toLowerCase();
  return all.find((s) => s.tikr.toLowerCase() === key) ?? null;
}
