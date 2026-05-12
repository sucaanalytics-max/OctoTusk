/**
 * NSE / macro index symbols rendered on the Octopus dashboard's top strip.
 *
 * Each entry has a primary Yahoo Finance symbol and an optional fallback;
 * the indices route tries the primary first and falls back if the response
 * lacks `regularMarketPrice`. Tiles that fail BOTH render `—`.
 */

export interface IndexSymbol {
  /** Short display name on the wall display (e.g. "NIFTY 50") */
  label: string;
  /** Preferred Yahoo Finance symbol */
  primary: string;
  /** Fallback symbol if primary doesn't return a price */
  fallback?: string;
}

// Row 1 — broad market + macro context.
export const OCTOPUS_INDICES_BROAD: IndexSymbol[] = [
  { label: "NIFTY 50",           primary: "^NSEI",      fallback: "^CNX_NIFTY" },
  { label: "NIFTY NEXT 50",      primary: "^NSMIDCP",   fallback: "^CNXNXT50" },
  { label: "NIFTY MIDCAP 100",   primary: "^CNXMIDCAP", fallback: "NIFTY_MIDCAP_100.NS" },
  { label: "NIFTY SMALLCAP 100", primary: "^CNXSC",     fallback: "NIFTY_SMLCAP_100.NS" },
  { label: "SENSEX",             primary: "^BSESN" },
  { label: "INDIA VIX",          primary: "^INDIAVIX",  fallback: "INDIAVIX.NS" },
  { label: "USD / INR",          primary: "USDINR=X",   fallback: "INR=X" },
];

// Row 2 — NSE sectoral indices the firm actively tracks.
export const OCTOPUS_INDICES_SECTOR: IndexSymbol[] = [
  { label: "BANK",       primary: "^NSEBANK",   fallback: "^CNXBANK" },
  { label: "FIN SVCS",   primary: "^CNXFIN",    fallback: "NIFTY_FIN_SERVICE.NS" },
  { label: "IT",         primary: "^CNXIT",     fallback: "^NSEIT" },
  { label: "AUTO",       primary: "^CNXAUTO",   fallback: "^NSEAUTO" },
  { label: "PHARMA",     primary: "^CNXPHARMA", fallback: "^NSEPHARMA" },
  { label: "FMCG",       primary: "^CNXFMCG",   fallback: "^NSEFMCG" },
  { label: "REALTY",     primary: "^CNXREALTY", fallback: "^NSEREALTY" },
  { label: "METAL",      primary: "^CNXMETAL",  fallback: "^NSEMETAL" },
  { label: "ENERGY",     primary: "^CNXENERGY", fallback: "^NSEENERGY" },
  { label: "HEALTHCARE", primary: "^CNXHEALTH",  fallback: "NIFTY_HEALTHCARE.NS" },
];

// Combined list — the indices route fetches this; IndexStrip renders the two
// arrays as separate rows.
export const OCTOPUS_INDICES: IndexSymbol[] = [
  ...OCTOPUS_INDICES_BROAD,
  ...OCTOPUS_INDICES_SECTOR,
];
