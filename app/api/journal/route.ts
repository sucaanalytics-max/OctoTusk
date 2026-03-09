import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/journal?tikr=XYZ — Get journal entries for a stock (or all if no tikr)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ entries: [], dbConfigured: false });
  }

  try {
    const supabase = getSupabase();
    const tikr = req.nextUrl.searchParams.get("tikr");
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 500);

    let query = supabase
      .from("decision_journal")
      .select("id, tikr, event_type, zone_name, annotation, cmp_at_event, upside_bear, upside_base, upside_bull, cds_at_event, user_email, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (tikr) {
      query = query.eq("tikr", tikr);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ entries: data || [], dbConfigured: true });
  } catch (error: unknown) {
    console.error("[/api/journal GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ entries: [], error: "Query failed" }, { status: 500 });
  }
}

/**
 * POST /api/journal — Create a journal entry
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
    const body = await req.json();
    const { tikr, event_type, zone_name, annotation, cmp_at_event, upside_bear, upside_base, upside_bull, cds_at_event } = body;

    if (!tikr || !event_type) {
      return NextResponse.json({ error: "tikr and event_type are required" }, { status: 400 });
    }

    const validTypes = ["zone_enter", "zone_exit", "annotation"];
    if (!validTypes.includes(event_type)) {
      return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9._:-]+$/.test(tikr)) {
      return NextResponse.json({ error: "Invalid tikr format" }, { status: 400 });
    }

    const userEmail = session.user.email || "unknown";
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("decision_journal")
      .insert({
        tikr, event_type, zone_name: zone_name || null, annotation: annotation || null,
        cmp_at_event: cmp_at_event || null, upside_bear: upside_bear || null,
        upside_base: upside_base || null, upside_bull: upside_bull || null,
        cds_at_event: cds_at_event || null, user_email: userEmail,
      })
      .select("id, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at });
  } catch (error: unknown) {
    console.error("[/api/journal POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
}
