import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import crypto from "crypto";
import staticDb from "@/data/database.json";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/holdings — Session + PIN gated holdings data
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expectedHash = process.env.HOLDINGS_PIN_HASH;
  if (!expectedHash) {
    console.error("[/api/holdings] HOLDINGS_PIN_HASH env var is not set");
    return NextResponse.json({ error: "Holdings unavailable — contact admin" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { pin } = body;

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN required" }, { status: 401 });
    }

    const pinHash = crypto.createHash("sha256").update(pin).digest("hex");
    if (pinHash !== expectedHash) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
    }

    let holdings: unknown[] = (staticDb as Record<string, unknown>).holdings as unknown[] || [];
    let holdingsDate: string = ((staticDb as Record<string, unknown>).metadata as Record<string, string>)?.holdings_date || "unknown";
    let source = "static";

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("sync_snapshot")
          .select("holdings, synced_at")
          .eq("id", 1)
          .single();

        if (!error && data) {
          const snapshotHoldings = data.holdings;
          if (Array.isArray(snapshotHoldings) && snapshotHoldings.length > 0) {
            holdings = snapshotHoldings;
            holdingsDate = (data.synced_at as string) ?? holdingsDate;
            source = "supabase";
          }
        }
      } catch (err) {
        console.warn("[/api/holdings] Snapshot query failed, using static fallback:", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ holdings, unlocked: true, holdingsDate, source });
  } catch (error: unknown) {
    console.error("[/api/holdings] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
