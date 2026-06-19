import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { isValidTikr, toStockKey } from "@/lib/noteTypes";

export const dynamic = "force-dynamic";

/**
 * GET /api/notes/follows — the caller's followed stock_keys.
 */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ follows: [], dbConfigured: false });

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("stock_follows")
      .select("stock_key")
      .eq("user_email", email);
    if (error) throw error;
    return NextResponse.json({ follows: (data || []).map((r) => r.stock_key), dbConfigured: true });
  } catch (error: unknown) {
    console.error("[/api/notes/follows GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ follows: [], error: "Query failed" }, { status: 500 });
  }
}

/**
 * POST /api/notes/follows — { tikr, following } follow/unfollow a stock for the caller.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    const { tikr, following } = await req.json();
    if (!isValidTikr(tikr) || typeof following !== "boolean") {
      return NextResponse.json({ error: "tikr and following (boolean) are required" }, { status: 400 });
    }
    const supabase = getSupabase();
    const stock_key = toStockKey(tikr);

    if (following) {
      const { error } = await supabase
        .from("stock_follows")
        .upsert({ user_email: email, stock_key }, { onConflict: "user_email,stock_key" });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("stock_follows")
        .delete()
        .match({ user_email: email, stock_key });
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, stock_key, following });
  } catch (error: unknown) {
    console.error("[/api/notes/follows POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
