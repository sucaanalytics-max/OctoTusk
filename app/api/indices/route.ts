import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import YahooFinance from "yahoo-finance2";
import { OCTOPUS_INDICES } from "@/lib/indices";

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
  value: number | null;
  dayPct: number | null;
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
    const payload = await buildIndicesPayload();
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
