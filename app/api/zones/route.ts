import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ── Fallback: /tmp file storage (used when Supabase not configured) ──
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
 * GET /api/zones — Read zone snapshot (Supabase → /tmp fallback)
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("zone_snapshot")
        .select("zones, updated_at")
        .eq("id", 1)
        .single();

      if (!error && data) {
        return NextResponse.json({ zones: data.zones || {}, updatedAt: data.updated_at });
      }
      return NextResponse.json({ zones: {}, updatedAt: null });
    } catch (err) {
      console.error("[/api/zones GET] DB error, falling back to /tmp:", err instanceof Error ? err.message : err);
    }
  }

  // Fallback: /tmp
  if (!memoryCacheLoaded) { memoryCache = loadFromDisk(); memoryCacheLoaded = true; }
  return NextResponse.json(memoryCache);
}

/**
 * POST /api/zones — Save zone snapshot + log transitions to journal
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const sanitizedZones = sanitizeZones(body.zones);

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabase();

        // Upsert zone snapshot
        const { error: zoneErr } = await supabase
          .from("zone_snapshot")
          .upsert({ id: 1, zones: sanitizedZones, updated_at: new Date().toISOString() });

        if (zoneErr) throw zoneErr;

        // Log transitions to decision_journal if provided
        const transitions: Array<{
          tikr: string; event_type: string; zone_name: string;
          cmp?: number; upsideBear?: number; upsideBase?: number; upsideBull?: number; cds?: number;
        }> = body.transitions || [];
        const userEmail = session.user.email || "unknown";

        for (const t of transitions.slice(0, 50)) {
          if (!t.tikr || !t.event_type) continue;
          const { error: jErr } = await supabase
            .from("decision_journal")
            .insert({
              tikr: t.tikr, event_type: t.event_type, zone_name: t.zone_name || null,
              cmp_at_event: t.cmp || null, upside_bear: t.upsideBear || null,
              upside_base: t.upsideBase || null, upside_bull: t.upsideBull || null,
              cds_at_event: t.cds || null, user_email: userEmail,
            });
          if (jErr) console.warn("[zones] journal insert error:", jErr.message);
        }

        return NextResponse.json({ ok: true, updatedAt: new Date().toISOString(), persisted: "supabase" });
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
