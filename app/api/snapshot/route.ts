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
      ticker_map: staticDb.ticker_map,
      source: "static_fallback",
      synced_at: null,
    });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("sync_snapshot")
      .select("stocks, holdings, ticker_map, synced_at")
      .eq("id", 1)
      .single();

    if (error || !data) {
      return NextResponse.json({
        stocks: staticDb.stocks,
        holdings: staticDb.holdings,
        ticker_map: staticDb.ticker_map,
        source: "static_fallback",
        synced_at: null,
      });
    }

    return NextResponse.json({
      stocks: data.stocks,
      holdings: data.holdings,
      ticker_map: data.ticker_map,
      source: "supabase",
      synced_at: data.synced_at,
    });
  } catch (err) {
    console.error("[snapshot] GET error:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      stocks: staticDb.stocks,
      holdings: staticDb.holdings,
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

  let body: { stocks?: unknown; holdings?: unknown; ticker_map?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("sync_snapshot")
      .upsert({
        id: 1,
        stocks: body.stocks ?? [],
        holdings: body.holdings ?? [],
        ticker_map: body.ticker_map ?? {},
        synced_at: new Date().toISOString(),
      });

    if (error) throw error;

    return NextResponse.json({ ok: true, saved_at: new Date().toISOString() });
  } catch (err) {
    console.error("[snapshot] POST error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
