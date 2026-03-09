import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql, isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/db/setup — One-time migration to create tables.
 * Safe to call multiple times (IF NOT EXISTS).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Database not configured. Add POSTGRES_URL to env." },
      { status: 503 }
    );
  }

  try {
    // Decision Journal: stores zone transitions + user annotations
    await sql`
      CREATE TABLE IF NOT EXISTS decision_journal (
        id SERIAL PRIMARY KEY,
        tikr VARCHAR(30) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        zone_name VARCHAR(50),
        annotation TEXT,
        cmp_at_event NUMERIC,
        upside_bear NUMERIC,
        upside_base NUMERIC,
        upside_bull NUMERIC,
        cds_at_event INTEGER,
        user_email VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Index for fast per-ticker lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_journal_tikr
      ON decision_journal (tikr, created_at DESC)
    `;

    // Zone snapshot: replaces /tmp file storage
    await sql`
      CREATE TABLE IF NOT EXISTS zone_snapshot (
        id INTEGER PRIMARY KEY DEFAULT 1,
        zones JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Seed zone_snapshot with empty row if not exists
    await sql`
      INSERT INTO zone_snapshot (id, zones, updated_at)
      VALUES (1, '{}', NOW())
      ON CONFLICT (id) DO NOTHING
    `;

    // Sync snapshot: persists synced data across page refreshes
    await sql`
      CREATE TABLE IF NOT EXISTS sync_snapshot (
        id INTEGER PRIMARY KEY DEFAULT 1,
        stocks JSONB NOT NULL DEFAULT '[]',
        holdings JSONB NOT NULL DEFAULT '[]',
        ticker_map JSONB NOT NULL DEFAULT '{}',
        synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    return NextResponse.json({ ok: true, message: "Tables created successfully" });
  } catch (error: unknown) {
    console.error("[/api/db/setup]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Migration failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
