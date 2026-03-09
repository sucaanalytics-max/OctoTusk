import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { auth } from "@/auth";
import { reportError, reportSuccess } from "@/lib/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// yahoo-finance2 v3 requires constructor
const yf = new (YahooFinance as any)();

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = await import("@/data/database.json");
    const tickerMap: Record<string, string> = (db as any).ticker_map || {};
    const symbols = Array.from(new Set(Object.values(tickerMap)));

    const results: Record<string, any> = {};
    const failedSymbols: string[] = [];
    const batchSize = 20;

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);

      const promises = batch.map(async (symbol: string) => {
        try {
          const quote: any = await yf.quote(symbol);
          if (!quote || !quote.regularMarketPrice) {
            // Try .BO suffix as fallback if .NS fails
            if (symbol.endsWith(".NS")) {
              const boSymbol = symbol.replace(".NS", ".BO");
              try {
                const boQuote: any = await yf.quote(boSymbol);
                if (boQuote?.regularMarketPrice) {
                  console.log(`[quotes] ${symbol} failed, using ${boSymbol} instead`);
                  return { symbol, data: extractQuoteData(boQuote), fallback: boSymbol };
                }
              } catch { /* .BO also failed */ }
            }
            return { symbol, data: null, error: "No price data returned" };
          }
          return { symbol, data: extractQuoteData(quote) };
        } catch (err) {
          // Try .BO suffix as fallback if .NS fails
          if (symbol.endsWith(".NS")) {
            const boSymbol = symbol.replace(".NS", ".BO");
            try {
              const boQuote: any = await yf.quote(boSymbol);
              if (boQuote?.regularMarketPrice) {
                console.log(`[quotes] ${symbol} errored, using ${boSymbol} instead`);
                return { symbol, data: extractQuoteData(boQuote), fallback: boSymbol };
              }
            } catch { /* .BO also failed */ }
          }
          return { symbol, data: null, error: err instanceof Error ? err.message : "Unknown error" };
        }
      });

      const batchResults = await Promise.allSettled(promises);
      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          if (result.value?.data) {
            results[result.value.symbol] = result.value.data;
          } else {
            failedSymbols.push(result.value.symbol);
          }
        }
      }
    }

    // Map back to TIKR tickers
    const quotes: Record<string, any> = {};
    const failedTikrs: string[] = [];
    for (const [tikr, yahooSymbol] of Object.entries(tickerMap)) {
      if (results[yahooSymbol]) {
        quotes[tikr] = results[yahooSymbol];
      } else {
        failedTikrs.push(tikr);
      }
    }

    if (failedSymbols.length > 0) {
      console.warn(`[quotes] Failed symbols (${failedSymbols.length}/${symbols.length}): ${failedSymbols.join(", ")}`);
    }

    reportSuccess("quotes");
    return NextResponse.json({
      quotes,
      fetchedAt: new Date().toISOString(),
      totalFetched: Object.keys(quotes).length,
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
