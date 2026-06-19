import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { getRole, canSeeAudit } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * GET /api/notes/audit — CIO only. Soft-deleted notes + recent edit/delete history.
 */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getRole(email);
  if (!canSeeAudit(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ deleted: [], edits: [], dbConfigured: false });
  }

  try {
    const supabase = getSupabase();
    const [deletedRes, editsRes] = await Promise.all([
      supabase
        .from("stock_notes")
        .select("id, stock_key, stock_name, author_email, category, body, visibility, created_at, deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(200),
      supabase
        .from("note_edits")
        .select("id, note_id, editor_email, action, prev_visibility, created_at")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    if (deletedRes.error) throw deletedRes.error;
    if (editsRes.error) throw editsRes.error;

    return NextResponse.json({
      deleted: deletedRes.data || [],
      edits: editsRes.data || [],
      dbConfigured: true,
    });
  } catch (error: unknown) {
    console.error("[/api/notes/audit GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ deleted: [], edits: [], error: "Query failed" }, { status: 500 });
  }
}
