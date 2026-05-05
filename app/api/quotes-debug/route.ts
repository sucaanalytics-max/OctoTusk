import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// TEMPORARY DIAGNOSTIC: no auth, probes Yahoo Finance directly to verify response freshness.
// Remove once CMP rebuild is verified.
export async function GET() {
  noStore();
  const symbols = ["MOTILALOFS.NS", "BSE.NS", "RELIANCE.NS"];
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}`;
  const serverTime = new Date().toISOString();

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    return NextResponse.json({
      serverTime,
      yahooStatus: res.status,
      yahooHeaders: {
        cacheControl: res.headers.get("cache-control"),
        age: res.headers.get("age"),
        date: res.headers.get("date"),
        xCache: res.headers.get("x-cache"),
      },
      rawSnippet: data ? null : text.slice(0, 300),
      quotes: (data?.quoteResponse?.result ?? []).map((q: any) => ({
        symbol: q.symbol,
        price: q.regularMarketPrice,
        regularMarketTime: q.regularMarketTime,
        regularMarketTimeISO: q.regularMarketTime ? new Date(q.regularMarketTime * 1000).toISOString() : null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ serverTime, error: err?.message || String(err) }, { status: 500 });
  }
}
