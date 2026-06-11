import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { isMarketOpen } from "@/lib/marketHours";
import { isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";
import { getCompanyShort } from "@/lib/companyName";
import { buildQuotesMap } from "../../quotes/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/alerts/check — price-near-target alert engine.
 *
 * Called every 15 min during market hours by GitHub Actions
 * (.github/workflows/price-alerts.yml) with `Authorization: Bearer CRON_SECRET`.
 *
 * For every alert-enabled stock with vF targets, computes the distance of the
 * live CMP to bear/base/bull. A (stock, target) pair "enters the band" when
 * distance ≤ 5%; it re-arms only after exiting past 6% (hysteresis), so each
 * band entry alerts exactly once. When at least one NEW entry fires, ONE
 * Telegram message is sent with the full current picture: every pair presently
 * in-band, grouped by target, with day change %, new entrants marked 🆕.
 *
 * Debug/utility params (still CRON_SECRET-gated):
 *   ?threshold=0.5  — widen the band to force alerts end-to-end
 *   ?force=1        — bypass the market-hours guard
 *   ?snapshot=1     — send the current full in-band picture on demand,
 *                     WITHOUT writing state or journal rows
 */

const DEFAULT_THRESHOLD = 0.05;
const REARM_BUFFER = 0.01; // exit band only past threshold + buffer

const TARGET_TYPES = ["bear", "base", "bull"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

const TARGET_FIELD: Record<TargetType, string> = {
  bear: "bear_current",
  base: "base_current",
  bull: "bull_current",
};

type SnapshotStock = {
  tikr?: string;
  official_name?: string;
  [key: string]: unknown;
};

type BandHit = {
  tikr: string;
  name: string; // short display name (getCompanyShort)
  target: TargetType;
  cmp: number;
  targetPrice: number;
  dist: number; // fractional, e.g. 0.029
  dayChangePct: number;
  isNew: boolean;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtPrice(n: number): string {
  const decimals = n < 100 ? 1 : 0;
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function istTimeNow(): string {
  return new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const NAME_WIDTH = 12;

function buildMessage(hits: BandHit[]): string {
  const sections: { target: TargetType; emoji: string; label: string }[] = [
    { target: "bear", emoji: "🐻", label: "BEAR" },
    { target: "base", emoji: "🎯", label: "BASE" },
    { target: "bull", emoji: "🐂", label: "BULL" },
  ];

  const parts: string[] = [`🔔 <b>Near targets</b> · ${istTimeNow()} IST`];

  for (const { target, emoji, label } of sections) {
    const group = hits
      .filter(h => h.target === target)
      .sort((a, b) => a.dist - b.dist);
    if (group.length === 0) continue;

    const rows = group.map(h => {
      const star = h.isNew ? "*" : " ";
      const name = escapeHtml(h.name.slice(0, NAME_WIDTH).padEnd(NAME_WIDTH));
      const dist = `${(h.dist * 100).toFixed(1)}%`.padStart(5);
      const day = `${h.dayChangePct >= 0 ? "▲" : "▼"}${Math.abs(h.dayChangePct).toFixed(1)}%`;
      return `${star}${name} ${dist} ${fmtPrice(h.cmp)} (${day})`;
    });
    parts.push("", `${emoji} <b>${label} (${group.length})</b>`, `<pre>${rows.join("\n")}</pre>`);
  }

  if (hits.some(h => h.isNew)) parts.push("", "* new this check");
  return parts.join("\n");
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  // On-demand snapshot: send the current picture, write nothing.
  const snapshotMode = request.nextUrl.searchParams.get("snapshot") === "1";
  if (!force && !snapshotMode && !isMarketOpen()) {
    return NextResponse.json({ ok: true, skipped: "market closed" });
  }

  const thresholdParam = parseFloat(request.nextUrl.searchParams.get("threshold") || "");
  const threshold =
    Number.isFinite(thresholdParam) && thresholdParam > 0 && thresholdParam < 1
      ? thresholdParam
      : DEFAULT_THRESHOLD;

  try {
    const supabase = getSupabase();

    const [snapshotRes, prefsRes, stateRes, quotesRes] = await Promise.all([
      supabase.from("sync_snapshot").select("stocks").eq("id", 1).single(),
      supabase.from("alert_prefs").select("tikr, enabled"),
      supabase.from("alert_state").select("tikr, target_type, in_band"),
      buildQuotesMap(),
    ]);

    if (snapshotRes.error) throw snapshotRes.error;
    if (prefsRes.error) throw prefsRes.error;
    if (stateRes.error) throw stateRes.error;

    const stocks: SnapshotStock[] = snapshotRes.data?.stocks || [];
    const quotes = quotesRes.quotes;

    // Missing pref row = enabled (default ON for all covered stocks).
    const disabled = new Set(
      (prefsRes.data || []).filter(p => p.enabled === false).map(p => p.tikr)
    );
    const wasInBand = new Set(
      (stateRes.data || [])
        .filter(s => s.in_band)
        .map(s => `${s.tikr}|${s.target_type}`)
    );

    const hits: BandHit[] = [];
    const exits: { tikr: string; target: TargetType; cmp: number }[] = [];
    let checked = 0;

    for (const stock of stocks) {
      const tikr = stock.tikr;
      if (!tikr || disabled.has(tikr)) continue;

      const quote = quotes[tikr];
      if (!quote || !(quote.price > 0)) continue;

      for (const target of TARGET_TYPES) {
        const targetPrice = stock[TARGET_FIELD[target]];
        if (typeof targetPrice !== "number" || targetPrice <= 0) continue;
        checked++;

        const dist = Math.abs(quote.price - targetPrice) / targetPrice;
        const key = `${tikr}|${target}`;

        if (dist <= threshold) {
          hits.push({
            tikr,
            name: getCompanyShort(stock as { official_name?: string | null; tikr?: string | null }),
            target,
            cmp: quote.price,
            targetPrice,
            dist,
            dayChangePct: quote.changePct ?? 0,
            isNew: !wasInBand.has(key),
          });
        } else if (wasInBand.has(key) && dist > threshold + REARM_BUFFER) {
          exits.push({ tikr, target, cmp: quote.price });
        }
      }
    }

    const newEntries = hits.filter(h => h.isNew);
    const nowIso = new Date().toISOString();

    // Exits are safe to persist regardless of send outcome (re-arm only).
    if (!snapshotMode && exits.length > 0) {
      const { error } = await supabase.from("alert_state").upsert(
        exits.map(e => ({
          tikr: e.tikr,
          target_type: e.target,
          in_band: false,
          last_cmp: e.cmp,
          updated_at: nowIso,
        })),
        { onConflict: "tikr,target_type" }
      );
      if (error) console.error("[alerts/check] exit upsert failed:", error.message);
    }

    let sent = false;
    if (snapshotMode || newEntries.length > 0) {
      if (!isTelegramConfigured()) {
        // Don't mark entries in-band: alert would be silently swallowed.
        console.warn("[alerts/check] Telegram not configured — entries left un-fired for retry");
      } else if (snapshotMode) {
        // Read-only: report the current picture, leave all state untouched.
        const text = hits.length > 0
          ? buildMessage(hits)
          : `🔔 <b>Near targets</b> · ${istTimeNow()} IST\n\nNothing within ${(threshold * 100).toFixed(0)}% of any target right now.`;
        await sendTelegramMessage(text);
        sent = true;
      } else {
        // Send FIRST; only persist in_band=true on success so a failed
        // delivery retries next cycle instead of going silent.
        await sendTelegramMessage(buildMessage(hits));
        sent = true;

        const { error } = await supabase.from("alert_state").upsert(
          newEntries.map(h => ({
            tikr: h.tikr,
            target_type: h.target,
            in_band: true,
            last_alert_at: nowIso,
            last_cmp: h.cmp,
            updated_at: nowIso,
          })),
          { onConflict: "tikr,target_type" }
        );
        if (error) console.error("[alerts/check] entry upsert failed:", error.message);

        // Audit trail — best effort, non-fatal. Batch insert, falling back to
        // per-row so one bad row (e.g. an oversized vF tikr) can't reject all.
        const journalRows = newEntries.map(h => ({
          tikr: h.tikr.slice(0, 100),
          event_type: "zone_enter",
          zone_name: `near_${h.target}_5pct`,
          cmp_at_event: h.cmp,
          upside_bear: upsideFor(stocks, h.tikr, "bear", h.cmp),
          upside_base: upsideFor(stocks, h.tikr, "base", h.cmp),
          upside_bull: upsideFor(stocks, h.tikr, "bull", h.cmp),
          user_email: "alerts-bot",
        }));
        const { error: jErr } = await supabase.from("decision_journal").insert(journalRows);
        if (jErr) {
          console.error("[alerts/check] journal batch insert failed, retrying per-row:", jErr.message);
          for (const row of journalRows) {
            let { error: rowErr } = await supabase.from("decision_journal").insert(row);
            if (rowErr) {
              // decision_journal.tikr is varchar(30) until widened — truncate rather than lose the row.
              ({ error: rowErr } = await supabase
                .from("decision_journal")
                .insert({ ...row, tikr: row.tikr.slice(0, 30) }));
            }
            if (rowErr) console.error(`[alerts/check] journal insert failed for ${row.tikr}:`, rowErr.message);
          }
        }
      }
    }

    console.log(
      `[alerts/check] checked=${checked} inBand=${hits.length} new=${newEntries.length} rearmed=${exits.length} sent=${sent}`
    );

    return NextResponse.json({
      ok: true,
      threshold,
      snapshot: snapshotMode,
      checked,
      fired: newEntries.map(h => ({ tikr: h.tikr, target: h.target, dist: +(h.dist * 100).toFixed(2) })),
      inBand: hits.map(h => ({ tikr: h.tikr, target: h.target, dist: +(h.dist * 100).toFixed(2) })),
      rearmed: exits.map(e => ({ tikr: e.tikr, target: e.target })),
      sent,
      telegramConfigured: isTelegramConfigured(),
    });
  } catch (err) {
    console.error("[alerts/check] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** Fractional upside to a target from live CMP, matching the dashboard's convention. */
function upsideFor(
  stocks: SnapshotStock[],
  tikr: string,
  target: TargetType,
  cmp: number
): number | null {
  const stock = stocks.find(s => s.tikr === tikr);
  const targetPrice = stock?.[TARGET_FIELD[target]];
  if (typeof targetPrice !== "number" || !(cmp > 0)) return null;
  return (targetPrice - cmp) / cmp;
}
