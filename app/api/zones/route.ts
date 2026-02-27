import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// Store zones in /tmp on Vercel (persists within a single function instance)
// Also keep an in-memory cache as primary (faster, survives within same instance)
const ZONE_FILE = path.join("/tmp", "octotusk_zone_snapshot.json");

// In-memory cache (fastest, but lost on cold start — /tmp is backup)
let memoryCache: { zones: Record<string, string[]>; updatedAt: string | null } = {
  zones: {},
  updatedAt: null,
};
let memoryCacheLoaded = false;

function loadFromDisk(): typeof memoryCache {
  try {
    if (fs.existsSync(ZONE_FILE)) {
      const data = JSON.parse(fs.readFileSync(ZONE_FILE, "utf8"));
      return data;
    }
  } catch { /* ignore */ }
  return { zones: {}, updatedAt: null };
}

function saveToDisk(data: typeof memoryCache) {
  try {
    fs.writeFileSync(ZONE_FILE, JSON.stringify(data));
  } catch { /* ignore — /tmp may be read-only in some edge cases */ }
}

/**
 * GET /api/zones — Read zone snapshot
 */
export async function GET() {
  if (!memoryCacheLoaded) {
    memoryCache = loadFromDisk();
    memoryCacheLoaded = true;
  }
  return NextResponse.json(memoryCache);
}

/**
 * POST /api/zones — Save zone snapshot
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const snapshot = {
      zones: body.zones || {},
      updatedAt: new Date().toISOString(),
    };

    memoryCache = snapshot;
    memoryCacheLoaded = true;
    saveToDisk(snapshot);

    return NextResponse.json({ ok: true, updatedAt: snapshot.updatedAt });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/zones POST] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
