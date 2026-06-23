import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { isAlertMetric, isAlertTargetType, metricNeedsTarget, validateThreshold } from "@/lib/userAlerts";

export const dynamic = "force-dynamic";

type RouteCtx = { params: { id: string } };

/**
 * PATCH /api/user-alerts/:id — edit/toggle the caller's own alert.
 * Owner-scoped (.eq user_email) + 404 on a foreign/missing id — service-role bypasses RLS,
 * so this is the only barrier. Changing the condition (or re-enabling) re-arms the latch.
 */
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const supabase = getSupabase();
    const { data: existing, error: loadErr } = await supabase
      .from("user_alerts")
      .select("metric, target_type, threshold")
      .eq("id", id)
      .eq("user_email", email)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

    const body = await req.json();

    const metric = body?.metric !== undefined ? body.metric : existing.metric;
    if (body?.metric !== undefined && !isAlertMetric(body.metric)) {
      return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
    }

    let targetType = body?.target_type !== undefined ? body.target_type : existing.target_type;
    if (metricNeedsTarget(metric)) {
      if (!isAlertTargetType(targetType)) {
        return NextResponse.json({ error: "target_type is required for target_near" }, { status: 400 });
      }
    } else {
      targetType = null;
    }

    const threshold = body?.threshold !== undefined ? Number(body.threshold) : existing.threshold;
    if (body?.threshold !== undefined || body?.metric !== undefined) {
      const tErr = validateThreshold(metric, threshold);
      if (tErr) return NextResponse.json({ error: tErr }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body?.metric !== undefined) patch.metric = metric;
    if (body?.target_type !== undefined || body?.metric !== undefined) patch.target_type = targetType;
    if (body?.threshold !== undefined) patch.threshold = threshold;
    if (body?.one_shot !== undefined) patch.one_shot = body.one_shot === true;
    if (body?.cooldown_sec !== undefined) {
      patch.cooldown_sec = Math.max(60, Math.floor(Number(body.cooldown_sec) || 3600));
    }
    if (body?.active !== undefined) patch.active = body.active === true;

    // Re-arm the latch on any condition change OR on re-enable.
    const condChanged =
      body?.metric !== undefined || body?.threshold !== undefined || body?.target_type !== undefined;
    if (condChanged || body?.active === true) {
      patch.in_condition = false;
      patch.last_fired_at = null;
    }

    const { data: updated, error: updErr } = await supabase
      .from("user_alerts")
      .update(patch)
      .eq("id", id)
      .eq("user_email", email)
      .select("id")
      .maybeSingle();
    if (updErr) {
      if ((updErr as { code?: string }).code === "23505") {
        return NextResponse.json({ error: "You already have this alert" }, { status: 409 });
      }
      throw updErr;
    }
    if (!updated) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (error: unknown) {
    console.error("[/api/user-alerts/:id PATCH]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/** DELETE /api/user-alerts/:id — delete the caller's own alert (404 on foreign/missing id). */
export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("user_alerts")
      .delete()
      .eq("id", id)
      .eq("user_email", email)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id, deleted: true });
  } catch (error: unknown) {
    console.error("[/api/user-alerts/:id DELETE]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
