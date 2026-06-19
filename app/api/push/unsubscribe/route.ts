import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/unsubscribe — remove a subscription. Scoped to the caller's own rows.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    const { endpoint } = await req.json();
    if (typeof endpoint !== "string" || !endpoint) {
      return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
    }
    const supabase = getSupabase();
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .match({ user_email: email, endpoint });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("[/api/push/unsubscribe]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unsubscribe failed" }, { status: 500 });
  }
}
