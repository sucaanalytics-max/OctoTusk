import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pin } = body;

    if (!pin) {
      return NextResponse.json({ error: "PIN required" }, { status: 401 });
    }

    const pinHash = crypto.createHash("sha256").update(pin).digest("hex");
    const expectedHash = process.env.HOLDINGS_PIN_HASH;

    if (pinHash !== expectedHash) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
    }

    // PIN is correct — return holdings data
    const db: any = await import("@/data/database.json");
    const holdings = db.holdings || [];

    return NextResponse.json({
      holdings,
      unlocked: true,
      holdingsDate: db.metadata?.holdings_date || "unknown",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
