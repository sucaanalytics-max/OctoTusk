import YahooFinance from "yahoo-finance2";
import mcx from "@/data/mcx-commodities.json";

/**
 * Gold & silver for the daily digests: global benchmark (Yahoo COMEX futures,
 * USD/oz) + India MCX front-month (Dhan marketfeed, ₹). Fail-soft — any leg
 * that fails leaves its fields null and the caller renders what it has.
 */

const yf = new (YahooFinance as any)({
  suppressNotices: ["yahooSurvey"],
  fetchOptions: { cache: "no-store" },
});

export type Metal = {
  name: "Gold" | "Silver";
  usdOz: number | null;
  usdPct: number | null; // day %, e.g. 3.1
  mcxInr: number | null;
  mcxPct: number | null; // day %, e.g. 1.2
};

export type Commodities = { gold: Metal; silver: Metal };

type McxEntry = { securityId: number; segment: string };

async function fetchGlobal(): Promise<Record<string, { px: number | null; pct: number | null }>> {
  const out: Record<string, { px: number | null; pct: number | null }> = {};
  try {
    const rs: any[] = await yf.quote(["GC=F", "SI=F"]);
    for (const r of rs ?? []) {
      if (r?.symbol) out[r.symbol] = {
        px: typeof r.regularMarketPrice === "number" ? r.regularMarketPrice : null,
        pct: typeof r.regularMarketChangePercent === "number" ? r.regularMarketChangePercent : null,
      };
    }
  } catch (err) {
    console.warn("[commodities] Yahoo global leg failed:", err instanceof Error ? err.message : err);
  }
  return out;
}

/**
 * Generic Dhan MCX last-price + day-% fetch, keyed by security id. Fail-soft (creds
 * missing / HTTP error / timeout → empty map). Reused by the digest (gold/silver) and
 * the wall-display strip (gold/silver/aluminium/crude).
 */
export async function fetchMcxQuotes(
  securityIds: number[],
  timeoutMs = 5000,
): Promise<Record<number, { ltp: number | null; pct: number | null }>> {
  const out: Record<number, { ltp: number | null; pct: number | null }> = {};
  const clientId = process.env.DHAN_CLIENT_ID;
  const accessToken = process.env.DHAN_ACCESS_TOKEN;
  const ids = Array.from(new Set(securityIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return out;
  if (!clientId || !accessToken) {
    console.warn("[commodities] DHAN creds missing — MCX leg skipped");
    return out;
  }
  try {
    const res = await fetch("https://api.dhan.co/v2/marketfeed/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "client-id": clientId, "access-token": accessToken },
      body: JSON.stringify({ MCX_COMM: ids }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[commodities] Dhan MCX leg ${res.status}`);
      return out;
    }
    const seg = (await res.json())?.data?.MCX_COMM || {};
    for (const [idStr, info] of Object.entries(seg as Record<string, any>)) {
      const ltp = typeof info?.last_price === "number" ? info.last_price : null;
      const prev = typeof info?.ohlc?.close === "number" ? info.ohlc.close : null;
      const net = typeof info?.net_change === "number" ? info.net_change : (ltp != null && prev != null ? ltp - prev : null);
      const pct = prev && net != null && prev !== 0 ? (net / prev) * 100 : null;
      out[Number(idStr)] = { ltp, pct };
    }
  } catch (err) {
    console.warn("[commodities] Dhan MCX leg failed:", err instanceof Error ? err.message : err);
  }
  return out;
}

export async function fetchCommodities(): Promise<Commodities> {
  const gold = mcx.gold as McxEntry, silver = mcx.silver as McxEntry;
  const [global, mcxQuotes] = await Promise.all([
    fetchGlobal(),
    fetchMcxQuotes([gold.securityId, silver.securityId]),
  ]);

  return {
    gold: {
      name: "Gold",
      usdOz: global["GC=F"]?.px ?? null,
      usdPct: global["GC=F"]?.pct ?? null,
      mcxInr: mcxQuotes[gold.securityId]?.ltp ?? null,
      mcxPct: mcxQuotes[gold.securityId]?.pct ?? null,
    },
    silver: {
      name: "Silver",
      usdOz: global["SI=F"]?.px ?? null,
      usdPct: global["SI=F"]?.pct ?? null,
      mcxInr: mcxQuotes[silver.securityId]?.ltp ?? null,
      mcxPct: mcxQuotes[silver.securityId]?.pct ?? null,
    },
  };
}
