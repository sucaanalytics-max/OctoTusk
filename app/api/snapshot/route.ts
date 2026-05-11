import { NextResponse } from "next/server";
import staticDb from "@/data/database.json";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/snapshot
 * Returns the last persisted sync snapshot from Supabase.
 * Falls back to database.json if Supabase is not configured or no snapshot exists.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      stocks: staticDb.stocks,
      holdings: staticDb.holdings,
      fo_positions: (staticDb as Record<string, unknown>).fo_positions ?? [],
      ticker_map: staticDb.ticker_map,
      source: "static_fallback",
      synced_at: null,
    });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("sync_snapshot")
      .select("stocks, holdings, fo_positions, ticker_map, synced_at")
      .eq("id", 1)
      .single();

    if (error || !data) {
      return NextResponse.json({
        stocks: staticDb.stocks,
        holdings: staticDb.holdings,
        fo_positions: (staticDb as Record<string, unknown>).fo_positions ?? [],
        ticker_map: staticDb.ticker_map,
        source: "static_fallback",
        synced_at: null,
      });
    }

    // Deduplicate stocks by tikr (case-insensitive, keep first) — defensive against buggy syncs
    let stocks = data.stocks;
    if (Array.isArray(stocks)) {
      const seen = new Set<string>();
      stocks = stocks.filter((s: Record<string, unknown>) => {
        const k = (s.tikr as string)?.toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    return NextResponse.json({
      stocks,
      holdings: data.holdings,
      fo_positions: data.fo_positions ?? [],
      ticker_map: data.ticker_map,
      source: "supabase",
      synced_at: data.synced_at,
    });
  } catch (err) {
    console.error("[snapshot] GET error:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      stocks: staticDb.stocks,
      holdings: staticDb.holdings,
      fo_positions: (staticDb as Record<string, unknown>).fo_positions ?? [],
      ticker_map: staticDb.ticker_map,
      source: "static_fallback_error",
      synced_at: null,
    });
  }
}

/**
 * POST /api/snapshot
 * Saves the current synced data to Supabase (called by client after sync completes).
 * Requires authentication.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: "db_not_configured" });
  }

  let body: { stocks?: unknown; holdings?: unknown; fo_positions?: unknown; ticker_map?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }

  try {
    const supabase = getSupabase();

    // Each field is independently preserved when the caller sends empty/missing:
    // - holdings / fo_positions: per-day OneDrive exports can fail transiently;
    //   a failed read must not destroy yesterday's data.
    // - stocks / ticker_map: a partial sync (e.g. holdings-only) omits these
    //   entirely; never wipe the merged JVB+vF result with an empty array.
    // The full-sync caller always sends all four populated, so its behavior is
    // unchanged. Only partial callers benefit.
    const incomingStocks    = Array.isArray(body.stocks)       ? body.stocks       : [];
    const incomingHoldings  = Array.isArray(body.holdings)     ? body.holdings     : [];
    const incomingFo        = Array.isArray(body.fo_positions) ? body.fo_positions : [];
    const incomingTickerMap = (body.ticker_map && typeof body.ticker_map === "object" && !Array.isArray(body.ticker_map))
      ? body.ticker_map as Record<string, unknown>
      : {};

    const needsExisting =
      incomingStocks.length === 0 ||
      incomingHoldings.length === 0 ||
      incomingFo.length === 0 ||
      Object.keys(incomingTickerMap).length === 0;

    let existingStocks: unknown[] = [];
    let existingHoldings: unknown[] = [];
    let existingFo: unknown[] = [];
    let existingTickerMap: Record<string, unknown> = {};
    if (needsExisting) {
      const { data: existing } = await supabase
        .from("sync_snapshot")
        .select("stocks, holdings, fo_positions, ticker_map")
        .eq("id", 1)
        .single();
      if (existing) {
        existingStocks    = Array.isArray(existing.stocks)       ? existing.stocks       : [];
        existingHoldings  = Array.isArray(existing.holdings)     ? existing.holdings     : [];
        existingFo        = Array.isArray(existing.fo_positions) ? existing.fo_positions : [];
        existingTickerMap = (existing.ticker_map && typeof existing.ticker_map === "object" && !Array.isArray(existing.ticker_map))
          ? existing.ticker_map as Record<string, unknown>
          : {};
      }
    }

    const finalStocks    = incomingStocks.length > 0    ? incomingStocks    : existingStocks;
    const finalHoldings  = incomingHoldings.length > 0  ? incomingHoldings  : existingHoldings;
    const finalFo        = incomingFo.length > 0        ? incomingFo        : existingFo;
    const finalTickerMap = Object.keys(incomingTickerMap).length > 0 ? incomingTickerMap : existingTickerMap;

    const preservedStocks    = incomingStocks.length === 0    && existingStocks.length > 0;
    const preservedHoldings  = incomingHoldings.length === 0  && existingHoldings.length > 0;
    const preservedFo        = incomingFo.length === 0        && existingFo.length > 0;
    const preservedTickerMap = Object.keys(incomingTickerMap).length === 0 && Object.keys(existingTickerMap).length > 0;

    if (preservedStocks)    console.warn(`[snapshot] preserved ${existingStocks.length} stocks — caller sent empty`);
    if (preservedHoldings)  console.warn(`[snapshot] preserved ${existingHoldings.length} holdings — caller sent empty`);
    if (preservedFo)        console.warn(`[snapshot] preserved ${existingFo.length} fo_positions — caller sent empty`);
    if (preservedTickerMap) console.warn(`[snapshot] preserved ticker_map (${Object.keys(existingTickerMap).length} entries) — caller sent empty`);

    const { error } = await supabase
      .from("sync_snapshot")
      .upsert({
        id: 1,
        stocks: finalStocks,
        holdings: finalHoldings,
        fo_positions: finalFo,
        ticker_map: finalTickerMap,
        synced_at: new Date().toISOString(),
      });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      saved_at: new Date().toISOString(),
      stocks_count: finalStocks.length,
      holdings_count: finalHoldings.length,
      fo_positions_count: finalFo.length,
      preserved_stocks: preservedStocks,
      preserved_holdings: preservedHoldings,
      preserved_fo_positions: preservedFo,
      preserved_ticker_map: preservedTickerMap,
    });
  } catch (err) {
    console.error("[snapshot] POST error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
