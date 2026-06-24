import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { isMarketOpen } from "@/lib/marketHours";
import { sendPushToUsers, isWebPushConfigured } from "@/lib/webpush";
import { fmtRupee } from "@/lib/format";
import { evaluateRule, latchNext, type UserAlert, type RuleInput } from "@/lib/userAlerts";
import { buildQuotesMap } from "../../quotes/route";

// Per-user custom-alert evaluation engine. CRON_SECRET-gated; runs separately from the
// frozen near-target engine (app/api/alerts/check) and writes ONLY to user_alerts.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SnapStock {
  tikr?: string;
  bear_current?: number;
  base_current?: number;
  bull_current?: number;
  target_1y?: number;
}

function humanMetric(a: UserAlert): string {
  switch (a.metric) {
    case "price_above":
      return `crossed above ${fmtRupee(a.threshold, 0)}`;
    case "price_below":
      return `dropped below ${fmtRupee(a.threshold, 0)}`;
    case "target_near":
      return `within ${a.threshold}% of ${a.target_type ?? "target"}`;
    case "upside_above":
      return `base upside ≥ ${a.threshold}%`;
    case "pct_move_abs":
      return `moved ≥ ${a.threshold}% today`;
    default:
      return "condition met";
  }
}

// IST (UTC+5:30) calendar-day comparison for the pct_move_abs 1/day cap.
function firedTodayIST(iso: string | null): boolean {
  if (!iso) return false;
  const istDay = (ms: number) => new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return istDay(new Date(iso).getTime()) === istDay(Date.now());
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && !isMarketOpen()) {
    return NextResponse.json({ ok: true, skipped: "market closed" });
  }

  try {
    const supabase = getSupabase();
    const [alertsRes, snapRes, quotesRes] = await Promise.all([
      supabase.from("user_alerts").select("*").eq("active", true),
      supabase.from("sync_snapshot").select("stocks").eq("id", 1).single(),
      buildQuotesMap(),
    ]);
    if (alertsRes.error) throw alertsRes.error;

    const alerts = (alertsRes.data || []) as UserAlert[];
    const quotes = quotesRes.quotes as Record<string, { price: number; changePct?: number | null }>;
    const stocks = (snapRes.data?.stocks || []) as SnapStock[];

    const targetsByTikr = new Map<
      string,
      { bear?: number | null; base?: number | null; bull?: number | null; target1y?: number | null }
    >();
    for (const s of stocks) {
      if (!s.tikr) continue;
      targetsByTikr.set(s.tikr.toLowerCase(), {
        bear: s.bear_current ?? null,
        base: s.base_current ?? null,
        bull: s.bull_current ?? null,
        target1y: s.target_1y ?? null,
      });
    }

    const pushable = isWebPushConfigured();
    let evaluated = 0;
    let fired = 0;

    for (const a of alerts) {
      const q = quotes[a.original_tikr];
      if (!q || !(q.price > 0)) continue; // unpriced/stale → skip, no state change
      const rule: RuleInput = { metric: a.metric, target_type: a.target_type, threshold: a.threshold };
      const ev = evaluateRule(rule, { price: q.price, changePct: q.changePct ?? null }, targetsByTikr.get(a.original_tikr.toLowerCase()));
      if (!ev) continue; // e.g. target_near with no target
      evaluated++;

      const nextLatch = latchNext(rule, ev, a.in_condition);

      // Fire only on the rising edge, subject to one-shot/cooldown/daily-cap gates.
      const risingEdge = ev.conditionMet && !a.in_condition;
      let gated = false;
      if (risingEdge) {
        if (a.metric === "pct_move_abs" && firedTodayIST(a.last_fired_at)) gated = true;
        if (!a.one_shot && a.last_fired_at) {
          const elapsed = Date.now() - new Date(a.last_fired_at).getTime();
          if (elapsed < a.cooldown_sec * 1000) gated = true;
        }
      }
      const shouldFire = risingEdge && !gated;

      // Persist FIRST (so a failed write never produces an un-recorded push → no double-fire).
      // A GATED rising edge must NOT advance the latch — keep the prior value so the next tick
      // still sees the edge once the gate (cooldown / daily-cap) clears (cooldown = delay, not drop).
      const patch: Record<string, unknown> = {
        in_condition: shouldFire ? true : gated ? a.in_condition : nextLatch,
        updated_at: new Date().toISOString(),
      };
      if (shouldFire) {
        patch.last_fired_at = new Date().toISOString();
        if (a.one_shot) patch.active = false;
      }
      const { error: updErr } = await supabase.from("user_alerts").update(patch).eq("id", a.id);
      if (updErr) {
        console.error("[/api/user-alerts/check] state write failed", a.id, updErr.message);
        continue;
      }

      if (shouldFire && pushable) {
        fired++;
        await sendPushToUsers([a.user_email], {
          title: `${a.stock_name || a.original_tikr} — alert`,
          body: `CMP ${fmtRupee(q.price)} · ${humanMetric(a)}`,
          url: `/m/stock/${encodeURIComponent(a.original_tikr)}`,
          tag: `ua-${a.id}`,
        });
      }
    }

    return NextResponse.json({ ok: true, active: alerts.length, evaluated, fired });
  } catch (error: unknown) {
    console.error("[/api/user-alerts/check]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "check failed" }, { status: 500 });
  }
}
