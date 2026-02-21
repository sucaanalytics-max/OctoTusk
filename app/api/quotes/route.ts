import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Load ticker map from database
    const db = await import("@/data/database.json");
    const tickerMap: Record<string, string> = (db as any).ticker_map || {};

    // Get unique Yahoo Finance symbols
    const symbols = Array.from(new Set(Object.values(tickerMap)));

    // Batch fetch quotes
    const results: Record<string, any> = {};
    const batchSize = 20;

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);

      const promises = batch.map(async (symbol: string) => {
        try {
          const quote: any = await yahooFinance.quote(symbol);
          return {
            symbol,
            data: {
              price: quote.regularMarketPrice || 0,
              change: quote.regularMarketChange || 0,
              changePct: quote.regularMarketChangePercent || 0,
              volume: quote.regularMarketVolume || 0,
              timestamp: new Date().toISOString(),
            },
          };
        } catch {
          return { symbol, data: null };
        }
      });

      const batchResults = await Promise.allSettled(promises);
      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value) {
          results[result.value.symbol] = result.value.data;
        }
      }
    }

    // Map back to TIKR tickers
    const quotes: Record<string, any> = {};
    for (const [tikr, yahooSymbol] of Object.entries(tickerMap)) {
      if (results[yahooSymbol]) {
        quotes[tikr] = results[yahooSymbol];
      }
    }

    return NextResponse.json({
      quotes,
      fetchedAt: new Date().toISOString(),
      totalFetched: Object.keys(quotes).length,
      totalRequested: symbols.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
