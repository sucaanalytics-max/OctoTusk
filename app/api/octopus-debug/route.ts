import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import YahooFinance from "yahoo-finance2";
import database from "@/data/database.json";
import dhanByTikr from "@/data/dhan-eq-instruments-by-tikr.json";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Per-TIKR diagnostic for /octopus feed. Reports what Dhan + Yahoo
 * returned for every ticker so we can see exactly where each stock
 * fails. Token-gated identically to /api/octopus-feed.
 *
 * Usage:
 *   /api/octopus-debug?token=XYZ              — all TIKRs
 *   /api/octopus-debug?token=XYZ&tikr=GROWW   — single TIKR
 *   /api/octopus-debug?token=XYZ&only=failing — only TIKRs with no quote
 */

const yf = new (YahooFinance as any)({
  suppressNotices: ["yahooSurvey"],
  fetchOptions: { cache: "no-store" },
});

type DhanEntry = { securityId: number; exchange: string };

interface PerTikr {
  tikr: string;
  yahooSymbol: string | null;
  dhan: {
    inMap: boolean;
    securityId: number | null;
    exchange: string | null;
    inResponse: boolean;
    lastPrice: number | null;
    rawSnippet: Record<string, unknown> | null;
  };
  yahoo: {
    attempted: boolean;
    foundInBatch: boolean;
    regularMarketPrice: number | null;
    regularMarketChangePercent: number | null;
    rawError: string | null;
  };
  resolvedPrice: number | null;
}

function pickDhanInfo(rawData: unknown, secId: number): Record<string, unknown> | null {
  if (!rawData || typeof rawData !== "object") return null;
  for (const segData of Object.values(rawData as Record<string, unknown>)) {
    if (!segData || typeof segData !== "object") continue;
    const info = (segData as Record<string, unknown>)[String(secId)];
    if (info && typeof info === "object") return info as Record<string, unknown>;
  }
  return null;
}

export async function GET(request: Request) {
  noStore();
  const expected = process.env.OCTOPUS_DISPLAY_TOKEN;
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("token") ?? request.headers.get("x-octopus-token");

  // Accept EITHER the display token (for programmatic / wall-display use)
  // OR a valid NextAuth session (for browsing the report in your browser).
  const tokenOk = !!expected && provided === expected;
  let sessionOk = false;
  if (!tokenOk) {
    try {
      const session = await auth();
      sessionOk = !!session?.user;
    } catch {
      sessionOk = false;
    }
  }
  if (!tokenOk && !sessionOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tickerMap: Record<string, string> = (database as any).ticker_map || {};
  const dhanMap = dhanByTikr as Record<string, DhanEntry>;

  const tikrFilter = url.searchParams.get("tikr");
  const onlyFailing = url.searchParams.get("only") === "failing";
  const allTikrs = Object.keys(tickerMap);
  const tikrs = tikrFilter ? [tikrFilter] : allTikrs;

  const clientId = process.env.DHAN_CLIENT_ID;
  const accessToken = process.env.DHAN_ACCESS_TOKEN;
  const dhanConfigured = !!clientId && !!accessToken;

  // ── Single batched Dhan call ──────────────────────────────────────────
  const byExchange: Record<string, number[]> = {};
  for (const t of tikrs) {
    const e = dhanMap[t];
    if (!e) continue;
    (byExchange[e.exchange] ??= []).push(e.securityId);
  }

  let dhanRawData: unknown = null;
  let dhanError: string | null = null;
  let dhanHttpStatus: number | null = null;

  if (dhanConfigured && Object.keys(byExchange).length > 0) {
    try {
      const res = await fetch("https://api.dhan.co/v2/marketfeed/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "client-id": clientId!,
          "access-token": accessToken!,
        },
        body: JSON.stringify(byExchange),
        cache: "no-store",
      });
      dhanHttpStatus = res.status;
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        dhanError = `HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`;
      } else {
        dhanRawData = (json as any)?.data ?? null;
      }
    } catch (e: any) {
      dhanError = e?.message ?? String(e);
    }
  }

  // ── Single batched Yahoo call ─────────────────────────────────────────
  const yahooSymbols = tikrs.map((t) => tickerMap[t]).filter(Boolean);
  let yahooBatch: any[] = [];
  let yahooError: string | null = null;
  if (yahooSymbols.length > 0) {
    try {
      const result = await yf.quote(yahooSymbols);
      yahooBatch = Array.isArray(result) ? result : [result];
    } catch (e: any) {
      yahooError = e?.message ?? String(e);
    }
  }
  const yahooBySymbol = new Map<string, any>();
  for (const q of yahooBatch) {
    if (q?.symbol) yahooBySymbol.set(q.symbol, q);
  }

  // ── Yahoo .BO retry for .NS failures ──────────────────────────────────
  const nsFailures = yahooSymbols.filter(
    (s) => s.endsWith(".NS") && !yahooBySymbol.has(s)
  );
  if (nsFailures.length > 0) {
    try {
      const boSymbols = nsFailures.map((s) => s.replace(".NS", ".BO"));
      const result = await yf.quote(boSymbols);
      const batch = Array.isArray(result) ? result : [result];
      for (const q of batch) {
        if (q?.symbol && typeof q.regularMarketPrice === "number") {
          const ns = String(q.symbol).replace(".BO", ".NS");
          yahooBySymbol.set(ns, q);
        }
      }
    } catch {
      // best-effort
    }
  }

  // ── Build per-TIKR diagnostic ────────────────────────────────────────
  const results: PerTikr[] = tikrs.map((t) => {
    const yahooSymbol = tickerMap[t] ?? null;
    const dhanEntry = dhanMap[t] ?? null;
    const rawSnippet = dhanEntry
      ? pickDhanInfo(dhanRawData, dhanEntry.securityId)
      : null;
    const dhanLastPrice =
      rawSnippet && typeof rawSnippet["last_price"] === "number"
        ? (rawSnippet["last_price"] as number)
        : null;
    const yQuote = yahooSymbol ? yahooBySymbol.get(yahooSymbol) : undefined;

    return {
      tikr: t,
      yahooSymbol,
      dhan: {
        inMap: !!dhanEntry,
        securityId: dhanEntry?.securityId ?? null,
        exchange: dhanEntry?.exchange ?? null,
        inResponse: !!rawSnippet,
        lastPrice: dhanLastPrice,
        rawSnippet,
      },
      yahoo: {
        attempted: !!yahooSymbol,
        foundInBatch: !!yQuote,
        regularMarketPrice:
          yQuote && typeof yQuote.regularMarketPrice === "number"
            ? yQuote.regularMarketPrice
            : null,
        regularMarketChangePercent:
          yQuote && typeof yQuote.regularMarketChangePercent === "number"
            ? yQuote.regularMarketChangePercent
            : null,
        rawError: null,
      },
      resolvedPrice:
        dhanLastPrice ??
        (yQuote && typeof yQuote.regularMarketPrice === "number"
          ? yQuote.regularMarketPrice
          : null),
    };
  });

  // ── Cross-check: which Supabase stocks (the actual feed input) end up
  //    with no resolved price after the ticker_map lookup? This catches
  //    bugs where Dhan + Yahoo are perfectly healthy but the Supabase
  //    TIKR string doesn't match any ticker_map key (silent miss). ─────
  const resolvedByTikr = new Map(results.map((r) => [r.tikr, r.resolvedPrice]));
  type SupabaseStock = { tikr?: string; official_name?: string; cmp?: number };
  let supabaseStocks: SupabaseStock[] = [];
  let supabaseError: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      const result = await getSupabase()
        .from("sync_snapshot")
        .select("stocks")
        .eq("id", 1)
        .single();
      if (!result.error && result.data) {
        const data = result.data as { stocks?: unknown };
        if (Array.isArray(data.stocks)) supabaseStocks = data.stocks as SupabaseStock[];
      } else if (result.error) {
        supabaseError = result.error.message ?? "unknown";
      }
    } catch (e: any) {
      supabaseError = e?.message ?? String(e);
    }
  } else {
    supabaseError = "supabase-not-configured";
  }

  const supabaseTikrs = supabaseStocks
    .map((s) => (typeof s.tikr === "string" ? s.tikr : ""))
    .filter(Boolean);
  const supabaseMisses = supabaseTikrs
    .filter((t) => resolvedByTikr.get(t) == null)
    .map((t) => ({
      tikr: t,
      inTickerMap: tickerMap[t] != null,
      yahooSymbolIfMapped: tickerMap[t] ?? null,
      snapshotCmp:
        typeof supabaseStocks.find((s) => s.tikr === t)?.cmp === "number"
          ? (supabaseStocks.find((s) => s.tikr === t)!.cmp as number)
          : null,
      // Did the feed succeed for a DIFFERENT key that looks similar?
      // (Helps spot casing / suffix mismatches.)
      similarMappedKeys: Object.keys(tickerMap).filter(
        (k) =>
          k !== t &&
          (k.toLowerCase().includes(t.toLowerCase()) ||
            t.toLowerCase().includes(k.toLowerCase()))
      ),
    }));

  const filtered = onlyFailing
    ? results.filter((r) => r.resolvedPrice == null)
    : results;

  const dhanServedCount = results.filter((r) => r.dhan.lastPrice != null).length;
  const yahooServedCount = results.filter(
    (r) => r.dhan.lastPrice == null && r.yahoo.regularMarketPrice != null
  ).length;
  const unresolvedTikrs = results
    .filter((r) => r.resolvedPrice == null)
    .map((r) => r.tikr);
  console.log(
    `[octopus-debug] total=${results.length} dhan=${dhanServedCount} yahoo=${yahooServedCount} ` +
      `unresolved=${unresolvedTikrs.length} supabase=${supabaseTikrs.length} ` +
      `supabaseMisses=${supabaseMisses.length} dhanStatus=${dhanHttpStatus ?? "skipped"} ` +
      `dhanErr=${dhanError ?? "none"} yahooErr=${yahooError ?? "none"}`
  );

  return NextResponse.json({
    config: {
      totalTikrs: tikrs.length,
      dhanConfigured,
      dhanHttpStatus,
      dhanError,
      yahooError,
      supabaseError,
    },
    summary: {
      total: results.length,
      dhanServed: results.filter((r) => r.dhan.lastPrice != null).length,
      yahooServed: results.filter(
        (r) =>
          r.dhan.lastPrice == null &&
          r.yahoo.regularMarketPrice != null
      ).length,
      unresolved: results.filter((r) => r.resolvedPrice == null).length,
      unresolvedTikrs: results
        .filter((r) => r.resolvedPrice == null)
        .map((r) => r.tikr),
      supabaseStockCount: supabaseTikrs.length,
      supabaseMissCount: supabaseMisses.length,
    },
    /* The real bug surface: Supabase TIKRs that the feed will fail to
       resolve because no ticker_map key matches the string exactly. */
    supabaseMisses,
    results: filtered,
    fetchedAt: new Date().toISOString(),
  });
}
