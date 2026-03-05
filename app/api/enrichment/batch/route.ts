import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

// Max tickers per batch to prevent abuse / timeout
const MAX_BATCH_SIZE = 30;
// Concurrency: fetch N at a time to avoid Yahoo rate limits
const CONCURRENCY = 5;

interface EnrichmentResult {
  tikr: string;
  yahooSymbol: string;
  fetchedAt: string;
  beta?: number | null;
  sharesOutstanding?: number | null;
  floatShares?: number | null;
  pegRatio?: number | null;
  enterpriseValue?: number | null;
  enterpriseToEbitda?: number | null;
  totalRevenue?: number | null;
  revenueGrowth?: number | null;
  grossMargins?: number | null;
  ebitdaMargins?: number | null;
  operatingMargins?: number | null;
  profitMargins?: number | null;
  operatingCashflow?: number | null;
  freeCashflow?: number | null;
  totalDebt?: number | null;
  totalCash?: number | null;
  debtToEquity?: number | null;
  returnOnEquity?: number | null;
  returnOnAssets?: number | null;
  earningsGrowth?: number | null;
  currentRatio?: number | null;
  targetMeanPrice?: number | null;
  targetHighPrice?: number | null;
  targetLowPrice?: number | null;
  numberOfAnalystOpinions?: number | null;
  recommendationKey?: string | null;
  recommendationMean?: number | null;
  strongBuy?: number | null;
  buy?: number | null;
  hold?: number | null;
  sell?: number | null;
  strongSell?: number | null;
  earningsDate?: string | null;
  dividendDate?: string | null;
  exDividendDate?: string | null;
  nextQtrEpsEstimate?: number | null;
}

async function fetchOne(
  tikr: string,
  yahooSymbol: string
): Promise<EnrichmentResult | null> {
  try {
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
    const nextQtrEstimate = earningsTrend.find(
      (t: any) => t.period === "+1q"
    );

    return {
      tikr,
      yahooSymbol,
      fetchedAt: new Date().toISOString(),
      beta: keyStats.beta ?? null,
      sharesOutstanding: keyStats.sharesOutstanding ?? null,
      floatShares: keyStats.floatShares ?? null,
      pegRatio: keyStats.pegRatio ?? null,
      enterpriseValue: keyStats.enterpriseValue ?? null,
      enterpriseToEbitda: keyStats.enterpriseToEbitda ?? null,
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
      currentRatio: financials.currentRatio ?? null,
      targetMeanPrice: financials.targetMeanPrice ?? null,
      targetHighPrice: financials.targetHighPrice ?? null,
      targetLowPrice: financials.targetLowPrice ?? null,
      numberOfAnalystOpinions: financials.numberOfAnalystOpinions ?? null,
      recommendationKey: financials.recommendationKey ?? null,
      recommendationMean: financials.recommendationMean ?? null,
      strongBuy: recTrend.strongBuy ?? null,
      buy: recTrend.buy ?? null,
      hold: recTrend.hold ?? null,
      sell: recTrend.sell ?? null,
      strongSell: recTrend.strongSell ?? null,
      earningsDate: calendar.earnings?.earningsDate?.[0] ?? null,
      dividendDate: calendar.dividendDate ?? null,
      exDividendDate: calendar.exDividendDate ?? null,
      nextQtrEpsEstimate: nextQtrEstimate?.earningsEstimate?.avg ?? null,
    };
  } catch (err) {
    console.error(`[batch-enrichment] ${tikr} (${yahooSymbol}) failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// Process in batches of CONCURRENCY
async function fetchBatch(
  pairs: { tikr: string; yahooSymbol: string }[]
): Promise<Record<string, EnrichmentResult>> {
  const results: Record<string, EnrichmentResult> = {};

  for (let i = 0; i < pairs.length; i += CONCURRENCY) {
    const chunk = pairs.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((p) => fetchOne(p.tikr, p.yahooSymbol))
    );
    for (const res of settled) {
      if (res.status === "fulfilled" && res.value) {
        results[res.value.tikr] = res.value;
      }
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const tikrs: string[] = body.tikrs;

    if (!Array.isArray(tikrs) || tikrs.length === 0) {
      return NextResponse.json(
        { error: "Request body must include a non-empty 'tikrs' array" },
        { status: 400 }
      );
    }

    // Validate and cap
    const cleanTikrs = tikrs
      .filter((t) => typeof t === "string" && /^[a-zA-Z0-9._:-]+$/.test(t))
      .slice(0, MAX_BATCH_SIZE);

    if (cleanTikrs.length === 0) {
      return NextResponse.json(
        { error: "No valid tickers provided" },
        { status: 400 }
      );
    }

    // Load ticker map
    const db = await import("@/data/database.json");
    const tickerMap: Record<string, string> = (db as any).ticker_map || {};

    // Resolve Yahoo symbols
    const pairs = cleanTikrs
      .map((tikr) => ({ tikr, yahooSymbol: tickerMap[tikr] }))
      .filter((p) => p.yahooSymbol);

    if (pairs.length === 0) {
      return NextResponse.json(
        { error: "No valid Yahoo symbol mappings found" },
        { status: 404 }
      );
    }

    const enrichments = await fetchBatch(pairs);

    return NextResponse.json(
      {
        enrichments,
        fetchedAt: new Date().toISOString(),
        totalRequested: cleanTikrs.length,
        totalFetched: Object.keys(enrichments).length,
        totalFailed: pairs.length - Object.keys(enrichments).length,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: unknown) {
    console.error(
      "[/api/enrichment/batch] Error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
