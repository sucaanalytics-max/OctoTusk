import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { buildQuotesMap } from "../quotes/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// TEMPORARY DIAGNOSTIC: no auth. Returns the same payload as /api/quotes
// so we can verify the Dhan-backed pipeline returns fresh prices via two
// curls 60s apart. Remove after CMP rebuild is verified.
export async function GET() {
  noStore();
  const serverTime = new Date().toISOString();
  try {
    const { quotes, totalRequested, dhanServed, yahooServed, failedTikrs } = await buildQuotesMap();
    // Slim sample for easy diff: 5 liquid tickers
    const sampleTikrs = ["Reliance Industries", "BSE Ltd", "Motilal Oswal Financial", "MCX", "Smartworks"];
    const sample: Record<string, any> = {};
    for (const t of sampleTikrs) if (quotes[t]) sample[t] = quotes[t];
    return NextResponse.json({
      serverTime,
      totalRequested,
      totalFetched: Object.keys(quotes).length,
      dhanServed,
      yahooServed,
      failedTikrs,
      sample,
    });
  } catch (err: any) {
    return NextResponse.json({ serverTime, error: err?.message || String(err) }, { status: 500 });
  }
}
