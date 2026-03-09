import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import crypto from "crypto";
import staticDb from "@/data/database.json";
import { isDbConfigured, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/holdings — Session + PIN gated holdings data
 * Requires: (1) authenticated @tuskinvest.com session AND (2) correct PIN
 * PIN hash MUST be set via HOLDINGS_PIN_HASH env var — no hardcoded fallback.
 *
 * Data source priority:
 *   1. Supabase sync_snapshot (fresh synced data)
 *   2. Static database.json fallback (stale)
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expectedHash = process.env.HOLDINGS_PIN_HASH;
  if (!expectedHash) {
    console.error("[/api/holdings] HOLDINGS_PIN_HASH env var is not set — holdings endpoint disabled");
    return NextResponse.json({ error: "Holdings unavailable — contact admin" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { pin } = body;

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN required" }, { status: 401 });
    }

    // Rate limiting is handled by middleware (10 req/min for /api/holdings)
    const pinHash = crypto.createHash("sha256").update(pin).digest("hex");

    if (pinHash !== expectedHash) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
    }

    // Try Supabase snapshot first (fresh synced data), fall back to static JSON
    let holdings: unknown[] = (staticDb as Record<string, unknown>).holdings as unknown[] || [];
    let holdingsDate: string = ((staticDb as Record<string, unknown>).metadata as Record<string, string>)?.holdings_date || "unknown";
    let source = "static";

    if (isDbConfigured()) {
      try {
        const result = await sql`SELECT holdings, synced_at FROM sync_snapshot WHERE id = 1`;
        if (result.rows.length > 0) {
          const row = result.rows[0];
          const snapshotHoldings = row.holdings;
          if (Array.isArray(snapshotHoldings) && snapshotHoldings.length > 0) {
            holdings = snapshotHoldings;
            holdingsDate = (row.synced_at as string) ?? holdingsDate;
            source = "supabase";
          }
        }
      } catch (err) {
        console.warn("[/api/holdings] Snapshot query failed, using static fallback:", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({
      holdings,
      unlocked: true,
      holdingsDate,
      source,
    });
  } catch (error: unknown) {
    console.error("[/api/holdings] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
