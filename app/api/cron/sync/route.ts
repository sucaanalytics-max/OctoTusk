import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured, sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/sync — Vercel Cron handler
 *
 * Triggers a baseline sync (JVB Output + live holdings from OneDrive)
 * and persists the result to Supabase sync_snapshot.
 *
 * Secured via CRON_SECRET env var (Vercel sends this automatically
 * as x-vercel-cron-signature for cron jobs, we also check our own secret).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/sync] CRON_SECRET env var not set");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }

  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConfigured()) {
    console.error("[cron/sync] DATABASE_URL not set — cannot persist");
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    console.log("[cron/sync] Starting automated baseline sync");

    // Call our own sync endpoint server-to-server with cron secret
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const syncRes = await fetch(`${baseUrl}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
      },
      body: JSON.stringify({ mode: "baseline" }),
    });

    if (!syncRes.ok) {
      const errText = await syncRes.text();
      console.error(`[cron/sync] Sync failed (${syncRes.status}):`, errText);
      return NextResponse.json(
        { error: "Sync request failed", status: syncRes.status },
        { status: 502 }
      );
    }

    const syncData = await syncRes.json();
    console.log(
      `[cron/sync] Baseline returned: ${syncData.stocks?.length ?? 0} stocks, ` +
      `${syncData.holdings?.length ?? 0} holdings (${syncData.holdings_source})`
    );

    // Persist to Supabase sync_snapshot
    const stocksJson = JSON.stringify(syncData.stocks ?? []);
    const holdingsJson = JSON.stringify(syncData.holdings ?? []);
    const tickerMapJson = JSON.stringify(syncData.ticker_map ?? {});

    await sql`
      INSERT INTO sync_snapshot (id, stocks, holdings, ticker_map, synced_at)
      VALUES (1, ${stocksJson}::jsonb, ${holdingsJson}::jsonb, ${tickerMapJson}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET
        stocks     = EXCLUDED.stocks,
        holdings   = EXCLUDED.holdings,
        ticker_map = EXCLUDED.ticker_map,
        synced_at  = EXCLUDED.synced_at
    `;

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
