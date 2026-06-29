import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { marketplaceAuthor, type MarketplaceAlert } from "@/lib/marketplace";
import type { AlertMetric, AlertTargetType } from "@/lib/userAlerts";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 500;

// MIN-SAFE PROJECTION — select exactly these columns, NEVER "*" or the user_alerts COLUMNS const.
// `user_email` is selected ONLY to derive the author display name server-side; it is stripped from
// every response object (we build each item explicitly — never spread the row). STATE columns
// (id / active / in_condition / last_fired_at / one_shot / cooldown_sec / updated_at) are never
// selected, so they can never leak. Service-role bypasses RLS, so this projection IS the barrier.
const MARKETPLACE_SELECT =
  "user_email, original_tikr, stock_key, stock_name, metric, target_type, threshold, created_at";

interface Row {
  user_email: string;
  original_tikr: string;
  stock_key: string;
  stock_name: string | null;
  metric: AlertMetric;
  target_type: AlertTargetType | null;
  threshold: number;
  created_at: string;
}

/**
 * GET /api/user-alerts/marketplace — every teammate's ACTIVE alerts as reusable templates
 * (the caller's own are excluded). Team-visible read (any authed @tuskinvest.com user); the
 * caller clones one via the existing POST /api/user-alerts. Filtering/search is done client-side
 * over this capped list, so no user input is ever interpolated into a query.
 */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ items: [], dbConfigured: false });

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("user_alerts")
      .select(MARKETPLACE_SELECT)
      .eq("active", true)
      .neq("user_email", email) // marketplace = teammates' alerts; you already have your own
      .order("created_at", { ascending: false })
      .limit(MAX_ITEMS);
    if (error) throw error;

    const items: MarketplaceAlert[] = ((data as Row[] | null) || []).map((r) => ({
      original_tikr: r.original_tikr,
      stock_key: r.stock_key,
      stock_name: r.stock_name ?? null,
      metric: r.metric,
      target_type: r.target_type ?? null,
      threshold: r.threshold,
      created_at: r.created_at,
      author: marketplaceAuthor(r.user_email),
    }));
    return NextResponse.json({ items, dbConfigured: true });
  } catch (error: unknown) {
    console.error("[/api/user-alerts/marketplace GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ items: [], error: "Query failed" }, { status: 500 });
  }
}
