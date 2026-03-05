import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/holdings — Session + PIN gated holdings data
 * Requires: (1) authenticated @tuskinvest.com session AND (2) correct PIN
 * PIN hash MUST be set via HOLDINGS_PIN_HASH env var — no hardcoded fallback.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expectedHash = process.env.HOLDINGS_PIN_HASH;
  if (!expectedHash) {
    console.error("[/api/holdings] HOLDINGS_PIN_HASH env var is not set — holdings endpoint disabled");
    return NextResponse.json({ error: "Holdings unavailable — contact admin" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { pin } = body;

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN required" }, { status: 401 });
    }

    // Rate limiting is handled by middleware (10 req/min for /api/holdings)
    const pinHash = crypto.createHash("sha256").update(pin).digest("hex");

    if (pinHash !== expectedHash) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
    }

    const db: any = await import("@/data/database.json");
    const holdings = db.holdings || [];

    return NextResponse.json({
      holdings,
      unlocked: true,
      holdingsDate: db.metadata?.holdings_date || "unknown",
    });
  } catch (error: unknown) {
    console.error("[/api/holdings] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
