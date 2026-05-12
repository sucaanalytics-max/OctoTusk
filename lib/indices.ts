/**
 * NSE index symbols used by the Octopus dashboard's top strip.
 *
 * Each entry has a primary Yahoo Finance symbol and an optional fallback;
 * the indices route tries the primary first and falls back if the response
 * lacks `regularMarketPrice`. Both lists are kept here so /api/indices and
 * any UI defaults stay in lockstep.
 */

export interface IndexSymbol {
  /** Short display name on the wall display (e.g. "NIFTY 50") */
  label: string;
  /** Preferred Yahoo Finance symbol */
  primary: string;
  /** Fallback symbol if primary doesn't return a price */
  fallback?: string;
}

export const OCTOPUS_INDICES: IndexSymbol[] = [
  { label: "NIFTY 50",     primary: "^NSEI",      fallback: "^CNX_NIFTY" },
  { label: "NIFTY BANK",   primary: "^NSEBANK",   fallback: "^CNXBANK" },
  { label: "NIFTY IT",     primary: "^CNXIT",     fallback: "^NSEIT" },
  { label: "NIFTY AUTO",   primary: "^CNXAUTO",   fallback: "^NSEAUTO" },
  { label: "NIFTY PHARMA", primary: "^CNXPHARMA", fallback: "^NSEPHARMA" },
  { label: "NIFTY FMCG",   primary: "^CNXFMCG",   fallback: "^NSEFMCG" },
];
