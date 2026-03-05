import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/holdings — Session-gated holdings data
 * Requires authenticated @tuskinvest.com session (replaces old PIN mechanism)
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

/**
 * POST /api/holdings — Legacy PIN endpoint (deprecated)
 * Kept for backward compatibility but now also requires session auth
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
