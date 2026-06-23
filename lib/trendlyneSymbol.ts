// Pure, secret-free: resolve an Octopus tikr → the NSE/BSE symbol Trendlyne expects.
// The single seam for fixing mapping mistakes — data/database.json (frozen) is never touched.
//
// Resolution order:
//   1. TRENDLYNE_SYMBOL_OVERRIDE  (hand-curated; an explicit `null` means "known-unmapped")
//   2. ticker_map[tikr] → strip .NS/.BO  (the 109/121 happy path)
//   3. reject un-sendable symbols (numeric BSE codes, X{BOM,NSE}: prefixes, SME suffixes,
//      foreign listings) → null, so we render a friendly empty state instead of burning a
//      Trendlyne quota call on a symbol it will only 404 on.
//
// The override set was derived from a verified audit of data/database.json (12 tikrs fail the
// naive path). Symbols below marked "confirm" are high-confidence NSE symbols but were keyed in
// before live Trendlyne access existed — verify once the Web App (M0) is wired and adjust here.

import type { Exchange } from "./mobile/financialsTypes";

export interface ResolvedSymbol {
  symbol: string;
  exchange: Exchange;
}

// Keyed by tikr.toLowerCase(). `null` = deliberately unmapped (don't attempt upstream).
export const TRENDLYNE_SYMBOL_OVERRIDE: Record<string, ResolvedSymbol | null> = {
  // — No ticker_map entry, but a clean NSE symbol exists —
  rpsgvent: { symbol: "RPSGVENT", exchange: "NSE" }, // RPSG Ventures (confirm)
  monarch: { symbol: "MONARCH", exchange: "NSE" }, // Monarch Networth Capital (confirm)
  damcapital: { symbol: "DAMCAPITAL", exchange: "NSE" }, // DAM Capital Advisors (confirm)
  somanycera: { symbol: "SOMANYCERA", exchange: "NSE" }, // Somany Ceramics (confirm)
  "elecon engineering company limited (xnse:elecon)": { symbol: "ELECON", exchange: "NSE" }, // from XNSE:ELECON
  // — ticker_map present but strips to an unsendable symbol —
  annapurna: { symbol: "ANNAPURNA", exchange: "NSE" }, // Annapurna Swadisht; ticker_map has SME suffix ANNAPURNA-SM (confirm)

  // — Deliberately unmapped (Trendlyne has no India listing) —
  "national stock exchange (nse)": null, // NSE itself is unlisted
  "capitaland india reit": null, // Singapore-listed (CY6U.SI); Trendlyne is India-only

  // — TODO: confirm Trendlyne symbol once M0 is live (currently null via reject → empty state) —
  // "500068": { symbol: "?", exchange: "BSE" },
  // "517417": { symbol: "?", exchange: "BSE" },
  // "xbom:522101": { symbol: "?", exchange: "BSE" }, // ticker_map KLBRENG-B.BO (B-series suffix)
};

const stripExchangeSuffix = (yahoo: string): string => yahoo.replace(/\.(NS|BO)$/i, "");

// Symbols we must NOT send upstream (would only 404 and waste quota): empty, foreign (still has
// a "."), exchange-prefixed (XBOM:/XNSE:), pure numeric BSE codes, or SME/series suffixes.
const isUnsendable = (sym: string): boolean =>
  !sym ||
  sym.includes(".") ||
  sym.includes(":") ||
  /^\d+$/.test(sym) ||
  /-(SM|SME|ST|BE|BZ|B)$/.test(sym);

/**
 * Resolve a tikr to its Trendlyne symbol, or `null` when no usable mapping exists.
 * Pure — `tickerMap` is passed in (loaded from the snapshot by the caller).
 */
export function resolveTrendlyneSymbol(
  tikr: string,
  tickerMap: Record<string, string>,
): ResolvedSymbol | null {
  if (!tikr) return null;

  // 1. Override (incl. explicit null for known-unmapped).
  const ov = TRENDLYNE_SYMBOL_OVERRIDE[tikr.toLowerCase()];
  if (ov !== undefined) return ov;

  // 2. ticker_map (exact key, mirroring /api/quotes).
  const yahoo = tickerMap[tikr];
  if (!yahoo) return null;

  const exchange: Exchange = /\.BO$/i.test(yahoo) ? "BSE" : "NSE";
  const symbol = stripExchangeSuffix(yahoo).toUpperCase();

  // 3. Reject un-sendable symbols (needs an override to fix).
  if (isUnsendable(symbol)) return null;

  return { symbol, exchange };
}
