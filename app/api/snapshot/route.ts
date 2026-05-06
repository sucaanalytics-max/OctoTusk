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

    // Holdings and F&O positions come from per-day OneDrive exports that can fail
    // transiently on the Vercel side (silent null from readFoPositions/readHoldings
    // collapses to []). A failed read must not destroy yesterday's data, so when the
    // caller sends an empty array for those fields we preserve whatever is in the row.
    // Stocks and ticker_map come from a deterministic full merge and always overwrite.
    const incomingHoldings = Array.isArray(body.holdings) ? body.holdings : [];
    const incomingFo = Array.isArray(body.fo_positions) ? body.fo_positions : [];
    const needsExisting = incomingHoldings.length === 0 || incomingFo.length === 0;

    let existingHoldings: unknown[] = [];
    let existingFo: unknown[] = [];
    if (needsExisting) {
      const { data: existing } = await supabase
        .from("sync_snapshot")
        .select("holdings, fo_positions")
        .eq("id", 1)
        .single();
      if (existing) {
        existingHoldings = Array.isArray(existing.holdings) ? existing.holdings : [];
        existingFo = Array.isArray(existing.fo_positions) ? existing.fo_positions : [];
      }
    }

    const finalHoldings = incomingHoldings.length > 0 ? incomingHoldings : existingHoldings;
    const finalFo = incomingFo.length > 0 ? incomingFo : existingFo;

    if (incomingHoldings.length === 0 && existingHoldings.length > 0) {
      console.warn(`[snapshot] preserved ${existingHoldings.length} holdings — caller sent empty`);
    }
    if (incomingFo.length === 0 && existingFo.length > 0) {
      console.warn(`[snapshot] preserved ${existingFo.length} fo_positions — caller sent empty`);
    }

    const { error } = await supabase
      .from("sync_snapshot")
      .upsert({
        id: 1,
        stocks: body.stocks ?? [],
        holdings: finalHoldings,
        fo_positions: finalFo,
        ticker_map: body.ticker_map ?? {},
        synced_at: new Date().toISOString(),
      });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      saved_at: new Date().toISOString(),
      holdings_count: finalHoldings.length,
      fo_positions_count: finalFo.length,
      preserved_holdings: incomingHoldings.length === 0 && existingHoldings.length > 0,
      preserved_fo_positions: incomingFo.length === 0 && existingFo.length > 0,
    });
  } catch (err) {
    console.error("[snapshot] POST error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
