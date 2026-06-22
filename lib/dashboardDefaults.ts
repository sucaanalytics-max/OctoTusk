// Out-of-the-box default filter/view state for the desktop Octopus table
// (app/dashboard/DashboardClient.tsx). Kept in this non-frozen module so the
// list can change without editing the frozen DashboardClient monolith.
// Pattern mirrors lib/removedStocks.ts and lib/mobile/hiddenStocks.ts.

/** Conviction filter default for the desktop Octopus table: show conviction >= 4 ("4+"). */
export const DEFAULT_CONVICTION_FILTER = "4";

/**
 * Stocks hidden by default on the desktop Octopus table (reveal via the "Hidden (N)" view).
 * Keyed by EXACT, case-sensitive `tikr` — matches DashboardClient's `hiddenStocks.has(s.tikr)`.
 * Verified against data/database.json on 2026-06-22.
 *
 * NOTE: This is intentionally SEPARATE from lib/mobile/hiddenStocks.ts, which hides a different
 * set of 10 (incl. LICHSGFIN; omits COFORGE/FSL/OFSS/E2E). Do not unify — desktop != mobile by design.
 */
export const DEFAULT_HIDDEN_TIKRS: ReadonlySet<string> = new Set<string>([
  "ANNAPURNA",   // Annapurna Swadisht (conv 3)
  "XBOM:516003", // Duroply Industries (conv 3)
  "538734",      // Ceinsys Tech (conv 3)
  "COFORGE",     // Coforge (conv 3)
  "FSL",         // Firstsource Solutions (conv 3)
  "BPCL",        // Bharat Petroleum (conv 3)
  "CYIENT",      // Cyient (conv 3)
  "IOC",         // Indian Oil (conv 3)
  "OFSS",        // Oracle Financial Services (conv 3)
  "TATAELXSI",   // Tata Elxsi (conv 3)
  "OIL",         // Oil India (conv 4 — hidden despite 4+)
  "Hindpetro",   // Hindustan Petroleum (conv 4 — hidden despite 4+)
  "E2E",         // E2E Networks (conv 5 — hidden despite 4+)
]);
