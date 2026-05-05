import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import eqInstruments from "@/data/dhan-eq-instruments.json";

export const dynamic = "force-dynamic";

type EqEntry = { securityId: number; exchange: string };

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.DHAN_CLIENT_ID;
  const accessToken = process.env.DHAN_ACCESS_TOKEN;

  if (!clientId || !accessToken) {
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

  const secIdToName: Record<number, string> = {};
  const byExchange: Record<string, number[]> = {};

  for (const name of instruments) {
    const entry = (eqInstruments as Record<string, EqEntry>)[name];
    if (!entry) {
      console.warn(`[eq-quotes] No securityId for: ${name}`);
      continue;
    }
    secIdToName[entry.securityId] = name;
    (byExchange[entry.exchange] ??= []).push(entry.securityId);
  }

  if (Object.keys(byExchange).length === 0) {
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
      body: JSON.stringify(byExchange),
    });

    if (!dhanResponse.ok) {
      const text = await dhanResponse.text().catch(() => "");
      console.error(`[eq-quotes] Dhan API error ${dhanResponse.status}: ${text}`);
      return NextResponse.json({ quotes: {} });
    }

    const data = await dhanResponse.json();
    const exchData = data?.data;

    if (!exchData || typeof exchData !== "object") {
      return NextResponse.json({ quotes: {} });
    }

    const quotes: Record<string, number> = {};
    for (const segmentData of Object.values(exchData)) {
      if (!segmentData || typeof segmentData !== "object") continue;
      for (const [secIdStr, info] of Object.entries(segmentData as Record<string, unknown>)) {
        const secId = Number(secIdStr);
        const assetName = secIdToName[secId];
        if (!assetName) continue;
        const ltp = (info as Record<string, unknown>)?.last_price;
        if (typeof ltp !== "number") continue;
        quotes[assetName] = ltp;
      }
    }

    return NextResponse.json({ quotes });
  } catch (error) {
    console.error("[eq-quotes] Unexpected error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ quotes: {} });
  }
}
