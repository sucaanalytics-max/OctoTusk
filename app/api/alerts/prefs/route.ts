import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/alerts/prefs — all per-stock alert preferences.
 * Missing row = enabled (alerts default ON for every covered stock).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ prefs: {}, dbConfigured: false });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("alert_prefs").select("tikr, enabled");
    if (error) throw error;

    const prefs: Record<string, boolean> = {};
    for (const row of data || []) prefs[row.tikr] = row.enabled;

    return NextResponse.json({ prefs, dbConfigured: true });
  } catch (error: unknown) {
    console.error("[/api/alerts/prefs GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ prefs: {}, error: "Query failed" }, { status: 500 });
  }
}

/**
 * POST /api/alerts/prefs — toggle alerts for a stock: { tikr, enabled }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    const { tikr, enabled } = await req.json();

    if (!tikr || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "tikr and enabled (boolean) are required" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9._: -]+$/.test(tikr)) {
      return NextResponse.json({ error: "Invalid tikr format" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from("alert_prefs")
      .upsert({ tikr, enabled, updated_at: new Date().toISOString() }, { onConflict: "tikr" });
    if (error) throw error;

    return NextResponse.json({ ok: true, tikr, enabled });
  } catch (error: unknown) {
    console.error("[/api/alerts/prefs POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Upsert failed" }, { status: 500 });
  }
}
