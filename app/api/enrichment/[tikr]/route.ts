import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const yf = new (YahooFinance as any)();

export async function GET(
  _req: NextRequest,
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

  try {
    // Load ticker map to resolve Yahoo symbol
    const db = await import("@/data/database.json");
    const tickerMap: Record<string, string> = (db as any).ticker_map || {};
    const yahooSymbol = tickerMap[tikr];

    if (!yahooSymbol) {
      return NextResponse.json(
        { error: `No Yahoo symbol mapping for tikr: ${tikr}` },
        { status: 404 }
      );
    }

    // Fetch deep data via quoteSummary
    const summary: any = await yf.quoteSummary(yahooSymbol, {
      modules: [
        "defaultKeyStatistics",
        "financialData",
        "recommendationTrend",
        "calendarEvents",
        "earningsTrend",
      ],
    });

    const keyStats = summary?.defaultKeyStatistics || {};
    const financials = summary?.financialData || {};
    const recTrend = summary?.recommendationTrend?.trend?.[0] || {};
    const calendar = summary?.calendarEvents || {};
    const earningsTrend = summary?.earningsTrend?.trend || [];

    // Extract next quarter earnings estimate
    const nextQtrEstimate = earningsTrend.find(
      (t: any) => t.period === "+1q"
    );

    const enrichment = {
      tikr,
      yahooSymbol,
      fetchedAt: new Date().toISOString(),

      // Key Statistics
      beta: keyStats.beta ?? null,
      sharesOutstanding: keyStats.sharesOutstanding ?? null,
      floatShares: keyStats.floatShares ?? null,
      shortRatio: keyStats.shortRatio ?? null,
      pegRatio: keyStats.pegRatio ?? null,
      enterpriseValue: keyStats.enterpriseValue ?? null,
      enterpriseToRevenue: keyStats.enterpriseToRevenue ?? null,
      enterpriseToEbitda: keyStats.enterpriseToEbitda ?? null,
      forwardEps: keyStats.forwardEps ?? null,
      trailingEps: keyStats.trailingEps ?? null,
      priceToSalesTrailing12Months:
        keyStats.priceToSalesTrailing12Months ?? null,

      // Financial Data
      totalRevenue: financials.totalRevenue ?? null,
      revenueGrowth: financials.revenueGrowth ?? null,
      grossMargins: financials.grossMargins ?? null,
      ebitdaMargins: financials.ebitdaMargins ?? null,
      operatingMargins: financials.operatingMargins ?? null,
      profitMargins: financials.profitMargins ?? null,
      operatingCashflow: financials.operatingCashflow ?? null,
      freeCashflow: financials.freeCashflow ?? null,
      totalDebt: financials.totalDebt ?? null,
      totalCash: financials.totalCash ?? null,
      debtToEquity: financials.debtToEquity ?? null,
      returnOnEquity: financials.returnOnEquity ?? null,
      returnOnAssets: financials.returnOnAssets ?? null,
      earningsGrowth: financials.earningsGrowth ?? null,
      revenuePerShare: financials.revenuePerShare ?? null,
      currentRatio: financials.currentRatio ?? null,
      targetMeanPrice: financials.targetMeanPrice ?? null,
      targetHighPrice: financials.targetHighPrice ?? null,
      targetLowPrice: financials.targetLowPrice ?? null,
      numberOfAnalystOpinions: financials.numberOfAnalystOpinions ?? null,
      recommendationKey: financials.recommendationKey ?? null,
      recommendationMean: financials.recommendationMean ?? null,

      // Analyst Recommendations (current month)
      strongBuy: recTrend.strongBuy ?? null,
      buy: recTrend.buy ?? null,
      hold: recTrend.hold ?? null,
      sell: recTrend.sell ?? null,
      strongSell: recTrend.strongSell ?? null,

      // Calendar Events
      earningsDate: calendar.earnings?.earningsDate?.[0] ?? null,
      dividendDate: calendar.dividendDate ?? null,
      exDividendDate: calendar.exDividendDate ?? null,

      // Earnings Estimate (next quarter)
      nextQtrEpsEstimate: nextQtrEstimate?.earningsEstimate?.avg ?? null,
      nextQtrRevenueEstimate:
        nextQtrEstimate?.revenueEstimate?.avg ?? null,
    };

    return NextResponse.json(enrichment, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error: unknown) {
    console.error(`[/api/enrichment/${tikr}] Error:`, error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
