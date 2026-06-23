import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { isValidTikr, toStockKey } from "@/lib/noteTypes";
import {
  isAlertMetric,
  isAlertTargetType,
  metricNeedsTarget,
  validateThreshold,
  MAX_ALERTS_PER_USER,
} from "@/lib/userAlerts";

export const dynamic = "force-dynamic";

const COLUMNS =
  "id, user_email, stock_key, original_tikr, stock_name, metric, target_type, threshold, active, one_shot, cooldown_sec, in_condition, last_fired_at, created_at, updated_at";

/** GET /api/user-alerts — the caller's own alerts (owner-scoped). */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ alerts: [], dbConfigured: false });

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("user_alerts")
      .select(COLUMNS)
      .eq("user_email", email)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ alerts: data || [], dbConfigured: true });
  } catch (error: unknown) {
    console.error("[/api/user-alerts GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ alerts: [], error: "Query failed" }, { status: 500 });
  }
}

/** POST /api/user-alerts — create an alert. user_email is server-set, never trusted from the body. */
export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const tikr = body?.tikr;
    const metric = body?.metric;
    const threshold = typeof body?.threshold === "number" ? body.threshold : Number(body?.threshold);
    const oneShot = body?.one_shot !== false; // default true
    const cooldownSec = Number.isFinite(body?.cooldown_sec)
      ? Math.max(60, Math.floor(body.cooldown_sec))
      : 3600;

    if (!isValidTikr(tikr)) {
      return NextResponse.json({ error: "Invalid or missing tikr" }, { status: 400 });
    }
    if (!isAlertMetric(metric)) {
      return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
    }
    const tErr = validateThreshold(metric, threshold);
    if (tErr) return NextResponse.json({ error: tErr }, { status: 400 });

    let targetType: string | null = null;
    if (metricNeedsTarget(metric)) {
      if (!isAlertTargetType(body?.target_type)) {
        return NextResponse.json({ error: "target_type is required for target_near" }, { status: 400 });
      }
      targetType = body.target_type;
    }
    const stockName = typeof body?.stock_name === "string" ? body.stock_name.slice(0, 200) : null;

    const supabase = getSupabase();

    // Per-user cap.
    const { count, error: cErr } = await supabase
      .from("user_alerts")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email);
    if (cErr) throw cErr;
    if ((count ?? 0) >= MAX_ALERTS_PER_USER) {
      return NextResponse.json(
        { error: `Alert limit reached (max ${MAX_ALERTS_PER_USER})` },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("user_alerts")
      .insert({
        user_email: email,
        stock_key: toStockKey(tikr),
        original_tikr: String(tikr).trim(),
        stock_name: stockName,
        metric,
        target_type: targetType,
        threshold,
        one_shot: oneShot,
        cooldown_sec: cooldownSec,
      })
      .select("id, created_at")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json({ error: "You already have this alert" }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at });
  } catch (error: unknown) {
    console.error("[/api/user-alerts POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
}
