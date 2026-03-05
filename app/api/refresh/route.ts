import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// This endpoint triggers a re-read of the database JSON.
// In a full setup, this would call Graph API to re-extract from OneDrive.
// For now, it returns the current database with a fresh timestamp,
// and signals the frontend to refetch all data.

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Force fresh import by reading file directly
    const fs = await import("fs");
    const path = await import("path");
    const dbPath = path.join(process.cwd(), "data", "database.json");
    const raw = fs.readFileSync(dbPath, "utf-8");
    const db = JSON.parse(raw);

    return NextResponse.json({
      stocks: db.stocks,
      holdings: db.holdings,
      ticker_map: db.ticker_map,
      metadata: {
        ...db.metadata,
        refreshed_at: new Date().toISOString(),
      },
      refreshedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("[/api/refresh] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
