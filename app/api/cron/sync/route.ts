import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/sync — Vercel Cron handler (kept as backup/manual trigger)
 *
 * Primary sync is now via GitHub Actions (scripts/sync-to-supabase.ts).
 * This route is kept for manual triggering or as a Vercel cron fallback.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    console.log("[cron/sync] Starting automated baseline sync");

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const syncRes = await fetch(`${baseUrl}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
      body: JSON.stringify({ mode: "baseline" }),
    });

    if (!syncRes.ok) {
      const errText = await syncRes.text();
      console.error(`[cron/sync] Sync failed (${syncRes.status}):`, errText);
      return NextResponse.json({ error: "Sync request failed", status: syncRes.status }, { status: 502 });
    }

    const syncData = await syncRes.json();
    console.log(`[cron/sync] Baseline returned: ${syncData.stocks?.length ?? 0} stocks, ${syncData.holdings?.length ?? 0} holdings`);

    // Persist to Supabase via REST API
    const supabase = getSupabase();
    const { error } = await supabase
      .from("sync_snapshot")
      .upsert({
        id: 1,
        stocks: syncData.stocks ?? [],
        holdings: syncData.holdings ?? [],
        ticker_map: syncData.ticker_map ?? {},
        synced_at: new Date().toISOString(),
      });

    if (error) throw error;

    const savedAt = new Date().toISOString();
    console.log(`[cron/sync] Snapshot persisted at ${savedAt}`);

    return NextResponse.json({
      ok: true,
      stocks: syncData.stocks?.length ?? 0,
      holdings: syncData.holdings?.length ?? 0,
      holdings_source: syncData.holdings_source,
      saved_at: savedAt,
    });
  } catch (err) {
    console.error("[cron/sync] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
