import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const yf = new (YahooFinance as any)();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tikr: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tikr } = await params;

  // Input validation: allow only alphanumeric, dots, hyphens, colons
  if (!/^[a-zA-Z0-9._:-]+$/.test(tikr)) {
    return NextResponse.json({ error: "Invalid ticker format" }, { status: 400 });
  }

  const range = req.nextUrl.searchParams.get("range") || "1mo";

  // Validate range parameter
  const validRanges = ["1mo", "3mo", "6mo", "1y", "3y", "5y"];
  if (!validRanges.includes(range)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }

  try {
    const db = await import("@/data/database.json");
    const tickerMap: Record<string, string> = (db as any).ticker_map || {};
    const yahooSymbol = tickerMap[tikr];

    if (!yahooSymbol) {
      return NextResponse.json(
        { error: `No Yahoo symbol mapping for tikr: ${tikr}` },
        { status: 404 }
      );
    }

    // Map range to yahoo-finance2 chart params
    const rangeMap: Record<string, { period1: string; interval: string }> = {
      "1mo": {
        period1: new Date(Date.now() - 32 * 86400000)
          .toISOString()
          .split("T")[0],
        interval: "1d",
      },
      "3mo": {
        period1: new Date(Date.now() - 95 * 86400000)
          .toISOString()
          .split("T")[0],
        interval: "1d",
      },
      "6mo": {
        period1: new Date(Date.now() - 185 * 86400000)
          .toISOString()
          .split("T")[0],
        interval: "1wk",
      },
      "1y": {
        period1: new Date(Date.now() - 370 * 86400000)
          .toISOString()
          .split("T")[0],
        interval: "1wk",
      },
      "3y": {
        period1: new Date(Date.now() - 3 * 365 * 86400000)
          .toISOString()
          .split("T")[0],
        interval: "1mo",
      },
      "5y": {
        period1: new Date(Date.now() - 5 * 365 * 86400000)
          .toISOString()
          .split("T")[0],
        interval: "1mo",
      },
    };

    const opts = rangeMap[range] || rangeMap["1mo"];

    const result: any = await yf.chart(yahooSymbol, {
      period1: opts.period1,
      interval: opts.interval,
    });

    const quotes = result?.quotes || [];

    const chartData = quotes
      .filter((q: any) => q.close != null)
      .map((q: any) => ({
        date: q.date
          ? new Date(q.date).toISOString().split("T")[0]
          : null,
        open: q.open ?? null,
        high: q.high ?? null,
        low: q.low ?? null,
        close: q.close ?? null,
        volume: q.volume ?? null,
      }));

    return NextResponse.json(
      {
        tikr,
        yahooSymbol,
        range,
        interval: opts.interval,
        data: chartData,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      }
    );
  } catch (error: unknown) {
    console.error(`[/api/chart/${tikr}] Error:`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
