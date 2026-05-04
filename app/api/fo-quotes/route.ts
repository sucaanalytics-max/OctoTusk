import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import foInstruments from "@/data/dhan-fo-instruments.json";

export const dynamic = "force-dynamic";

function parseExpiry(ddmmyy: string): string {
  const parts = ddmmyy.split("-");
  if (parts.length !== 3) return ddmmyy;
  const [dd, mm, yy] = parts;
  return `20${yy}-${mm}-${dd}`;
}

/**
 * Convert a raw instrument_name from FoPosition into the lookup key
 * used in data/dhan-fo-instruments.json.
 *
 * Futures:  "BAJAJFINSV-FUTSTK:26-05-26"          → "BAJAJFINSV-FUT-2026-05-26--"
 * Options:  "BSE-OPTSTK:26-05-26:4000.00:CE"       → "BSE-OPT-2026-05-26-4000-CE"
 */
function instrumentToKey(name: string): string | null {
  // Futures
  const futMatch = name.match(/^(.+)-FUTSTK:(\d{2}-\d{2}-\d{2})$/);
  if (futMatch) {
    const underlying = futMatch[1];
    const expiry = parseExpiry(futMatch[2]);
    return `${underlying}-FUT-${expiry}--`;
  }

  // Options
  const optMatch = name.match(/^(.+)-OPTSTK:(\d{2}-\d{2}-\d{2}):([\d.]+):(CE|PE)$/);
  if (optMatch) {
    const underlying = optMatch[1];
    const expiry = parseExpiry(optMatch[2]);
    const strike = String(Math.round(parseFloat(optMatch[3])));
    const optType = optMatch[4];
    return `${underlying}-OPT-${expiry}-${strike}-${optType}`;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.DHAN_CLIENT_ID;
  const accessToken = process.env.DHAN_ACCESS_TOKEN;

  if (!clientId || !accessToken) {
    console.warn("[fo-quotes] DHAN_CLIENT_ID or DHAN_ACCESS_TOKEN not set — returning empty quotes");
    return NextResponse.json({ quotes: {} });
  }

  let instruments: string[] = [];
  try {
    const body = await request.json();
    instruments = Array.isArray(body?.instruments) ? body.instruments : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (instruments.length === 0) {
    return NextResponse.json({ quotes: {} });
  }

  // Build map: securityId → instrument_name (for reversing Dhan response)
  const secIdToName: Record<number, string> = {};
  const securityIds: number[] = [];

  for (const name of instruments) {
    const key = instrumentToKey(name);
    if (!key) {
      console.warn(`[fo-quotes] Could not parse instrument name: ${name}`);
      continue;
    }

    const entry = (foInstruments as Record<string, { securityId: number; lotSize?: number }>)[key];
    if (!entry) {
      console.warn(`[fo-quotes] No securityId found for key: ${key} (instrument: ${name})`);
      continue;
    }

    secIdToName[entry.securityId] = name;
    securityIds.push(entry.securityId);
  }

  if (securityIds.length === 0) {
    return NextResponse.json({ quotes: {} });
  }

  try {
    const dhanResponse = await fetch("https://api.dhan.co/v2/marketfeed/ltp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "client-id": clientId,
        "access-token": accessToken,
      },
      body: JSON.stringify({ NSE_FNO: securityIds }),
    });

    if (!dhanResponse.ok) {
      const text = await dhanResponse.text().catch(() => "");
      console.error(`[fo-quotes] Dhan API error ${dhanResponse.status}: ${text}`);
      return NextResponse.json({ quotes: {} });
    }

    const data = await dhanResponse.json();
    const nseFno = data?.data?.NSE_FNO;

    if (!nseFno || typeof nseFno !== "object") {
      console.warn("[fo-quotes] Dhan response missing data.NSE_FNO");
      return NextResponse.json({ quotes: {} });
    }

    const quotes: Record<string, number> = {};
    for (const [secIdStr, info] of Object.entries(nseFno)) {
      const secId = Number(secIdStr);
      const instrumentName = secIdToName[secId];
      if (!instrumentName) continue;

      const ltp = (info as Record<string, unknown>)?.last_price;
      if (typeof ltp !== "number") continue;
      quotes[instrumentName] = ltp;
    }

    return NextResponse.json({ quotes });
  } catch (error) {
    console.error("[fo-quotes] Unexpected error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ quotes: {} });
  }
}
