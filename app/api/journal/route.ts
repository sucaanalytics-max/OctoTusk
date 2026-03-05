import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql, isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/journal?tikr=XYZ — Get journal entries for a stock (or all if no tikr)
 * GET /api/journal?tikr=XYZ&limit=50 — With limit
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ entries: [], dbConfigured: false });
  }

  try {
    const tikr = req.nextUrl.searchParams.get("tikr");
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 500);

    let result;
    if (tikr) {
      result = await sql`
        SELECT id, tikr, event_type, zone_name, annotation, cmp_at_event,
               upside_bear, upside_base, upside_bull, cds_at_event,
               user_email, created_at
        FROM decision_journal
        WHERE tikr = ${tikr}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      result = await sql`
        SELECT id, tikr, event_type, zone_name, annotation, cmp_at_event,
               upside_bear, upside_base, upside_bull, cds_at_event,
               user_email, created_at
        FROM decision_journal
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }

    return NextResponse.json({ entries: result.rows, dbConfigured: true });
  } catch (error: unknown) {
    console.error("[/api/journal GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ entries: [], error: "Query failed" }, { status: 500 });
  }
}

/**
 * POST /api/journal — Create a journal entry
 * Body: { tikr, event_type, zone_name?, annotation?, cmp_at_event?, upside_bear/base/bull?, cds_at_event? }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { tikr, event_type, zone_name, annotation, cmp_at_event, upside_bear, upside_base, upside_bull, cds_at_event } = body;

    if (!tikr || !event_type) {
      return NextResponse.json({ error: "tikr and event_type are required" }, { status: 400 });
    }

    // Validate event_type
    const validTypes = ["zone_enter", "zone_exit", "annotation"];
    if (!validTypes.includes(event_type)) {
      return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
    }

    // Sanitize tikr
    if (!/^[a-zA-Z0-9._:-]+$/.test(tikr)) {
      return NextResponse.json({ error: "Invalid tikr format" }, { status: 400 });
    }

    const userEmail = session.user.email || "unknown";

    const result = await sql`
      INSERT INTO decision_journal (tikr, event_type, zone_name, annotation, cmp_at_event, upside_bear, upside_base, upside_bull, cds_at_event, user_email)
      VALUES (${tikr}, ${event_type}, ${zone_name || null}, ${annotation || null}, ${cmp_at_event || null}, ${upside_bear || null}, ${upside_base || null}, ${upside_bull || null}, ${cds_at_event || null}, ${userEmail})
      RETURNING id, created_at
    `;

    return NextResponse.json({ ok: true, id: result.rows[0].id, created_at: result.rows[0].created_at });
  } catch (error: unknown) {
    console.error("[/api/journal POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
}
