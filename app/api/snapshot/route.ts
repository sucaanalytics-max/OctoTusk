import { NextResponse } from "next/server";
import staticDb from "@/data/database.json";
import { auth } from "@/auth";
import { isDbConfigured, sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/snapshot
 * Returns the last persisted sync snapshot from Supabase.
 * Falls back to database.json if Supabase is not configured or no snapshot exists.
 */
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({
      stocks: staticDb.stocks,
      holdings: staticDb.holdings,
      ticker_map: staticDb.ticker_map,
      source: "static_fallback",
      synced_at: null,
    });
  }

  try {
    const result = await sql`
      SELECT stocks, holdings, ticker_map, synced_at
      FROM sync_snapshot
      WHERE id = 1
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({
        stocks: staticDb.stocks,
        holdings: staticDb.holdings,
        ticker_map: staticDb.ticker_map,
        source: "static_fallback",
        synced_at: null,
      });
    }

    const row = result.rows[0];
    return NextResponse.json({
      stocks: row.stocks,
      holdings: row.holdings,
      ticker_map: row.ticker_map,
      source: "supabase",
      synced_at: row.synced_at,
    });
  } catch (err) {
    console.error("[snapshot] GET error:", err instanceof Error ? err.message : err);
    // Graceful fallback — dashboard never breaks
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

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, reason: "db_not_configured" });
  }

  let body: { stocks?: unknown; holdings?: unknown; ticker_map?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }

  const stocksJson = JSON.stringify(body.stocks ?? []);
  const holdingsJson = JSON.stringify(body.holdings ?? []);
  const tickerMapJson = JSON.stringify(body.ticker_map ?? {});

  try {
    await sql`
      INSERT INTO sync_snapshot (id, stocks, holdings, ticker_map, synced_at)
      VALUES (
        1,
        ${stocksJson}::jsonb,
        ${holdingsJson}::jsonb,
        ${tickerMapJson}::jsonb,
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        stocks      = EXCLUDED.stocks,
        holdings    = EXCLUDED.holdings,
        ticker_map  = EXCLUDED.ticker_map,
        synced_at   = EXCLUDED.synced_at
    `;

    return NextResponse.json({ ok: true, saved_at: new Date().toISOString() });
  } catch (err) {
    console.error("[snapshot] POST error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
