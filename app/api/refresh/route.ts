import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// This endpoint triggers a re-read of the database JSON.
// In a full setup, this would call Graph API to re-extract from OneDrive.
// For now, it returns the current database with a fresh timestamp,
// and signals the frontend to refetch all data.

export async function POST() {
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
