import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { getCompanyShort } from "@/lib/companyName";
import { matchStocks, type LookupStock } from "@/lib/stockLookup";
import { buildQuotesMap } from "../../quotes/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/telegram/webhook — Telegram bot updates (set via setWebhook).
 *
 * Authenticated by the X-Telegram-Bot-Api-Secret-Token header
 * (TELEGRAM_WEBHOOK_SECRET). Only answers the Tusk Alerts group
 * (TELEGRAM_CHAT_ID) and allowlisted DM users (TELEGRAM_ALLOWED_USER_IDS,
 * comma-separated) — every other chat gets a silent 200.
 *
 * One command: /s <stock name> → research card with live CMP.
 * Group privacy mode stays ON, so ordinary group chat never reaches us.
 */

function fmtNum(n: number): string {
  const decimals = n < 100 ? 1 : 0;
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtSignedPct(frac: number): string {
  const pct = frac * 100;
  const decimals = Math.abs(pct) >= 10 ? 0 : 1;
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(decimals)}%`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null;
}

type Quote = {
  price: number;
  changePct: number;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
} | undefined;

function buildSummary(stock: LookupStock, cmp: number | null, quote: Quote): string {
  if (!cmp) return "No live price available.";
  const clauses: string[] = [];

  const bear = num(stock.bear_current);
  const base = num(stock.base_current);
  const bull = num(stock.bull_current);
  const vs = (target: number) => `${(Math.abs((cmp - target) / target) * 100).toFixed(1)}%`;

  if (bear && cmp < bear) clauses.push(`trades ${vs(bear)} BELOW the Bear case`);
  else if (bear && base && cmp < base) clauses.push(`${vs(bear)} above Bear, ${(((base - cmp) / cmp) * 100).toFixed(0)}% upside to Base`);
  else if (base && bull && cmp < bull) clauses.push(`past Base, ${(((bull - cmp) / cmp) * 100).toFixed(0)}% left to Bull`);
  else if (bull && cmp >= bull) clauses.push(`trades ${vs(bull)} ABOVE the Bull case — stretched`);
  else if (base) clauses.push(`${fmtSignedPct((base - cmp) / cmp)} to Base`);

  const dayPct = quote?.changePct;
  if (typeof dayPct === "number" && Math.abs(dayPct) >= 2) {
    clauses.push(`moved ${dayPct >= 0 ? "🟢▲" : "🔴▼"}${Math.abs(dayPct).toFixed(1)}% today`);
  }

  const lo = quote?.fiftyTwoWeekLow, hi = quote?.fiftyTwoWeekHigh;
  if (lo != null && hi != null && hi > lo) {
    const pos = (cmp - lo) / (hi - lo);
    if (pos <= 0.15) clauses.push("near 52W low");
    else if (pos >= 0.85) clauses.push("near 52W high");
  }

  const conviction = num(stock.conviction);
  if (conviction && conviction >= 4) clauses.push(`high conviction (${conviction}/5)`);

  if (clauses.length === 0) return "No vF targets on file.";
  const text = clauses.join("; ") + ".";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildCard(stock: LookupStock, quote: Quote): string {
  const name = escapeHtml(getCompanyShort(stock));
  const sector = stock.sector ? ` · ${escapeHtml(String(stock.sector))}` : "";
  const cmp = quote?.price ?? num(stock.cmp);
  const lines: string[] = [`📊 <b>${name}</b>${sector}`];

  if (cmp) {
    const day = quote
      ? ` (${quote.changePct >= 0 ? "🟢▲" : "🔴▼"}${Math.abs(quote.changePct).toFixed(1)}%)`
      : " (last sync)";
    const w52 = quote?.fiftyTwoWeekLow != null && quote?.fiftyTwoWeekHigh != null
      ? ` · 52W ${fmtNum(quote.fiftyTwoWeekLow)}–${fmtNum(quote.fiftyTwoWeekHigh)}`
      : "";
    lines.push(`CMP ${fmtNum(cmp)}${day}${w52}`);
  }

  const target = (label: string, v: number | null) =>
    v && cmp ? `${label} ${fmtNum(v)} (${fmtSignedPct((v - cmp) / cmp)})` : v ? `${label} ${fmtNum(v)}` : null;

  const scenario = [target("Bear", num(stock.bear_current)), target("Base", num(stock.base_current)), target("Bull", num(stock.bull_current))].filter(Boolean);
  if (scenario.length) lines.push("", `🎯 ${scenario.join(" · ")}`);
  const fwd = [target("1Y", num(stock.target_1y)), target("2Y", num(stock.target_2y))].filter(Boolean);
  if (fwd.length) lines.push(`     ${fwd.join(" · ")}`);

  const multiples = [
    num(stock.base_pe) ? `PE ${(stock.base_pe as number).toFixed(1)}x` : null,
    num(stock.base_pb) ? `PB ${(stock.base_pb as number).toFixed(1)}x` : null,
    num(stock.base_evebitda) ? `EV/EBITDA ${(stock.base_evebitda as number).toFixed(1)}x` : null,
  ].filter(Boolean);
  if (multiples.length) lines.push(`📐 ${multiples.join(" · ")}`);

  const meta = [
    num(stock.conviction) ? `Conviction ${stock.conviction}/5` : null,
    stock.vp ? `VA ${escapeHtml(String(stock.vp))}` : null,
    stock.sa ? `SA ${escapeHtml(String(stock.sa))}` : null,
    stock.last_updated ? `vF ${String(stock.last_updated).slice(0, 10)}` : null,
  ].filter(Boolean);
  if (meta.length) lines.push(`⭐ ${meta.join(" · ")}`);

  lines.push("", `🧠 <i>${escapeHtml(buildSummary(stock, cmp, quote))}</i>`);

  if (stock.vf_web_url && typeof stock.vf_web_url === "string") {
    lines.push("", `📎 <a href="${escapeHtml(stock.vf_web_url)}">Open vF</a>`);
  }

  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // From here on always 200 — Telegram retries non-2xx, and we never want
  // a bad update or a downstream failure to turn into webhook retry spam.
  let update: any;
  try { update = await request.json(); } catch { return NextResponse.json({ ok: true }); }

  const msg = update?.message;
  const text: string = typeof msg?.text === "string" ? msg.text : "";
  const chatId = msg?.chat?.id;
  if (!text || chatId == null) return NextResponse.json({ ok: true });

  const isGroup = String(chatId) === process.env.TELEGRAM_CHAT_ID;
  const allowedDms = (process.env.TELEGRAM_ALLOWED_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const isAllowedDm = msg.chat.type === "private" && allowedDms.includes(String(chatId));
  if (!isGroup && !isAllowedDm) return NextResponse.json({ ok: true });

  const cmd = text.trim().match(/^\/s(?:@\w+)?(?:\s+([^\n]+))?$/i);
  if (!cmd) return NextResponse.json({ ok: true });

  const reply = (replyText: string) =>
    sendTelegramMessage(replyText, { chatId, replyTo: msg.message_id }).catch(err =>
      console.error("[telegram/webhook] reply failed:", err instanceof Error ? err.message : err)
    );

  const query = (cmd[1] || "").trim();
  if (!query) {
    await reply("Usage: <code>/s stock name</code> — e.g. <code>/s saregama</code>");
    return NextResponse.json({ ok: true });
  }

  try {
    if (!isSupabaseConfigured()) {
      await reply("Lookup unavailable — database not configured.");
      return NextResponse.json({ ok: true });
    }

    const { data, error } = await getSupabase().from("sync_snapshot").select("stocks").eq("id", 1).single();
    if (error) throw error;
    const stocks: LookupStock[] = data?.stocks || [];

    const result = matchStocks(stocks, query);
    if (result.kind === "none") {
      await reply(`No stock matching "<b>${escapeHtml(query)}</b>". Try a tikr or part of the company name.`);
    } else if (result.kind === "ambiguous") {
      const names = result.candidates.map(c => `• ${escapeHtml(getCompanyShort(c))} (<code>/s ${escapeHtml(String(c.tikr))}</code>)`);
      await reply(`Did you mean:\n${names.join("\n")}`);
    } else {
      const stock = result.stock;
      let quote: Quote;
      try {
        const { quotes } = await buildQuotesMap();
        quote = quotes[stock.tikr as string] as Quote;
      } catch (err) {
        console.warn("[telegram/webhook] quote fetch failed (card falls back to snapshot cmp):", err instanceof Error ? err.message : err);
      }
      await reply(buildCard(stock, quote));
    }
  } catch (err) {
    console.error("[telegram/webhook] Error:", err instanceof Error ? err.message : err);
    await reply("Lookup failed — try again.");
  }

  return NextResponse.json({ ok: true });
}
