// SERVER-ONLY orchestration seam shared by the RSC page and /api/financials. Cache-first:
// resolve symbol → read financials_cache → serve fresh, else (budget + stampede permitting)
// fetch upstream, validate, and write back. Never throws; always returns a FinResult.
//
// Quota discipline (Trendlyne ~70/day, 300/mo):
//   • a stored row is served even when STALE — staleness is a UI chip, never a refetch trigger
//     on its own; a stale row is only refreshed opportunistically when budget + guard allow.
//   • a global daily budget caps fresh upstream calls per UTC day.
//   • a compare-and-set in_progress claim coalesces concurrent misses to one upstream call.
//   • not_found is negative-cached so we don't re-hit a symbol Trendlyne doesn't have.

import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import staticDb from "@/data/database.json";
import { resolveTrendlyneSymbol } from "@/lib/trendlyneSymbol";
import { fetchTrendlyne, isViablePayload, isFetchConfigured } from "@/lib/trendlyne";
import type { Exchange, FinMeta, FinPayload, FinResult } from "./financialsTypes";

const TTL_DAYS = Number(process.env.FINANCIALS_TTL_DAYS) || 7;
const NOTFOUND_TTL_DAYS = Number(process.env.FINANCIALS_NOTFOUND_TTL_DAYS) || 30;
const DAILY_BUDGET = Number(process.env.TRENDLYNE_DAILY_BUDGET) || 60;
const TIMEOUT_MS = Number(process.env.TRENDLYNE_TIMEOUT_MS) || 20000;
const EPOCH = "1970-01-01T00:00:00.000Z"; // placeholder fetched_at: never fresh, never counts toward budget

interface CacheRow {
  payload: unknown;
  source: "webapp" | "not_found" | "manual";
  fetched_at: string;
  in_progress_until: string | null;
}

const ms = (iso: string | null): number => (iso ? new Date(iso).getTime() : 0);
const isStale = (fetchedAt: string, ttlDays: number): boolean =>
  Date.now() - ms(fetchedAt) > ttlDays * 86400000;

function utcDayStartISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/** Minimal runtime guard that a stored jsonb row is a usable FinPayload. */
function asFinPayload(raw: unknown): FinPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<FinPayload>;
  if (!p.statements || typeof p.statements !== "object") return null;
  return p as FinPayload;
}

function meta(partial: Partial<FinMeta> & { source: FinMeta["source"] }): FinMeta {
  return { symbol: null, exchange: null, fetchedAt: null, stale: false, ...partial };
}

async function loadTickerMap(): Promise<Record<string, string>> {
  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabase()
        .from("sync_snapshot")
        .select("ticker_map")
        .eq("id", 1)
        .single();
      if (data?.ticker_map && typeof data.ticker_map === "object") {
        return data.ticker_map as Record<string, string>;
      }
    } catch {
      /* fall through to static */
    }
  }
  return (staticDb.ticker_map as Record<string, string>) ?? {};
}

/** Build a FinResult from a freshly-fetched upstream reply (no caching layer). */
function liveResult(
  r: FinPayload | "not_found" | null,
  symbol: string,
  exchange: Exchange,
): FinResult {
  if (r === "not_found") {
    return { payload: null, meta: meta({ symbol, exchange, source: "not_found", reason: "not_found" }) };
  }
  if (!r || !isViablePayload(r)) {
    return { payload: null, meta: meta({ symbol, exchange, source: "webapp", stale: true, reason: "fetch_failed" }) };
  }
  return { payload: r, meta: meta({ symbol, exchange, fetchedAt: new Date().toISOString(), source: "webapp" }) };
}

function servedRow(row: CacheRow, symbol: string, exchange: Exchange, forceStale = false): FinResult {
  const payload = asFinPayload(row.payload);
  if (!payload) return { payload: null, meta: meta({ symbol, exchange, source: "webapp", stale: true, reason: "fetch_failed" }) };
  return {
    payload,
    meta: meta({
      symbol,
      exchange,
      fetchedAt: row.fetched_at,
      stale: forceStale || isStale(row.fetched_at, TTL_DAYS),
      source: "cache",
    }),
  };
}

export async function loadFinancials(tikr: string): Promise<FinResult> {
  const tickerMap = await loadTickerMap();
  const resolved = resolveTrendlyneSymbol(tikr, tickerMap);
  if (!resolved) {
    return { payload: null, meta: meta({ source: "not_found", reason: "no_symbol_mapping" }) };
  }
  const { symbol, exchange } = resolved;

  // No Supabase (local dev) → fetch live, no caching.
  if (!isSupabaseConfigured()) {
    return liveResult(await fetchTrendlyne(symbol, exchange), symbol, exchange);
  }

  const supabase = getSupabase();
  const { data: row } = (await supabase
    .from("financials_cache")
    .select("payload, source, fetched_at, in_progress_until")
    .eq("symbol", symbol)
    .eq("exchange", exchange)
    .maybeSingle()) as { data: CacheRow | null };

  const now = Date.now();

  // Fresh cache hits (positive or negative) — no upstream call.
  if (row) {
    if (row.source === "not_found" && !isStale(row.fetched_at, NOTFOUND_TTL_DAYS)) {
      return { payload: null, meta: meta({ symbol, exchange, fetchedAt: row.fetched_at, source: "not_found", reason: "not_found" }) };
    }
    if (row.source !== "not_found" && row.payload && !isStale(row.fetched_at, TTL_DAYS)) {
      return servedRow(row, symbol, exchange);
    }
  }

  // From here we WANT an upstream fetch (miss / stale-positive / expired-negative).
  const haveStale = !!row?.payload;

  // Cache-only (push model): no live fetch backend configured → never claim or fetch. Serve a
  // usable cached row even when stale; otherwise a clean "not loaded yet" state — no in-flight
  // placeholder row, no spinner, no epoch timestamp.
  if (!isFetchConfigured()) {
    if (haveStale) return servedRow(row!, symbol, exchange, true);
    return { payload: null, meta: meta({ symbol, exchange, source: "not_found", reason: "not_cached" }) };
  }

  // Another request is mid-flight → don't pile on.
  if (row?.in_progress_until && ms(row.in_progress_until) > now) {
    if (haveStale) return servedRow(row, symbol, exchange, true);
    return { payload: null, meta: meta({ symbol, exchange, fetchedAt: row?.fetched_at ?? null, stale: true, source: "webapp", reason: "in_progress" }) };
  }

  // Daily budget guard — count fresh fetches since UTC midnight.
  const { count } = await supabase
    .from("financials_cache")
    .select("symbol", { count: "exact", head: true })
    .gte("fetched_at", utcDayStartISO());
  if ((count ?? 0) >= DAILY_BUDGET) {
    if (haveStale) return servedRow(row!, symbol, exchange, true);
    return { payload: null, meta: meta({ symbol, exchange, fetchedAt: row?.fetched_at ?? null, stale: true, source: "webapp", reason: "budget_exhausted" }) };
  }

  // Claim the in-flight slot (compare-and-set) so concurrent misses coalesce to one call.
  const claimUntil = new Date(now + TIMEOUT_MS + 5000).toISOString();
  const claimed = await claimInFlight(supabase, symbol, exchange, tikr, claimUntil, !!row);
  if (!claimed) {
    // Lost the race → another request owns the fetch.
    if (haveStale) return servedRow(row!, symbol, exchange, true);
    return { payload: null, meta: meta({ symbol, exchange, fetchedAt: row?.fetched_at ?? null, stale: true, source: "webapp", reason: "in_progress" }) };
  }

  // We own the fetch.
  const fetched = await fetchTrendlyne(symbol, exchange);
  const nowIso = new Date().toISOString();

  if (fetched === "not_found") {
    await supabase.from("financials_cache").upsert({ symbol, exchange, tikr, payload: null, source: "not_found", fetched_at: nowIso, in_progress_until: null });
    return { payload: null, meta: meta({ symbol, exchange, fetchedAt: nowIso, source: "not_found", reason: "not_found" }) };
  }

  if (!fetched || !isViablePayload(fetched)) {
    // Transient/degraded → don't poison cache. Release the claim, serve stale if we have it.
    await releaseClaim(supabase, symbol, exchange);
    if (haveStale) return servedRow(row!, symbol, exchange, true);
    return { payload: null, meta: meta({ symbol, exchange, fetchedAt: row?.fetched_at ?? null, stale: true, source: "webapp", reason: "fetch_failed" }) };
  }

  await supabase.from("financials_cache").upsert({ symbol, exchange, tikr, payload: fetched, source: "webapp", fetched_at: nowIso, in_progress_until: null });
  return { payload: fetched, meta: meta({ symbol, exchange, fetchedAt: nowIso, source: "webapp" }) };
}

/**
 * Best-effort distributed claim. Returns true iff this caller now owns the in-flight slot.
 * Existing row → UPDATE in_progress_until only when it is null/expired (compare-and-set).
 * New symbol → INSERT a placeholder with fetched_at=EPOCH (never fresh, never counts toward
 * budget); a unique-violation means a concurrent caller just claimed it.
 */
async function claimInFlight(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  symbol: string,
  exchange: Exchange,
  tikr: string,
  claimUntil: string,
  rowExists: boolean,
): Promise<boolean> {
  if (rowExists) {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("financials_cache")
      .update({ in_progress_until: claimUntil })
      .eq("symbol", symbol)
      .eq("exchange", exchange)
      .or(`in_progress_until.is.null,in_progress_until.lt.${nowIso}`)
      .select("symbol");
    return Array.isArray(data) && data.length > 0;
  }
  const { error } = await supabase
    .from("financials_cache")
    .insert({ symbol, exchange, tikr, payload: null, source: "webapp", fetched_at: EPOCH, in_progress_until: claimUntil });
  return !error; // unique-violation (23505) → false → another caller owns it
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function releaseClaim(supabase: any, symbol: string, exchange: Exchange): Promise<void> {
  await supabase.from("financials_cache").update({ in_progress_until: null }).eq("symbol", symbol).eq("exchange", exchange);
}
