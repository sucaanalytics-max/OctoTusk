import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Client-facing columns only — never user_email (every returned row is already the caller's own).
const COLUMNS = "id, kind, title, body, url, stock_key, ref_id, read_at, created_at";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** GET /api/notifications — the caller's own inbox (owner-scoped). ?unread=1, ?limit (1..200). */
export async function GET(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ notifications: [], unreadCount: 0, dbConfigured: false });
  }

  const sp = req.nextUrl.searchParams;
  const unreadOnly = sp.get("unread") === "1";
  const limParam = Number(sp.get("limit"));
  const limit = Number.isFinite(limParam)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limParam)))
    : DEFAULT_LIMIT;

  try {
    const supabase = getSupabase();
    let q = supabase
      .from("notifications")
      .select(COLUMNS)
      .eq("user_email", email)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (unreadOnly) q = q.is("read_at", null);
    const { data, error } = await q;
    if (error) throw error;

    const { count, error: cErr } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email)
      .is("read_at", null);
    if (cErr) throw cErr;

    return NextResponse.json({ notifications: data || [], unreadCount: count ?? 0, dbConfigured: true });
  } catch (error: unknown) {
    console.error("[/api/notifications GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ notifications: [], unreadCount: 0, error: "Query failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications — mark read. Body `{ all: true }` marks all the caller's unread as read;
 * body `{ id }` marks one (owner-scoped: `.eq("id").eq("user_email")` → 404 on a foreign/missing id).
 * There is no client create path — notification rows are written server-side only.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    if (body?.all === true) {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("user_email", email)
        .is("read_at", null);
      if (error) throw error;
      return NextResponse.json({ ok: true, all: true });
    }

    const id = Number(body?.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    // Owner-scoped: a foreign/missing id matches no row → 404 (never confirms existence).
    const { data, error } = await supabase
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("id", id)
      .eq("user_email", email)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (error: unknown) {
    console.error("[/api/notifications PATCH]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
