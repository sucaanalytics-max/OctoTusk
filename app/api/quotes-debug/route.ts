import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// TEMPORARY DIAGNOSTIC: no auth, uses yahoo-finance2 the same way /api/quotes does.
// Probes 3 liquid stocks twice to verify response freshness on Vercel.
// Remove once CMP rebuild is verified.
const yf = new (YahooFinance as any)({
  suppressNotices: ["yahooSurvey"],
  fetchOptions: { cache: "no-store" },
});

export async function GET() {
  noStore();
  const symbols = ["MOTILALOFS.NS", "BSE.NS", "RELIANCE.NS"];
  const serverTime = new Date().toISOString();

  try {
    const quotes = await yf.quote(symbols);
    return NextResponse.json({
      serverTime,
      via: "yahoo-finance2",
      quotes: (Array.isArray(quotes) ? quotes : [quotes]).map((q: any) => ({
        symbol: q.symbol,
        price: q.regularMarketPrice,
        regularMarketTime: q.regularMarketTime?.getTime ? Math.floor(q.regularMarketTime.getTime() / 1000) : q.regularMarketTime,
        regularMarketTimeISO: q.regularMarketTime?.toISOString ? q.regularMarketTime.toISOString() : null,
        marketState: q.marketState,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ serverTime, error: err?.message || String(err), stack: err?.stack?.slice(0, 500) }, { status: 500 });
  }
}
