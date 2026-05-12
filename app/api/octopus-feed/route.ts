import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { buildQuotesMap } from "../quotes/route";
import { getSector } from "@/lib/sectors";
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
  dayPct: number | null;
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

async function buildPayload(): Promise<OctopusFeedPayload> {
  const { quotes } = await buildQuotesMap();
  const stocks: { tikr: string; official_name?: string }[] = (database as any).stocks ?? [];

  const out: OctopusFeedStock[] = stocks.map((s) => {
    const q = quotes[s.tikr];
    return {
      tikr: s.tikr,
      name: s.official_name ?? s.tikr,
      sector: getSector(s.tikr),
      dayPct: q && typeof q.changePct === "number" ? q.changePct : null,
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
