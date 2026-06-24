import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { STATEMENT_ORDER } from "@/lib/mobile/financialsTypes";
import type { Exchange } from "@/lib/mobile/financialsTypes";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" } as const;

/**
 * POST /api/financials/ingest
 * Secret-gated (NOT session-gated) write endpoint for the Apps Script "Push to Octopus".
 * Mirrors the cron-secret pattern. Writes ONLY financials_cache (public market data) via the
 * service key — the sheet never holds Supabase credentials. Accepts a single item or { items:[] }.
 *
 * Body: { secret, symbol, exchange, tikr?, payload }  OR  { secret, items:[ {symbol,...,payload} ] }
 */
function secretOk(provided: string): boolean {
  const expected = process.env.FINANCIALS_INGEST_SECRET || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface IngestRow {
  symbol: string;
  exchange: Exchange;
  tikr: string | null;
  payload: Record<string, unknown>;
}

function normalize(it: unknown): IngestRow | null {
  if (!it || typeof it !== "object") return null;
  const o = it as Record<string, unknown>;
  const symbol = String(o.symbol ?? "").trim().toUpperCase();
  if (!symbol) return null;
  const exchange: Exchange = o.exchange === "BSE" ? "BSE" : "NSE";
  const payload = o.payload;
  if (!payload || typeof payload !== "object") return null;
  const statements = (payload as Record<string, unknown>).statements;
  if (!statements || typeof statements !== "object") return null;
  // Require at least one statement with a period and a row (min-viable, same as the fetcher gate).
  const stmts = statements as Record<string, { rows?: unknown[]; periods?: unknown[] }>;
  const viable = STATEMENT_ORDER.some((k) => {
    const s = stmts[k];
    return s && Array.isArray(s.rows) && s.rows.length > 0 && Array.isArray(s.periods) && s.periods.length > 0;
  });
  if (!viable) return null;
  return {
    symbol,
    exchange,
    tikr: o.tikr ? String(o.tikr) : null,
    payload: { ...(payload as Record<string, unknown>), symbol, exchange },
  };
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400, headers: NO_STORE });
  }

  if (!secretOk(String(body?.secret ?? ""))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "db_not_configured" }, { status: 503, headers: NO_STORE });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [body];
  if (rawItems.length > 300) {
    return NextResponse.json({ ok: false, error: "too_many_items" }, { status: 400, headers: NO_STORE });
  }
  const rows = rawItems
    .map(normalize)
    .filter((r): r is IngestRow => r !== null)
    .map((r) => ({
      symbol: r.symbol,
      exchange: r.exchange,
      tikr: r.tikr,
      payload: r.payload,
      source: "manual" as const,
      fetched_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "no_valid_items" }, { status: 400, headers: NO_STORE });
  }

  try {
    const { error } = await getSupabase()
      .from("financials_cache")
      .upsert(rows, { onConflict: "symbol,exchange" });
    if (error) {
      console.error("[financials/ingest] upsert error:", error.message);
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500, headers: NO_STORE });
    }
  } catch (err) {
    console.error("[financials/ingest] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json(
    { ok: true, upserted: rows.length, symbols: rows.map((r) => r.symbol) },
    { headers: NO_STORE },
  );
}
