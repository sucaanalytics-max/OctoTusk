import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { getCompanyShort } from "@/lib/companyName";
import { matchStocks, type LookupStock } from "@/lib/stockLookup";
import { fetchNews, type NewsItem } from "@/lib/stockNews";
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
 * Commands:
 *   /s <stock> → research card (live CMP, targets, valuation, top-3 news)
 *   /n <stock> → recent headlines (up to 8, last 30 days)
 *
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
  volume: number;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  avgVolume3Month: number | null;
  dividendYield: number | null;
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

function newsBullets(news: NewsItem[]): string[] {
  return news.map(n => {
    const src = n.publisher ? ` — ${escapeHtml(n.publisher)}` : "";
    return `• <a href="${escapeHtml(n.link)}">${escapeHtml(n.title)}</a>${src} (${n.ageLabel})`;
  });
}

// Aligned "Label  value" row inside a <pre> block.
const row = (label: string, value: string) => `${label.padEnd(6)} ${value}`;

function buildCard(stock: LookupStock, quote: Quote, news: NewsItem[]): string {
  const name = escapeHtml(getCompanyShort(stock));
  const sector = stock.sector ? ` · ${escapeHtml(String(stock.sector))}` : "";
  const cmp = quote?.price ?? num(stock.cmp);
  const parts: string[] = [`📊 <b>${name}</b>${sector}`];

  // ── Market data
  const mkt: string[] = [];
  if (cmp) {
    const day = quote
      ? `  ${quote.changePct >= 0 ? "🟢▲" : "🔴▼"}${Math.abs(quote.changePct).toFixed(1)}%`
      : "  (last sync)";
    mkt.push(row("CMP", `${fmtNum(cmp)}${day}`));
  }
  if (quote?.marketCap) mkt.push(row("MCap", `${fmtNum(quote.marketCap / 1e7)} Cr`));
  const lo = quote?.fiftyTwoWeekLow, hi = quote?.fiftyTwoWeekHigh;
  if (lo != null && hi != null && hi > lo && cmp) {
    const pos = Math.round(((cmp - lo) / (hi - lo)) * 100);
    mkt.push(row("52W", `${fmtNum(lo)} – ${fmtNum(hi)} (${pos}%)`));
  }
  if (quote?.volume && quote?.avgVolume3Month) {
    mkt.push(row("Vol", `${(quote.volume / quote.avgVolume3Month).toFixed(1)}× 3m avg`));
  }
  if (quote?.dividendYield) {
    const pct = quote.dividendYield > 1 ? quote.dividendYield : quote.dividendYield * 100;
    mkt.push(row("Yld", `${pct.toFixed(1)}%`));
  }
  if (mkt.length) parts.push(`<pre>${mkt.join("\n")}</pre>`);

  // ── Targets
  const tgt: string[] = [];
  const target = (label: string, v: number | null) => {
    if (!v) return;
    tgt.push(row(label, cmp ? `${fmtNum(v).padEnd(7)} ${fmtSignedPct((v - cmp) / cmp)}` : fmtNum(v)));
  };
  target("Bear", num(stock.bear_current));
  target("Base", num(stock.base_current));
  target("Bull", num(stock.bull_current));
  target("1Y", num(stock.target_1y));
  target("2Y", num(stock.target_2y));
  if (tgt.length) parts.push("🎯 <b>Targets</b>", `<pre>${tgt.join("\n")}</pre>`);

  // ── Valuation
  const val: string[] = [];
  const basePe = num(stock.base_pe), ttmPe = num(quote?.trailingPE);
  if (basePe || ttmPe) {
    val.push(row("PE", [basePe ? `${basePe.toFixed(1)}x base` : null, ttmPe ? `${ttmPe.toFixed(1)}x ttm` : null].filter(Boolean).join(" · ")));
  }
  if (num(quote?.forwardPE)) val.push(row("FwdPE", `${(quote!.forwardPE as number).toFixed(1)}x`));
  const basePb = num(stock.base_pb), livePb = num(quote?.priceToBook);
  if (basePb || livePb) {
    val.push(row("PB", [basePb ? `${basePb.toFixed(1)}x base` : null, livePb ? `${livePb.toFixed(1)}x live` : null].filter(Boolean).join(" · ")));
  }
  if (num(stock.base_evebitda)) val.push(row("EV/EB", `${(stock.base_evebitda as number).toFixed(1)}x`));
  const sd = [
    num(stock.base_pe_2sd) ? `PE ${(stock.base_pe_2sd as number).toFixed(0)}x` : null,
    num(stock.base_pb_2sd) ? `PB ${(stock.base_pb_2sd as number).toFixed(1)}x` : null,
    num(stock.base_evebitda_2sd) ? `EV ${(stock.base_evebitda_2sd as number).toFixed(0)}x` : null,
  ].filter(Boolean);
  if (sd.length) val.push(row("+2SD", sd.join(" · ")));
  const d50 = num(quote?.fiftyDayAverage), d200 = num(quote?.twoHundredDayAverage);
  if (d50 || d200) {
    val.push(row("DMA", [d50 ? `50: ${fmtNum(d50)}` : null, d200 ? `200: ${fmtNum(d200)}` : null].filter(Boolean).join(" · ")));
  }
  if (val.length) parts.push("📐 <b>Valuation</b>", `<pre>${val.join("\n")}</pre>`);

  // ── Meta / summary / news / vF
  const meta = [
    num(stock.conviction) ? `Conviction ${stock.conviction}/5` : null,
    stock.vp ? `VA ${escapeHtml(String(stock.vp))}` : null,
    stock.sa ? `SA ${escapeHtml(String(stock.sa))}` : null,
    num(stock.score) ? `Score ${stock.score}` : null,
  ].filter(Boolean);
  if (meta.length) parts.push(`⭐ ${meta.join(" · ")}`);

  parts.push(`🧠 <i>${escapeHtml(buildSummary(stock, cmp, quote))}</i>`);

  if (news.length) parts.push("📰 <b>News</b>", ...newsBullets(news));

  const vfDate = stock.last_updated ? `vF ${String(stock.last_updated).slice(0, 10)}` : null;
  if (stock.vf_web_url && typeof stock.vf_web_url === "string") {
    parts.push(`📎 <a href="${escapeHtml(stock.vf_web_url)}">Open vF</a>${vfDate ? ` · ${vfDate}` : ""}`);
  } else if (vfDate) {
    parts.push(`🗒 ${vfDate}`);
  }

  return parts.join("\n");
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

  const cmd = text.trim().match(/^\/(s|n)(?:@\w+)?(?:\s+([^\n]+))?$/i);
  if (!cmd) return NextResponse.json({ ok: true });
  const command = cmd[1].toLowerCase() as "s" | "n";

  const reply = (replyText: string) =>
    sendTelegramMessage(replyText, { chatId, replyTo: msg.message_id }).catch(err =>
      console.error("[telegram/webhook] reply failed:", err instanceof Error ? err.message : err)
    );

  const query = (cmd[2] || "").trim();
  if (!query) {
    await reply(
      command === "s"
        ? "Usage: <code>/s stock name</code> — e.g. <code>/s saregama</code>"
        : "Usage: <code>/n stock name</code> — e.g. <code>/n saregama</code>"
    );
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
      const names = result.candidates.map(c => `• ${escapeHtml(getCompanyShort(c))} (<code>/${command} ${escapeHtml(String(c.tikr))}</code>)`);
      await reply(`Did you mean:\n${names.join("\n")}`);
    } else if (command === "n") {
      const stock = result.stock;
      const shortName = getCompanyShort(stock);
      const news = await fetchNews(shortName, { limit: 8, maxAgeDays: 30 });
      await reply(
        news.length
          ? `📰 <b>${escapeHtml(shortName)}</b> — recent headlines\n${newsBullets(news).join("\n")}`
          : `📰 No headlines for <b>${escapeHtml(shortName)}</b> in the last 30 days.`
      );
    } else {
      const stock = result.stock;
      let quote: Quote;
      let news: NewsItem[] = [];
      const [quotesRes, newsRes] = await Promise.allSettled([
        buildQuotesMap(),
        fetchNews(getCompanyShort(stock), { limit: 3, maxAgeDays: 7 }),
      ]);
      if (quotesRes.status === "fulfilled") {
        quote = quotesRes.value.quotes[stock.tikr as string] as Quote;
      } else {
        console.warn("[telegram/webhook] quote fetch failed (card falls back to snapshot cmp):", quotesRes.reason?.message);
      }
      if (newsRes.status === "fulfilled") news = newsRes.value;
      await reply(buildCard(stock, quote, news));
    }
  } catch (err) {
    console.error("[telegram/webhook] Error:", err instanceof Error ? err.message : err);
    await reply("Lookup failed — try again.");
  }

  return NextResponse.json({ ok: true });
}
