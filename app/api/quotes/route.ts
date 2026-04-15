import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { auth } from "@/auth";
import { reportError, reportSuccess } from "@/lib/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// yahoo-finance2 v3 requires constructor
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = await import("@/data/database.json");
    const tickerMap: Record<string, string> = (db as any).ticker_map || {};
    const symbols = Array.from(new Set(Object.values(tickerMap)));

    // Batch-fetch all symbols in a single API call (avoids rate-limiting)
    const results: Record<string, any> = {};
    const failedSymbols: string[] = [];

    try {
      const quotes: any[] = await yf.quote(symbols);
      for (const q of quotes) {
        if (q?.symbol && q.regularMarketPrice) {
          results[q.symbol] = extractQuoteData(q);
        }
      }
    } catch (err) {
      console.error("[quotes] Batch fetch failed:", err instanceof Error ? err.message : err);
    }

    // Identify failed symbols and retry .NS → .BO fallback
    const succeeded = new Set(Object.keys(results));
    const nsFailures = symbols.filter(s => !succeeded.has(s) && s.endsWith(".NS"));

    if (nsFailures.length > 0) {
      const boSymbols = nsFailures.map(s => s.replace(".NS", ".BO"));
      try {
        const boQuotes: any[] = await yf.quote(boSymbols);
        for (const q of boQuotes) {
          if (q?.symbol && q.regularMarketPrice) {
            // Map back to original .NS symbol key
            const nsSymbol = q.symbol.replace(".BO", ".NS");
            results[nsSymbol] = extractQuoteData(q);
            console.log(`[quotes] ${nsSymbol} failed, using ${q.symbol} instead`);
          }
        }
      } catch { /* .BO batch also failed */ }
    }

    // Collect final failures
    for (const s of symbols) {
      if (!results[s]) failedSymbols.push(s);
    }

    // Map back to TIKR tickers
    const quotesMap: Record<string, any> = {};
    const failedTikrs: string[] = [];
    for (const [tikr, yahooSymbol] of Object.entries(tickerMap)) {
      if (results[yahooSymbol]) {
        quotesMap[tikr] = results[yahooSymbol];
      } else {
        failedTikrs.push(tikr);
      }
    }

    if (failedSymbols.length > 0) {
      console.warn(`[quotes] Failed symbols (${failedSymbols.length}/${symbols.length}): ${failedSymbols.join(", ")}`);
    }

    reportSuccess("quotes");
    return NextResponse.json({
      quotes: quotesMap,
      fetchedAt: new Date().toISOString(),
      totalFetched: Object.keys(quotesMap).length,
      totalRequested: symbols.length,
      failedSymbols,
      failedTikrs,
    });
  } catch (error: unknown) {
    reportError("quotes");
    console.error("[/api/quotes] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function extractQuoteData(quote: any) {
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
