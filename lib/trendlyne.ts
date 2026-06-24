// SERVER-ONLY. The ONLY module that reads TRENDLYNE_WEBAPP_URL + TRENDLYNE_PROXY_SECRET.
// Posts { symbol, exchange, key } to the Apps Script Web App and normalizes the reply into a
// typed FinPayload. Resilient by contract (mirrors lib/stockNews.ts): AbortController timeout,
// never throws — returns null on any transient failure, or the "not_found" sentinel when the
// upstream explicitly has no data for the symbol (so the caller can negative-cache it).
//
// SECURITY: the secret travels in the POST *body* (Apps Script doGet/doPost cannot read request
// headers, so a ?key= query param would leak into Google's URL logs). NEVER log the URL or body —
// log the symbol only.

import type { Exchange, FinPayload, FinStatement, FinStatementKey } from "./mobile/financialsTypes";
import { STATEMENT_ORDER } from "./mobile/financialsTypes";

const DEFAULT_TIMEOUT_MS = 20000; // Apps Script cold starts are slow

/** True only when a live fetch backend is configured. In the push model (Apps Script writes the
 *  cache directly) this is false, so Octopus stays cache-only and never attempts an upstream call. */
export function isFetchConfigured(): boolean {
  return !!(process.env.TRENDLYNE_WEBAPP_URL && process.env.TRENDLYNE_PROXY_SECRET);
}

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function normalizeStatement(raw: unknown): FinStatement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { periods?: unknown; rows?: unknown };
  const periods = Array.isArray(r.periods) ? r.periods.map((p) => String(p)) : [];
  const rows = Array.isArray(r.rows)
    ? r.rows
        .map((row) => {
          const rr = row as { label?: unknown; key?: unknown; values?: unknown };
          const label = rr.label != null ? String(rr.label) : "";
          if (!label) return null;
          const values = Array.isArray(rr.values) ? rr.values.map(numOrNull) : [];
          return { label, key: rr.key != null ? String(rr.key) : undefined, values };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : [];
  if (periods.length === 0 && rows.length === 0) return null;
  return { periods, rows };
}

function normalizePayload(body: Record<string, unknown>, symbol: string, exchange: Exchange): FinPayload {
  const statements: Partial<Record<FinStatementKey, FinStatement>> = {};
  const rawStmts = (body.statements && typeof body.statements === "object" ? body.statements : {}) as Record<string, unknown>;
  for (const key of STATEMENT_ORDER) {
    const stmt = normalizeStatement(rawStmts[key]);
    if (stmt) statements[key] = stmt;
  }
  return {
    symbol: typeof body.symbol === "string" ? body.symbol : symbol,
    exchange: body.exchange === "BSE" || body.exchange === "NSE" ? body.exchange : exchange,
    name: typeof body.name === "string" ? body.name : undefined,
    currency: typeof body.currency === "string" ? body.currency : undefined,
    unit: typeof body.unit === "string" ? body.unit : undefined,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : undefined,
    statements,
  };
}

/**
 * Fetch financials for a resolved symbol from the Apps Script Web App.
 * @returns FinPayload on success · "not_found" when upstream has no data · null on any
 *          transient failure (timeout / non-200 / parse / other ok:false / not configured).
 */
export async function fetchTrendlyne(
  symbol: string,
  exchange: Exchange,
): Promise<FinPayload | "not_found" | null> {
  const url = process.env.TRENDLYNE_WEBAPP_URL;
  const key = process.env.TRENDLYNE_PROXY_SECRET;
  if (!url || !key) {
    console.warn("[trendlyne] TRENDLYNE_WEBAPP_URL / TRENDLYNE_PROXY_SECRET not set — feature disabled");
    return null;
  }

  const timeoutMs = Number(process.env.TRENDLYNE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  let body: Record<string, unknown>;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, exchange, key, v: 1 }),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      console.warn(`[trendlyne] HTTP ${res.status} for ${symbol}`);
      return null;
    }
    body = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.warn(`[trendlyne] fetch failed for ${symbol}:`, err instanceof Error ? err.message : err);
    return null;
  }

  if (!body || body.ok !== true) {
    const code = typeof body?.error === "string" ? body.error : "UPSTREAM_ERROR";
    if (code === "SYMBOL_NOT_FOUND") return "not_found";
    // BAD_KEY / QUOTA_EXCEEDED / MISSING_SYMBOL / UPSTREAM_ERROR are transient → don't poison cache.
    console.warn(`[trendlyne] upstream ok:false (${code}) for ${symbol}`);
    return null;
  }

  return normalizePayload(body, symbol, exchange);
}

/**
 * Minimum-viable-success gate: a degraded ok:true husk (e.g. expired Trendlyne token returning
 * an empty shell) must NOT be cached as valid for the full TTL. Require at least one statement
 * with a period and a row before we trust it.
 */
export function isViablePayload(p: FinPayload): boolean {
  return Object.values(p.statements).some(
    (s) => !!s && s.periods.length > 0 && s.rows.length > 0,
  );
}
