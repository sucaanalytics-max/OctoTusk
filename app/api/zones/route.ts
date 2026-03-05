import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { auth } from "@/auth";
import { sql, isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── Fallback: /tmp file storage (used when Postgres not configured) ──
const ZONE_FILE = path.join("/tmp", "octotusk_zone_snapshot.json");
let memoryCache: { zones: Record<string, string[]>; updatedAt: string | null } = { zones: {}, updatedAt: null };
let memoryCacheLoaded = false;

function loadFromDisk(): typeof memoryCache {
  try {
    if (fs.existsSync(ZONE_FILE)) return JSON.parse(fs.readFileSync(ZONE_FILE, "utf8"));
  } catch { /* ignore */ }
  return { zones: {}, updatedAt: null };
}
function saveToDisk(data: typeof memoryCache) {
  try { fs.writeFileSync(ZONE_FILE, JSON.stringify(data)); } catch { /* ignore */ }
}

// ── Sanitize zones input ──
function sanitizeZones(rawZones: unknown): Record<string, string[]> {
  const sanitized: Record<string, string[]> = {};
  if (!rawZones || typeof rawZones !== "object" || Array.isArray(rawZones)) return sanitized;
  const dangerous = new Set(["__proto__", "constructor", "prototype"]);
  for (const key of Object.keys(rawZones as Record<string, unknown>)) {
    if (dangerous.has(key)) continue;
    const val = (rawZones as Record<string, unknown>)[key];
    if (Array.isArray(val) && val.every((v: unknown) => typeof v === "string")) {
      sanitized[key] = val as string[];
    }
  }
  return sanitized;
}

/**
 * GET /api/zones — Read zone snapshot (Postgres → /tmp fallback)
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isDbConfigured()) {
    try {
      const result = await sql`SELECT zones, updated_at FROM zone_snapshot WHERE id = 1`;
      if (result.rows.length > 0) {
        return NextResponse.json({ zones: result.rows[0].zones || {}, updatedAt: result.rows[0].updated_at });
      }
      return NextResponse.json({ zones: {}, updatedAt: null });
    } catch (err) {
      console.error("[/api/zones GET] DB error, falling back to /tmp:", err instanceof Error ? err.message : err);
      // Fall through to /tmp
    }
  }

  // Fallback: /tmp
  if (!memoryCacheLoaded) { memoryCache = loadFromDisk(); memoryCacheLoaded = true; }
  return NextResponse.json(memoryCache);
}

/**
 * POST /api/zones — Save zone snapshot + log transitions to journal
 * Body: { zones: Record<string, string[]>, transitions?: { tikr, event_type, zone_name, cmp, upsideBear, upsideBase, upsideBull, cds }[] }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const sanitizedZones = sanitizeZones(body.zones);

    if (isDbConfigured()) {
      try {
        // Upsert zone snapshot
        await sql`
          INSERT INTO zone_snapshot (id, zones, updated_at) VALUES (1, ${JSON.stringify(sanitizedZones)}::jsonb, NOW())
          ON CONFLICT (id) DO UPDATE SET zones = ${JSON.stringify(sanitizedZones)}::jsonb, updated_at = NOW()
        `;

        // Log transitions to decision_journal if provided
        const transitions: Array<{
          tikr: string; event_type: string; zone_name: string;
          cmp?: number; upsideBear?: number; upsideBase?: number; upsideBull?: number; cds?: number;
        }> = body.transitions || [];
        const userEmail = session.user.email || "unknown";

        for (const t of transitions.slice(0, 50)) { // cap at 50 per request
          if (!t.tikr || !t.event_type) continue;
          await sql`
            INSERT INTO decision_journal (tikr, event_type, zone_name, cmp_at_event, upside_bear, upside_base, upside_bull, cds_at_event, user_email)
            VALUES (${t.tikr}, ${t.event_type}, ${t.zone_name || null}, ${t.cmp || null}, ${t.upsideBear || null}, ${t.upsideBase || null}, ${t.upsideBull || null}, ${t.cds || null}, ${userEmail})
          `;
        }

        return NextResponse.json({ ok: true, updatedAt: new Date().toISOString(), persisted: "postgres" });
      } catch (err) {
        console.error("[/api/zones POST] DB error, falling back to /tmp:", err instanceof Error ? err.message : err);
      }
    }

    // Fallback: /tmp
    const snapshot = { zones: sanitizedZones, updatedAt: new Date().toISOString() };
    memoryCache = snapshot;
    memoryCacheLoaded = true;
    saveToDisk(snapshot);
    return NextResponse.json({ ok: true, updatedAt: snapshot.updatedAt, persisted: "tmp" });
  } catch (error: unknown) {
    console.error("[/api/zones POST] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
