import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/db/setup — Health check + seed empty rows if needed.
 * Tables are managed via Supabase dashboard/migrations now.
 */
export async function GET() {
  return POST();
}

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to env." },
      { status: 503 }
    );
  }

  try {
    const supabase = getSupabase();

    // Seed zone_snapshot with empty row if not exists
    const { error: zoneErr } = await supabase
      .from("zone_snapshot")
      .upsert({ id: 1, zones: {}, updated_at: new Date().toISOString() }, { onConflict: "id", ignoreDuplicates: true });

    if (zoneErr) {
      console.warn("[db/setup] zone_snapshot seed warning:", zoneErr.message);
    }

    // Verify sync_snapshot table is accessible
    const { error: snapErr } = await supabase
      .from("sync_snapshot")
      .select("id")
      .eq("id", 1)
      .maybeSingle();

    if (snapErr) {
      throw new Error(`sync_snapshot check failed: ${snapErr.message}`);
    }

    return NextResponse.json({ ok: true, message: "Supabase connection verified" });
  } catch (error: unknown) {
    console.error("[/api/db/setup]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Setup failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
