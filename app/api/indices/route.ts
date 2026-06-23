import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import YahooFinance from "yahoo-finance2";
import { OCTOPUS_INDICES, OCTOPUS_STRIP_INDICES, OCTOPUS_STRIP_COMMODITIES } from "@/lib/indices";
import { fetchMcxQuotes } from "@/lib/commodities";
import mcx from "@/data/mcx-commodities.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Token-gated NSE index strip for the Octopus wall display.
 *
 * Yahoo-only (Dhan does not carry these symbols). Tries primary symbol per
 * index, falls back if the response lacks regularMarketPrice. Cached for 45s.
 */

const CACHE_TTL_MS = 45 * 1000;

const yf = new (YahooFinance as any)({
  suppressNotices: ["yahooSurvey"],
  fetchOptions: { cache: "no-store" },
});

export interface IndexTick {
  label: string;
  value: number | null;   // index value, or commodity USD price
  dayPct: number | null;  // index / commodity-USD day %
  // Commodity-only (omitted for plain indices):
  inr?: number | null;
  inrPct?: number | null;
  usdUnit?: string;
  inrUnit?: string | null;
}

interface IndicesPayload {
  indices: IndexTick[];
  fetchedAt: string;
}

let cached: { payload: IndicesPayload; expiresAt: number } | null = null;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function configError(detail: string) {
  return NextResponse.json({ error: "Server misconfigured", detail }, { status: 503 });
}

async function fetchYahooBatch(symbols: string[]): Promise<Record<string, any>> {
  if (!symbols.length) return {};
  try {
    const results: any[] = await yf.quote(symbols);
    const out: Record<string, any> = {};
    for (const r of results ?? []) if (r?.symbol) out[r.symbol] = r;
    return out;
  } catch (err) {
    console.warn("[indices] Yahoo batch failed:", err instanceof Error ? err.message : err);
    return {};
  }
}

// Exposed for /api/indices (token-gated GET) and the hourly Telegram
// indices push in /api/alerts/check.
export async function buildIndicesPayload(): Promise<IndicesPayload> {
  const primaries = OCTOPUS_INDICES.map((i) => i.primary);
  const got = await fetchYahooBatch(primaries);

  const fallbackNeeded: { idx: number; sym: string }[] = [];
  OCTOPUS_INDICES.forEach((cfg, i) => {
    const p = got[cfg.primary];
    if ((!p || typeof p.regularMarketPrice !== "number") && cfg.fallback) {
      fallbackNeeded.push({ idx: i, sym: cfg.fallback });
    }
  });

  const fallbackGot = await fetchYahooBatch(fallbackNeeded.map((f) => f.sym));

  const indices: IndexTick[] = OCTOPUS_INDICES.map((cfg, i) => {
    let q = got[cfg.primary];
    if ((!q || typeof q.regularMarketPrice !== "number") && cfg.fallback) {
      q = fallbackGot[cfg.fallback];
    }
    const value = q && typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null;
    const dayPct =
      q && typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null;
    return { label: cfg.label, value, dayPct };
  });

  return { indices, fetchedAt: new Date().toISOString() };
}

// Exposed for the /api/indices GET (the wall display only). Expanded set: all NIFTY
// indices + commodities (USD via Yahoo futures, INR via Dhan MCX front-month). Kept
// SEPARATE from buildIndicesPayload() so the frozen Telegram pipeline that slices that
// function's output positionally is unaffected.
export async function buildStripPayload(): Promise<IndicesPayload> {
  const indexPrimaries = OCTOPUS_STRIP_INDICES.map((i) => i.primary);
  const usdSymbols = OCTOPUS_STRIP_COMMODITIES.map((c) => c.usdSymbol);
  const got = await fetchYahooBatch([...indexPrimaries, ...usdSymbols]);

  // Index fallbacks (commodities have none).
  const fallbackNeeded: string[] = [];
  for (const cfg of OCTOPUS_STRIP_INDICES) {
    const p = got[cfg.primary];
    if ((!p || typeof p.regularMarketPrice !== "number") && cfg.fallback) fallbackNeeded.push(cfg.fallback);
  }
  const fallbackGot = await fetchYahooBatch(fallbackNeeded);

  const indexTicks: IndexTick[] = OCTOPUS_STRIP_INDICES.map((cfg) => {
    let q = got[cfg.primary];
    if ((!q || typeof q.regularMarketPrice !== "number") && cfg.fallback) q = fallbackGot[cfg.fallback];
    const value = q && typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null;
    const dayPct = q && typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null;
    return { label: cfg.label, value, dayPct };
  });

  // INR leg (Dhan MCX) — only for commodities whose mcxKey is present in the JSON.
  const mcxMap = mcx as unknown as Record<string, { securityId: number } | undefined>;
  const idByLabel = new Map<string, number>();
  for (const c of OCTOPUS_STRIP_COMMODITIES) {
    const entry = c.mcxKey ? mcxMap[c.mcxKey] : undefined;
    if (entry?.securityId) idByLabel.set(c.label, entry.securityId);
  }
  const mcxQuotes = await fetchMcxQuotes(Array.from(idByLabel.values()));

  const commodityTicks: IndexTick[] = OCTOPUS_STRIP_COMMODITIES.map((c) => {
    const u = got[c.usdSymbol];
    const value = u && typeof u.regularMarketPrice === "number" ? u.regularMarketPrice : null;
    const dayPct = u && typeof u.regularMarketChangePercent === "number" ? u.regularMarketChangePercent : null;
    const secId = idByLabel.get(c.label);
    const m = secId != null ? mcxQuotes[secId] : undefined;
    return {
      label: c.label,
      value,
      dayPct,
      inr: m?.ltp ?? null,
      inrPct: m?.pct ?? null,
      usdUnit: c.usdUnit,
      inrUnit: c.inrUnit ?? null,
    };
  });

  return { indices: [...indexTicks, ...commodityTicks], fetchedAt: new Date().toISOString() };
}

export async function GET(request: Request) {
  noStore();

  const expected = process.env.OCTOPUS_DISPLAY_TOKEN;
  if (!expected) return configError("OCTOPUS_DISPLAY_TOKEN is not set");

  const url = new URL(request.url);
  const provided = url.searchParams.get("token") ?? request.headers.get("x-octopus-token");
  if (provided !== expected) return unauthorized();

  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, { headers: { "x-cache": "HIT" } });
  }

  try {
    const payload = await buildStripPayload();
    cached = { payload, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(payload, { headers: { "x-cache": "MISS" } });
  } catch (err) {
    console.error("[indices] build failed:", err instanceof Error ? err.message : err);
    if (cached) {
      return NextResponse.json(cached.payload, { headers: { "x-cache": "STALE" } });
    }
    return NextResponse.json({ error: "Upstream failure" }, { status: 502 });
  }
}
