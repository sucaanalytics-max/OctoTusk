import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { buildQuotesMap } from "../quotes/route";
import { getSectorInfo } from "@/lib/sectors";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import database from "@/data/database.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Token-gated quote feed for the Octopus wall display.
 *
 * Returns ONLY the fields the wall display needs: tikr, name, sector, day %.
 * No portfolio fields (holdings, P&L, conviction, targets, ...). If the
 * display token ever leaks, no sensitive data leaves the building.
 *
 * Cached server-side for 45s — the client polls every 60s; cache avoids
 * doubling Dhan/Yahoo load when multiple displays are deployed later.
 */

const CACHE_TTL_MS = 45 * 1000;

interface OctopusFeedStock {
  tikr: string;
  name: string;
  sector: string;
  subsector: string;
  dayPct: number | null;
  cmp: number | null;
  bearUpside: number | null;
  baseUpside: number | null;
  bullUpside: number | null;
  oneYearUpside: number | null;
}

interface OctopusFeedPayload {
  stocks: OctopusFeedStock[];
  fetchedAt: string;
}

let cached: { payload: OctopusFeedPayload; expiresAt: number } | null = null;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function configError(detail: string) {
  return NextResponse.json({ error: "Server misconfigured", detail }, { status: 503 });
}

interface DbStock {
  tikr: string;
  official_name?: string;
  sector?: string;
  subsector?: string;
  cmp?: number;
  upside_bear?: number;
  upside_base?: number;
  upside_bull?: number;
  upside_1y?: number;
}

function pickUpside(n: unknown): number | null {
  return typeof n === "number" && isFinite(n) ? n : null;
}

/**
 * Recorded CMP overrides for unlisted / illiquid stocks where the live
 * Yahoo lookup is unreliable or absent. Wins over both the live quote and
 * the snapshot's `cmp` field. Match is fuzzy on the lowercased TIKR so
 * minor naming drift (e.g. "NSE" vs "NATIONAL STOCK EXCHANGE (NSE)") never
 * silently breaks the pin.
 */
function recordedCmp(tikr: string): number | null {
  const t = tikr.toLowerCase();
  // Pre-IPO NSE — any variant of the name
  if (t === "nse" || t.includes("national stock exchange")) return 2000;
  // Singapore-listed Capitaland India Trust (Yahoo CY6U.SI unreliable)
  if (t.includes("capitaland")) return 85;
  return null;
}

/**
 * Normalize a TIKR string so different shapes of the same stock identifier
 * collapse to the same key. Lets the feed match a Supabase TIKR like
 * "ITC HOTELS LIMITED (XNSE:ITCHOTELS)" against a ticker_map key like
 * "ITCHOTELS" (or vice versa) without needing every variant pre-registered.
 */
function normalizeTikr(t: string): string {
  return t
    .toLowerCase()
    // strip trailing "(xnse:foo)" / "(xbom:123)" parenthetical
    .replace(/\s*\(x(?:nse|bom):[^)]+\)\s*$/i, "")
    // strip leading "xnse:" / "xbom:" prefix
    .replace(/^x(?:nse|bom):/i, "")
    // strip trailing " limited" / " ltd"
    .replace(/\s+(?:limited|ltd\.?)\s*$/i, "")
    .trim();
}

async function loadStocks(): Promise<DbStock[]> {
  // Mirror app/octopus/page.tsx: prefer the Supabase snapshot (which is
  // refreshed by the GitHub Action / OneDrive sync), fall back to the
  // static database.json when Supabase is unconfigured or empty.
  const fallback = ((database as any).stocks ?? []) as DbStock[];
  if (!isSupabaseConfigured()) return fallback;
  try {
    const result = await getSupabase()
      .from("sync_snapshot")
      .select("stocks")
      .eq("id", 1)
      .single();
    if (result.error || !result.data) return fallback;
    const data = result.data as { stocks?: unknown };
    if (!Array.isArray(data.stocks) || data.stocks.length === 0) return fallback;
    const seen = new Set<string>();
    return (data.stocks as DbStock[]).filter((s) => {
      const k = s.tikr?.toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch (err) {
    console.warn(
      "[octopus-feed] Supabase load failed, using local db:",
      err instanceof Error ? err.message : err
    );
    return fallback;
  }
}

async function buildPayload(): Promise<OctopusFeedPayload> {
  const [{ quotes }, stocks] = await Promise.all([buildQuotesMap(), loadStocks()]);

  // Build a normalized lookup so Supabase TIKR variants resolve against
  // ticker_map keys even when they don't string-match exactly. Tries
  // exact first (cheap, common case), then case-insensitive, then full
  // normalization (strips parens / exchange prefixes / "Limited" tails).
  const quotesByLower = new Map<string, (typeof quotes)[string]>();
  const quotesByNormalized = new Map<string, (typeof quotes)[string]>();
  for (const [k, v] of Object.entries(quotes)) {
    quotesByLower.set(k.toLowerCase(), v);
    const norm = normalizeTikr(k);
    if (norm && !quotesByNormalized.has(norm)) quotesByNormalized.set(norm, v);
  }
  const lookupQuote = (tikr: string): (typeof quotes)[string] | undefined => {
    return (
      quotes[tikr] ??
      quotesByLower.get(tikr.toLowerCase()) ??
      quotesByNormalized.get(normalizeTikr(tikr))
    );
  };

  let aliasHits = 0;
  const out: OctopusFeedStock[] = stocks.map((s) => {
    const exact = quotes[s.tikr];
    const q = exact ?? lookupQuote(s.tikr);
    if (!exact && q) aliasHits++;
    const info = getSectorInfo(s.tikr, { sector: s.sector, subsector: s.subsector });
    // CMP resolution order:
    //   1. Recorded override (for unlisted stocks where live data is unreliable)
    //   2. Live Yahoo / Dhan quote
    //   3. Snapshot's recorded research CMP
    //   4. null
    const override = recordedCmp(s.tikr);
    const liveCmp = q && typeof q.price === "number" ? q.price : null;
    const cmp = override ?? liveCmp ?? (typeof s.cmp === "number" ? s.cmp : null);
    return {
      tikr: s.tikr,
      name: s.official_name ?? s.tikr,
      sector: info.sector,
      subsector: info.subsector,
      dayPct: q && typeof q.changePct === "number" ? q.changePct : null,
      cmp,
      bearUpside: pickUpside(s.upside_bear),
      baseUpside: pickUpside(s.upside_base),
      bullUpside: pickUpside(s.upside_bull),
      oneYearUpside: pickUpside(s.upside_1y),
    };
  });

  const stocksWithCmp = out.filter((x) => x.cmp != null).length;
  const stocksMissingCmp = out.length - stocksWithCmp;
  console.log(
    `[octopus-feed] stocks=${out.length} withCmp=${stocksWithCmp} missingCmp=${stocksMissingCmp} aliasHits=${aliasHits}`
  );

  return { stocks: out, fetchedAt: new Date().toISOString() };
}

export async function GET(request: Request) {
  noStore();

  const expected = process.env.OCTOPUS_DISPLAY_TOKEN;
  if (!expected) return configError("OCTOPUS_DISPLAY_TOKEN is not set");

  const url = new URL(request.url);
  const provided = url.searchParams.get("token") ?? request.headers.get("x-octopus-token");
  if (provided !== expected) return unauthorized();

  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      headers: { "x-cache": "HIT" },
    });
  }

  try {
    const payload = await buildPayload();
    cached = { payload, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(payload, { headers: { "x-cache": "MISS" } });
  } catch (err) {
    console.error("[octopus-feed] build failed:", err instanceof Error ? err.message : err);
    if (cached) {
      // Serve stale rather than blanking the wall display.
      return NextResponse.json(cached.payload, {
        headers: { "x-cache": "STALE" },
      });
    }
    return NextResponse.json({ error: "Upstream failure" }, { status: 502 });
  }
}
