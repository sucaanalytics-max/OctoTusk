import { NextResponse } from "next/server";
import { errorCounts, lastSuccess } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — Public health check endpoint (no auth required)
 * Returns: app status, uptime, dependency checks, last sync timestamp
 */

const startedAt = Date.now();

export async function GET() {
  const now = Date.now();
  const uptimeSeconds = Math.floor((now - startedAt) / 1000);

  // Check if database.json is loadable
  let dbStatus = "ok";
  let stockCount = 0;
  let holdingsCount = 0;
  try {
    const db: any = await import("@/data/database.json");
    stockCount = db.stocks?.length || 0;
    holdingsCount = db.holdings?.length || 0;
  } catch {
    dbStatus = "error";
  }

  // Check if required env vars are set (without revealing values)
  const envChecks: Record<string, boolean> = {
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    AZURE_AD_CLIENT_ID: !!process.env.AZURE_AD_CLIENT_ID,
    AZURE_AD_CLIENT_SECRET: !!process.env.AZURE_AD_CLIENT_SECRET,
    AZURE_TENANT_ID: !!process.env.AZURE_TENANT_ID,
    GRAPH_CLIENT_ID: !!process.env.GRAPH_CLIENT_ID,
    GRAPH_CLIENT_SECRET: !!process.env.GRAPH_CLIENT_SECRET,
  };
  const missingEnv = Object.entries(envChecks)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  const status = dbStatus === "ok" && missingEnv.length === 0 ? "healthy" : "degraded";

  return NextResponse.json({
    status,
    version: "1.0.0",
    uptime: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`,
    uptimeSeconds,
    database: {
      status: dbStatus,
      stocks: stockCount,
      holdings: holdingsCount,
    },
    env: {
      allPresent: missingEnv.length === 0,
      missing: missingEnv,
    },
    errors: { ...errorCounts },
    lastSuccess: { ...lastSuccess },
    timestamp: new Date().toISOString(),
  });
}
