// Stocks hidden by DEFAULT in the mobile watchlist (reveal via the "Show hidden" filter).
// Distinct from lib/removedStocks.ts, which removes names globally from every surface.
// These are names de-prioritized on mobile per user review (2026-06-20). Matched by tikr
// (case-insensitive). Note: most are also conviction < 4 (filtered out by the default
// Conviction 4+ filter anyway); OIL and Hindpetro are conviction 4, so they need this list.
export const MOBILE_HIDDEN_TIKRS: ReadonlySet<string> = new Set(
  [
    "ANNAPURNA",     // Annapurna Swadisht
    "XBOM:516003",   // Duroply Industries
    "538734",        // Ceinsys Tech
    "OIL",           // Oil India
    "BPCL",          // Bharat Petroleum
    "CYIENT",        // Cyient
    "LICHSGFIN",     // LIC Housing Finance
    "Hindpetro",     // Hindustan Petroleum
    "IOC",           // Indian Oil
    "TATAELXSI",     // Tata Elxsi
  ].map((t) => t.toLowerCase()),
);

export function isMobileHidden(tikr: string): boolean {
  return MOBILE_HIDDEN_TIKRS.has(tikr.toLowerCase());
}
