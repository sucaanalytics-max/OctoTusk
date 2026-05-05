import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { unstable_noStore as noStore } from "next/cache";
import { auth } from "@/auth";
import { reportError, reportSuccess } from "@/lib/health";
import dhanByTikr from "@/data/dhan-eq-instruments-by-tikr.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Yahoo as fallback only for TIKRs missing from Dhan instrument map.
const yf = new (YahooFinance as any)({
  suppressNotices: ["yahooSurvey"],
  fetchOptions: { cache: "no-store" },
});

type DhanEntry = { securityId: number; exchange: string };

type QuoteData = {
  price: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: string;
  dayHigh: number | null;
  dayLow: number | null;
  open: number | null;
  prevClose: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  epsTrailingTwelveMonths: number | null;
  bookValue: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  avgVolume3Month: number | null;
  avgVolume10Day: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
};

function emptyQuote(): Partial<QuoteData> {
  return {
    dayHigh: null, dayLow: null, open: null, prevClose: null,
    fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, marketCap: null,
    trailingPE: null, forwardPE: null, priceToBook: null,
    epsTrailingTwelveMonths: null, bookValue: null,
    fiftyDayAverage: null, twoHundredDayAverage: null,
    avgVolume3Month: null, avgVolume10Day: null,
    dividendRate: null, dividendYield: null,
  };
}

async function fetchDhanQuotes(
  byExchange: Record<string, number[]>,
  clientId: string,
  accessToken: string
): Promise<Record<number, { price: number; change: number; changePct: number; volume: number; dayHigh: number | null; dayLow: number | null; open: number | null; prevClose: number | null }>> {
  const out: Record<number, any> = {};
  if (Object.keys(byExchange).length === 0) return out;

  const res = await fetch("https://api.dhan.co/v2/marketfeed/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "client-id": clientId,
      "access-token": accessToken,
    },
    body: JSON.stringify(byExchange),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[quotes] Dhan marketfeed/quote error ${res.status}: ${text.slice(0, 300)}`);
    return out;
  }

  const data = await res.json();
  const exchData = data?.data;
  if (!exchData || typeof exchData !== "object") return out;

  for (const segmentData of Object.values(exchData)) {
    if (!segmentData || typeof segmentData !== "object") continue;
    for (const [secIdStr, info] of Object.entries(segmentData as Record<string, any>)) {
      const secId = Number(secIdStr);
      if (!secId) continue;
      const last = typeof info?.last_price === "number" ? info.last_price : null;
      if (last == null) continue;
      const ohlc = info?.ohlc || {};
      const prevClose = typeof ohlc.close === "number" ? ohlc.close : null;
      const change = typeof info?.net_change === "number"
        ? info.net_change
        : (prevClose != null ? last - prevClose : 0);
      const changePct = prevClose && prevClose !== 0 ? (change / prevClose) * 100 : 0;
      out[secId] = {
        price: last,
        change,
        changePct,
        volume: typeof info?.volume === "number" ? info.volume : 0,
        dayHigh: typeof ohlc.high === "number" ? ohlc.high : null,
        dayLow: typeof ohlc.low === "number" ? ohlc.low : null,
        open: typeof ohlc.open === "number" ? ohlc.open : null,
        prevClose,
      };
    }
  }
  return out;
}

function extractYahooQuoteData(quote: any): QuoteData {
  return {
    price: quote.regularMarketPrice || 0,
    change: quote.regularMarketChange || 0,
    changePct: quote.regularMarketChangePercent || 0,
    volume: quote.regularMarketVolume || 0,
    timestamp: new Date().toISOString(),
    dayHigh: quote.regularMarketDayHigh ?? null,
    dayLow: quote.regularMarketDayLow ?? null,
    open: quote.regularMarketOpen ?? null,
    prevClose: quote.regularMarketPreviousClose ?? null,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
    marketCap: quote.marketCap ?? null,
    trailingPE: quote.trailingPE ?? null,
    forwardPE: quote.forwardPE ?? null,
    priceToBook: quote.priceToBook ?? null,
    epsTrailingTwelveMonths: quote.epsTrailingTwelveMonths ?? null,
    bookValue: quote.bookValue ?? null,
    fiftyDayAverage: quote.fiftyDayAverage ?? null,
    twoHundredDayAverage: quote.twoHundredDayAverage ?? null,
    avgVolume3Month: quote.averageDailyVolume3Month ?? null,
    avgVolume10Day: quote.averageDailyVolume10Day ?? null,
    dividendRate: quote.trailingAnnualDividendRate ?? null,
    dividendYield: quote.trailingAnnualDividendYield ?? null,
  };
}

/**
 * Build the live equity-quote map keyed by TIKR.
 *
 * Dhan marketfeed/quote provides exchange-fresh LTP + OHLC for ~all TIKRs in
 * data/dhan-eq-instruments-by-tikr.json. Yahoo enriches with 52w/PE/marketCap
 * and serves as fallback for any TIKR Dhan can't price.
 *
 * Exposed for /api/quotes (with auth) and /api/quotes-debug-dhan (no auth).
 */
export async function buildQuotesMap(): Promise<{
  quotes: Record<string, QuoteData>;
  totalRequested: number;
  dhanServed: number;
  yahooServed: number;
  failedTikrs: string[];
}> {
  const db = await import("@/data/database.json");
  const tickerMap: Record<string, string> = (db as any).ticker_map || {};
  const tikrs = Object.keys(tickerMap);
  const dhanMap = dhanByTikr as Record<string, DhanEntry>;

  // ── 1) Dhan: build byExchange payload from TIKRs that have a securityId.
  const byExchange: Record<string, number[]> = {};
  const secIdToTikr: Record<number, string> = {};
  for (const tikr of tikrs) {
    const entry = dhanMap[tikr];
    if (!entry) continue;
    secIdToTikr[entry.securityId] = tikr;
    (byExchange[entry.exchange] ??= []).push(entry.securityId);
  }

  const clientId = process.env.DHAN_CLIENT_ID;
  const accessToken = process.env.DHAN_ACCESS_TOKEN;

  let dhanResults: Record<number, any> = {};
  if (clientId && accessToken && Object.keys(byExchange).length > 0) {
    dhanResults = await fetchDhanQuotes(byExchange, clientId, accessToken);
  } else if (!clientId || !accessToken) {
    console.warn("[quotes] DHAN_CLIENT_ID/ACCESS_TOKEN missing — falling back to Yahoo for all symbols");
  }

  const quotes: Record<string, QuoteData> = {};
  const nowIso = new Date().toISOString();

  for (const [secIdStr, q] of Object.entries(dhanResults)) {
    const secId = Number(secIdStr);
    const tikr = secIdToTikr[secId];
    if (!tikr) continue;
    quotes[tikr] = {
      ...(emptyQuote() as QuoteData),
      price: q.price,
      change: q.change,
      changePct: q.changePct,
      volume: q.volume,
      timestamp: nowIso,
      dayHigh: q.dayHigh,
      dayLow: q.dayLow,
      open: q.open,
      prevClose: q.prevClose,
    };
  }

  // ── 2) Yahoo: for any TIKR Dhan didn't serve, fall back to yahoo-finance2.
  const yahooMissingTikrs = tikrs.filter(t => !quotes[t]);
  const yahooSymbols = yahooMissingTikrs.map(t => tickerMap[t]).filter(Boolean);
  let yahooServed = 0;

  if (yahooSymbols.length > 0) {
    const yahooResults: Record<string, any> = {};
    try {
      const yQuotes: any[] = await yf.quote(yahooSymbols);
      for (const yq of yQuotes) {
        if (yq?.symbol && yq.regularMarketPrice) {
          yahooResults[yq.symbol] = extractYahooQuoteData(yq);
        }
      }
    } catch (err) {
      console.error("[quotes] Yahoo batch fetch failed:", err instanceof Error ? err.message : err);
    }

    // .NS → .BO retry
    const nsFailures = yahooSymbols.filter(s => !yahooResults[s] && s.endsWith(".NS"));
    if (nsFailures.length > 0) {
      const boSymbols = nsFailures.map(s => s.replace(".NS", ".BO"));
      try {
        const bo: any[] = await yf.quote(boSymbols);
        for (const yq of bo) {
          if (yq?.symbol && yq.regularMarketPrice) {
            const ns = yq.symbol.replace(".BO", ".NS");
            yahooResults[ns] = extractYahooQuoteData(yq);
          }
        }
      } catch { /* ignore */ }
    }

    for (const tikr of yahooMissingTikrs) {
      const sym = tickerMap[tikr];
      if (yahooResults[sym]) {
        quotes[tikr] = yahooResults[sym];
        yahooServed++;
      }
    }
  }

  // ── 3) Enrich Dhan-served TIKRs with Yahoo-only fields (52w/PE/marketCap).
  // Best-effort: a single Yahoo batch call. If it fails, Dhan price/change still flow.
  const dhanServedTikrs = Object.keys(quotes).filter(t => quotes[t].fiftyTwoWeekHigh == null);
  if (dhanServedTikrs.length > 0) {
    const enrichSymbols = dhanServedTikrs.map(t => tickerMap[t]).filter(Boolean);
    try {
      const eQuotes: any[] = await yf.quote(enrichSymbols);
      const bySymbol = new Map<string, any>();
      for (const eq of eQuotes) if (eq?.symbol) bySymbol.set(eq.symbol, eq);
      for (const tikr of dhanServedTikrs) {
        const eq = bySymbol.get(tickerMap[tikr]);
        if (!eq) continue;
        const cur = quotes[tikr];
        cur.fiftyTwoWeekHigh = eq.fiftyTwoWeekHigh ?? null;
        cur.fiftyTwoWeekLow = eq.fiftyTwoWeekLow ?? null;
        cur.marketCap = eq.marketCap ?? null;
        cur.trailingPE = eq.trailingPE ?? null;
        cur.forwardPE = eq.forwardPE ?? null;
        cur.priceToBook = eq.priceToBook ?? null;
        cur.epsTrailingTwelveMonths = eq.epsTrailingTwelveMonths ?? null;
        cur.bookValue = eq.bookValue ?? null;
        cur.fiftyDayAverage = eq.fiftyDayAverage ?? null;
        cur.twoHundredDayAverage = eq.twoHundredDayAverage ?? null;
        cur.avgVolume3Month = eq.averageDailyVolume3Month ?? null;
        cur.avgVolume10Day = eq.averageDailyVolume10Day ?? null;
        cur.dividendRate = eq.trailingAnnualDividendRate ?? null;
        cur.dividendYield = eq.trailingAnnualDividendYield ?? null;
      }
    } catch (err) {
      console.warn("[quotes] Yahoo enrichment failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  }

  const failedTikrs = tikrs.filter(t => !quotes[t]);
  return {
    quotes,
    totalRequested: tikrs.length,
    dhanServed: Object.keys(dhanResults).length,
    yahooServed,
    failedTikrs,
  };
}

export async function GET() {
  noStore();
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { quotes, totalRequested, dhanServed, yahooServed, failedTikrs } = await buildQuotesMap();
    if (failedTikrs.length > 0) {
      console.warn(`[quotes] Failed TIKRs (${failedTikrs.length}/${totalRequested}): ${failedTikrs.slice(0, 10).join(", ")}${failedTikrs.length > 10 ? "..." : ""}`);
    }
    console.log(`[quotes] Served Dhan=${dhanServed} Yahoo=${yahooServed} Failed=${failedTikrs.length}/${totalRequested}`);
    reportSuccess("quotes");
    return NextResponse.json({
      quotes,
      fetchedAt: new Date().toISOString(),
      totalFetched: Object.keys(quotes).length,
      totalRequested,
      dhanServed,
      yahooServed,
      failedTikrs,
      failedSymbols: failedTikrs,
    });
  } catch (error: unknown) {
    reportError("quotes");
    console.error("[/api/quotes] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
