import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe — store/refresh this device's push subscription, bound to the
 * authenticated user. `endpoint` is the upsert key (a device re-subscribing replaces its row).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    const { subscription, userAgent } = await req.json();
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const authKey = subscription?.keys?.auth;
    if (typeof endpoint !== "string" || !p256dh || !authKey) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_email: email,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: typeof userAgent === "string" ? userAgent.slice(0, 300) : null,
        last_seen: new Date().toISOString(),
        failed_count: 0,
      },
      { onConflict: "endpoint" }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("[/api/push/subscribe]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Subscribe failed" }, { status: 500 });
  }
}
