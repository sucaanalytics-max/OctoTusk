import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { sendTelegramMessage, isTelegramConfigured } from "@/lib/telegram";
import { getCompanyShort } from "@/lib/companyName";
import { fetchCommodities, type Metal } from "@/lib/commodities";
import { fmtNum, dayArrow, escapeHtml, istTimeNow, istDateLabel } from "@/lib/telegramFormat";
import { buildIndicesPayload } from "../../indices/route";
import { buildQuotesMap } from "../../quotes/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/alerts/digest?type=preopen|recap — daily Telegram broadcasts.
 *
 * Fired by Vercel Cron (vercel.json) at 8:30 IST (preopen) and 15:45 IST
 * (recap), Mon–Fri. Both sit OUTSIDE the 9:15–15:30 market-hours window, so
 * this route is separate from the band engine (/api/alerts/check).
 * Auth: Authorization: Bearer CRON_SECRET (Vercel injects it automatically).
 * ?force=1 bypasses the weekend skip for manual testing.
 *
 * NOTE: weekday Indian trading holidays still fire (no holiday calendar).
 */

const GLOBAL_CUES: { sym: string; label: string }[] = [
  { sym: "^GSPC", label: "S&P 500" },
  { sym: "^IXIC", label: "Nasdaq" },
  { sym: "^DJI", label: "Dow" },
  { sym: "^N225", label: "Nikkei" },
  { sym: "^HSI", label: "HangSeng" },
];

const RADAR_THRESHOLD = 0.07; // wider than the 5% alert band — "approaching"
const RADAR_CAP = 15;

const TARGETS = [
  { field: "bear_current", label: "Bear" },
  { field: "base_current", label: "Base" },
  { field: "bull_current", label: "Bull" },
] as const;

const yf = new (YahooFinance as any)({
  suppressNotices: ["yahooSurvey"],
  fetchOptions: { cache: "no-store" },
});

function isWeekendIST(): boolean {
  const wd = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "short" });
  return wd === "Sat" || wd === "Sun";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null;
}

/** "🥇 Gold   MCX ₹1,50,675 🟢▲1.2% · Intl $4,240 🟢▲3.1%" — omits a missing leg. */
function metalLine(emoji: string, m: Metal): string {
  const parts: string[] = [];
  if (m.mcxInr != null) parts.push(`MCX ₹${fmtNum(m.mcxInr)} ${dayArrow(m.mcxPct)}`.trim());
  if (m.usdOz != null) parts.push(`Intl $${fmtNum(m.usdOz)} ${dayArrow(m.usdPct)}`.trim());
  const body = parts.length ? parts.join(" · ") : "unavailable";
  return `${emoji} <b>${m.name}</b>  ${body}`;
}

async function fetchGlobalCues(): Promise<string[]> {
  const rows: string[] = [];
  try {
    const rs: any[] = await yf.quote(GLOBAL_CUES.map(g => g.sym));
    const bySym = new Map<string, any>();
    for (const r of rs ?? []) if (r?.symbol) bySym.set(r.symbol, r);
    for (const { sym, label } of GLOBAL_CUES) {
      const q = bySym.get(sym);
      const px = q && typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null;
      const pct = q && typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null;
      if (px == null) continue;
      rows.push(`${label.padEnd(8)} ${fmtNum(px).padStart(7)}  ${dayArrow(pct)}`);
    }
  } catch (err) {
    console.warn("[digest] global cues failed:", err instanceof Error ? err.message : err);
  }
  return rows;
}

async function buildPreopen(): Promise<string> {
  const [cues, commodities] = await Promise.all([fetchGlobalCues(), fetchCommodities()]);
  const parts = [`🌅 <b>Pre-open</b> · ${istDateLabel()} · ${istTimeNow()} IST`];

  if (cues.length) parts.push("", "🌎 <b>Global cues</b>", `<pre>${cues.join("\n")}</pre>`);

  parts.push("", metalLine("🥇", commodities.gold), metalLine("🥈", commodities.silver));

  // Radar: snapshot targets vs live (pre-open = prior close) price.
  try {
    const supabase = getSupabase();
    const [snap, prefs, { quotes }] = await Promise.all([
      supabase.from("sync_snapshot").select("stocks").eq("id", 1).single(),
      supabase.from("alert_prefs").select("tikr, enabled"),
      buildQuotesMap(),
    ]);
    const disabled = new Set((prefs.data || []).filter(p => p.enabled === false).map(p => p.tikr));
    const stocks: any[] = snap.data?.stocks || [];

    const radar: { name: string; band: string; dist: number }[] = [];
    for (const s of stocks) {
      if (!s.tikr || disabled.has(s.tikr)) continue;
      const cmp = quotes[s.tikr]?.price ?? num(s.cmp);
      if (!cmp) continue;
      let best: { band: string; dist: number } | null = null;
      for (const t of TARGETS) {
        const tp = num(s[t.field]);
        if (!tp) continue;
        const dist = Math.abs(cmp - tp) / tp;
        if (dist <= RADAR_THRESHOLD && (!best || dist < best.dist)) best = { band: t.label, dist };
      }
      if (best) radar.push({ name: getCompanyShort(s), band: best.band, dist: best.dist });
    }
    radar.sort((a, b) => a.dist - b.dist);

    if (radar.length) {
      const shown = radar.slice(0, RADAR_CAP);
      const rows = shown.map(r => `${escapeHtml(r.name.slice(0, 11)).padEnd(11)} ${r.band.padEnd(4)} ${(r.dist * 100).toFixed(1)}%`);
      const more = radar.length > RADAR_CAP ? ` …+${radar.length - RADAR_CAP} more` : "";
      parts.push("", `🎯 <b>On the radar today</b> (within ${RADAR_THRESHOLD * 100}%)`, `<pre>${rows.join("\n")}</pre>${more}`);
    }
  } catch (err) {
    console.warn("[digest] radar failed:", err instanceof Error ? err.message : err);
  }

  return parts.join("\n");
}

async function buildRecap(): Promise<string> {
  const parts = [`🌆 <b>Market recap</b> · ${istDateLabel()} · ${istTimeNow()} IST`];

  // Index close + best/worst sector.
  try {
    const { indices } = await buildIndicesPayload();
    const byLabel = new Map(indices.map(i => [i.label, i]));
    const closeRows: string[] = [];
    for (const label of ["NIFTY 50", "SENSEX", "BANK"]) {
      const ix = byLabel.get(label);
      if (ix?.value != null) closeRows.push(`${label.padEnd(10)} ${fmtNum(ix.value).padStart(8)}  ${dayArrow(ix.dayPct)}`);
    }
    if (closeRows.length) parts.push("", "📊 <b>Close</b>", `<pre>${closeRows.join("\n")}</pre>`);

    const SECTORS = ["BANK", "FIN SVCS", "IT", "AUTO", "PHARMA", "FMCG", "REALTY", "METAL", "ENERGY", "HEALTHCARE"];
    const sectors = SECTORS.map(l => byLabel.get(l)).filter((i): i is NonNullable<typeof i> => !!i && i.dayPct != null);
    if (sectors.length) {
      sectors.sort((a, b) => (b.dayPct as number) - (a.dayPct as number));
      const best = sectors[0], worst = sectors[sectors.length - 1];
      parts.push(`Best ${escapeHtml(best.label)} ${dayArrow(best.dayPct)} · Worst ${escapeHtml(worst.label)} ${dayArrow(worst.dayPct)}`);
    }
  } catch (err) {
    console.warn("[digest] indices failed:", err instanceof Error ? err.message : err);
  }

  // Entered a band today (from the journal the alert engine writes).
  try {
    const startIstUtc = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) + "T00:00:00+05:30").toISOString();
    const { data } = await getSupabase()
      .from("decision_journal")
      .select("tikr, zone_name, created_at")
      .eq("event_type", "zone_enter")
      .eq("user_email", "alerts-bot")
      .gte("created_at", startIstUtc)
      .order("created_at", { ascending: true });

    const seen = new Set<string>();
    const rows: string[] = [];
    for (const r of data || []) {
      const band = /bear/.test(r.zone_name) ? "Bear" : /bull/.test(r.zone_name) ? "Bull" : "Base";
      const key = `${r.tikr}|${band}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(`${escapeHtml(r.tikr.slice(0, 11)).padEnd(11)} ${band}`);
    }
    if (rows.length) parts.push("", `🎯 <b>Entered a band today</b> (${rows.length})`, `<pre>${rows.join("\n")}</pre>`);
  } catch (err) {
    console.warn("[digest] band activity failed:", err instanceof Error ? err.message : err);
  }

  const commodities = await fetchCommodities();
  parts.push("", metalLine("🥇", commodities.gold), metalLine("🥈", commodities.silver));

  return parts.join("\n");
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type");
  if (type !== "preopen" && type !== "recap") {
    return NextResponse.json({ error: "type must be preopen or recap" }, { status: 400 });
  }
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && isWeekendIST()) return NextResponse.json({ ok: true, skipped: "weekend" });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const message = type === "preopen" ? await buildPreopen() : await buildRecap();
    let sent = false;
    if (isTelegramConfigured()) {
      await sendTelegramMessage(message);
      sent = true;
    } else {
      console.warn("[digest] Telegram not configured — nothing sent");
    }
    console.log(`[digest] type=${type} sent=${sent}`);
    return NextResponse.json({ ok: true, type, sent });
  } catch (err) {
    console.error("[digest] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
