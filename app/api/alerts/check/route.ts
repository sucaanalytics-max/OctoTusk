import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { isMarketOpen } from "@/lib/marketHours";
import { isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";
import { getCompanyShort } from "@/lib/companyName";
import { OCTOPUS_INDICES_BROAD } from "@/lib/indices";
import { buildQuotesMap } from "../../quotes/route";
import { buildIndicesPayload, type IndexTick } from "../../indices/route";

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
 * band entry alerts exactly once.
 *
 * Cadence (cron fires every 15 min during market hours):
 *   - every run:   per-stock ping for each NEW band entrant (>6 at once →
 *                  one consolidated message, e.g. cold start)
 *   - IST :00/:30: full near-target snapshot (when anything is in range)
 *   - IST :00:     index strip (broad + sector, price & day change)
 *
 * Debug/utility params (still CRON_SECRET-gated):
 *   ?threshold=0.5  — widen the band to force alerts end-to-end
 *   ?force=1        — bypass the market-hours guard
 *   ?snapshot=1     — send the current full in-band picture on demand,
 *                     WITHOUT writing state or journal rows
 *   ?indices=1      — send the indices message on demand
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

// No ₹ symbol inside the table — keeps lines narrow enough for phone <pre> width.
function fmtNum(n: number): string {
  const decimals = n < 100 ? 1 : 0;
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function istTimeNow(): string {
  return new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const NAME_WIDTH = 10;
const TARGET_WIDTH = 13; // "4,394 (2.3%)"

function buildMessage(hits: BandHit[]): string {
  const sections: { target: TargetType; emoji: string; label: string }[] = [
    { target: "bear", emoji: "🐻", label: "BEAR" },
    { target: "base", emoji: "🎯", label: "BASE" },
    { target: "bull", emoji: "🐂", label: "BULL" },
  ];

  const parts: string[] = [
    `🔔 <b>Near targets</b> · ${istTimeNow()} IST`,
    `<i>name · target (% away) - CMP (day %)</i>`,
  ];

  for (const { target, emoji, label } of sections) {
    const group = hits
      .filter(h => h.target === target)
      .sort((a, b) => a.dist - b.dist);
    if (group.length === 0) continue;

    const rows = group.map(h => {
      const star = h.isNew ? "*" : " ";
      const name = escapeHtml(h.name.slice(0, NAME_WIDTH).padEnd(NAME_WIDTH));
      const targetCol = `${fmtNum(h.targetPrice)} (${(h.dist * 100).toFixed(1)}%)`.padEnd(TARGET_WIDTH);
      const arrow = h.dayChangePct >= 0 ? "🟢▲" : "🔴▼";
      return `${star}${name} ${targetCol} - ${fmtNum(h.cmp)} (${arrow}${Math.abs(h.dayChangePct).toFixed(1)}%)`;
    });
    parts.push("", `${emoji} <b>${label} (${group.length})</b>`, `<pre>${rows.join("\n")}</pre>`);
  }

  if (hits.some(h => h.isNew)) parts.push("", "* new this check");
  return parts.join("\n");
}

const TARGET_EMOJI: Record<TargetType, string> = { bear: "🐻", base: "🎯", bull: "🐂" };

function buildPingMessage(h: BandHit): string {
  const arrow = h.dayChangePct >= 0 ? "🟢▲" : "🔴▼";
  return [
    `🔔 <b>${escapeHtml(h.name)}</b> entered the ${TARGET_EMOJI[h.target]} <b>${h.target.toUpperCase()}</b> band`,
    `<pre>${fmtNum(h.targetPrice)} (${(h.dist * 100).toFixed(1)}% away) - CMP ${fmtNum(h.cmp)} (${arrow}${Math.abs(h.dayChangePct).toFixed(1)}%)</pre>`,
  ].join("\n");
}

function buildIndicesMessage(ticks: IndexTick[]): string {
  const line = (t: IndexTick, width: number) => {
    const value = t.value != null ? fmtNum(t.value) : "—";
    const day = t.dayPct != null
      ? `${t.dayPct >= 0 ? "🟢▲" : "🔴▼"}${Math.abs(t.dayPct).toFixed(1)}%`
      : "";
    return `${t.label.padEnd(width)} ${value.padStart(9)}  ${day}`;
  };
  const broad = ticks.slice(0, OCTOPUS_INDICES_BROAD.length);
  const sector = ticks.slice(OCTOPUS_INDICES_BROAD.length);
  const parts = [`📈 <b>Indices</b> · ${istTimeNow()} IST`];
  if (broad.length) parts.push(`<pre>${broad.map(t => line(t, 17)).join("\n")}</pre>`);
  if (sector.length) parts.push("<b>Sectors</b>", `<pre>${sector.map(t => line(t, 11)).join("\n")}</pre>`);
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

    // Mark entries in-band + journal them — called only AFTER their alert
    // delivered, so a failed send retries next cycle instead of going silent.
    const persistEntries = async (entries: BandHit[]) => {
      const { error } = await supabase.from("alert_state").upsert(
        entries.map(h => ({
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
      const journalRows = entries.map(h => ({
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
    };

    // Cron fires at UTC :00/:15/:30/:45 (+ ~44s). IST = UTC+5:30, so UTC
    // :00/:30 are the IST half-hours and UTC :30 is the IST top-of-hour.
    const utcMin = new Date().getUTCMinutes();
    const slot = (Math.round(utcMin / 15) * 15) % 60;
    const isHalfHourSlot = slot === 0 || slot === 30;
    const isHourSlot = slot === 30;
    const indicesMode = request.nextUrl.searchParams.get("indices") === "1";

    let pingsSent = 0;
    let snapshotSent = false;
    let indicesSent = false;

    if (!isTelegramConfigured()) {
      // Don't mark entries in-band: alerts would be silently swallowed.
      console.warn("[alerts/check] Telegram not configured — nothing sent, entries left un-fired for retry");
    } else {
      // 1) Per-stock pings for new band entrants (every cycle).
      //    snapshotMode is read-only by contract — no pings, no persists.
      if (!snapshotMode && newEntries.length > 0) {
        if (newEntries.length > 6) {
          // Flood guard (cold start / threshold tests): one consolidated message.
          try {
            await sendTelegramMessage(buildMessage(newEntries));
            await persistEntries(newEntries);
            pingsSent = newEntries.length;
          } catch (err) {
            console.error("[alerts/check] consolidated entry send failed:", err instanceof Error ? err.message : err);
          }
        } else {
          for (const h of newEntries) {
            try {
              await sendTelegramMessage(buildPingMessage(h));
              await persistEntries([h]);
              pingsSent++;
            } catch (err) {
              console.error(`[alerts/check] ping failed for ${h.tikr}/${h.target} (retries next cycle):`, err instanceof Error ? err.message : err);
            }
          }
        }
      }

      // 2) Full snapshot — every IST half-hour, or on demand (?snapshot=1).
      if (snapshotMode || isHalfHourSlot) {
        try {
          if (hits.length > 0) {
            await sendTelegramMessage(buildMessage(hits));
            snapshotSent = true;
          } else if (snapshotMode) {
            await sendTelegramMessage(
              `🔔 <b>Near targets</b> · ${istTimeNow()} IST\n\nNothing within ${(threshold * 100).toFixed(0)}% of any target right now.`
            );
            snapshotSent = true;
          }
        } catch (err) {
          console.error("[alerts/check] snapshot send failed:", err instanceof Error ? err.message : err);
        }
      }

      // 3) Indices strip — every IST top-of-hour, or on demand (?indices=1).
      if (indicesMode || (!snapshotMode && isHourSlot)) {
        try {
          const { indices } = await buildIndicesPayload();
          await sendTelegramMessage(buildIndicesMessage(indices));
          indicesSent = true;
        } catch (err) {
          console.error("[alerts/check] indices push failed:", err instanceof Error ? err.message : err);
        }
      }
    }

    const sent = pingsSent > 0 || snapshotSent || indicesSent;

    console.log(
      `[alerts/check] checked=${checked} inBand=${hits.length} new=${newEntries.length} rearmed=${exits.length} slot=${slot} pings=${pingsSent} snapshot=${snapshotSent} indices=${indicesSent}`
    );

    return NextResponse.json({
      ok: true,
      threshold,
      snapshot: snapshotMode,
      slot,
      checked,
      fired: newEntries.map(h => ({ tikr: h.tikr, target: h.target, dist: +(h.dist * 100).toFixed(2) })),
      inBand: hits.map(h => ({ tikr: h.tikr, target: h.target, dist: +(h.dist * 100).toFixed(2) })),
      rearmed: exits.map(e => ({ tikr: e.tikr, target: e.target })),
      sent,
      pingsSent,
      snapshotSent,
      indicesSent,
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
