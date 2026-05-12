import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { buildQuotesMap } from "../quotes/route";
import { getSectorInfo } from "@/lib/sectors";
import database from "@/data/database.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Token-gated quote feed for the Octopus wall display.
 *
 * Returns ONLY the fields the wall display needs: tikr, name, sector, day %.
 * No portfolio fields (holdings, P&L, conviction, targets, ...). If the
 * display token ever leaks, no sensitive data leaves the building.
 *
 * Cached server-side for 45s — the client polls every 60s; cache avoids
 * doubling Dhan/Yahoo load when multiple displays are deployed later.
 */

const CACHE_TTL_MS = 45 * 1000;

interface OctopusFeedStock {
  tikr: string;
  name: string;
  sector: string;
  subsector: string;
  dayPct: number | null;
  bearUpside: number | null;
  baseUpside: number | null;
  bullUpside: number | null;
  oneYearUpside: number | null;
}

interface OctopusFeedPayload {
  stocks: OctopusFeedStock[];
  fetchedAt: string;
}

let cached: { payload: OctopusFeedPayload; expiresAt: number } | null = null;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function configError(detail: string) {
  return NextResponse.json({ error: "Server misconfigured", detail }, { status: 503 });
}

interface DbStock {
  tikr: string;
  official_name?: string;
  sector?: string;
  subsector?: string;
  upside_bear?: number;
  upside_base?: number;
  upside_bull?: number;
  upside_1y?: number;
}

function pickUpside(n: unknown): number | null {
  return typeof n === "number" && isFinite(n) ? n : null;
}

async function buildPayload(): Promise<OctopusFeedPayload> {
  const { quotes } = await buildQuotesMap();
  const stocks: DbStock[] = (database as any).stocks ?? [];

  const out: OctopusFeedStock[] = stocks.map((s) => {
    const q = quotes[s.tikr];
    const info = getSectorInfo(s.tikr, { sector: s.sector, subsector: s.subsector });
    return {
      tikr: s.tikr,
      name: s.official_name ?? s.tikr,
      sector: info.sector,
      subsector: info.subsector,
      dayPct: q && typeof q.changePct === "number" ? q.changePct : null,
      bearUpside: pickUpside(s.upside_bear),
      baseUpside: pickUpside(s.upside_base),
      bullUpside: pickUpside(s.upside_bull),
      oneYearUpside: pickUpside(s.upside_1y),
    };
  });

  return { stocks: out, fetchedAt: new Date().toISOString() };
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
    return NextResponse.json(cached.payload, {
      headers: { "x-cache": "HIT" },
    });
  }

  try {
    const payload = await buildPayload();
    cached = { payload, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(payload, { headers: { "x-cache": "MISS" } });
  } catch (err) {
    console.error("[octopus-feed] build failed:", err instanceof Error ? err.message : err);
    if (cached) {
      // Serve stale rather than blanking the wall display.
      return NextResponse.json(cached.payload, {
        headers: { "x-cache": "STALE" },
      });
    }
    return NextResponse.json({ error: "Upstream failure" }, { status: 502 });
  }
}
