// Types for the /research/compare analytical comparison route.
// Deliberately decoupled from the frozen DashboardClient monolith; mirrors lib/mobile/types.ts.

/** A stock shaped for the comparison surface (subset of the snapshot, null-normalized). */
export interface CompareStock {
  tikr: string;
  name: string;             // official_name ?? tikr
  sector: string;
  subsector: string;
  cmp: number | null;       // snapshot CMP — fallback before live quotes arrive (>0 else null)
  // Internal research scenarios (absolute prices)
  bear: number | null;
  base: number | null;
  bull: number | null;
  target1y: number | null;
  target2y: number | null;
  // Precomputed snapshot upsides (fractions; may be negative) — fallback for the detail table
  upsideBear: number | null;
  upsideBase: number | null;
  upsideBull: number | null;
  upside1y: number | null;
  upside2y: number | null;
  // Valuation bands (snapshot uses 0/undefined as a "no-data" sentinel → coerced to null)
  bearPe: number | null; basePe: number | null; bullPe: number | null; basePe2sd: number | null;
  bearPb: number | null; basePb: number | null; bullPb: number | null; basePb2sd: number | null;
  bearEv: number | null; baseEv: number | null; bullEv: number | null; baseEv2sd: number | null;
  // Fundamentals / internal scoring
  conviction: number | null;
  understanding: number | null;
  score: number | null;
  vp: string | null;        // value-pick analyst code (e.g. "AA")
  sa: string | null;        // sell-analyst code (e.g. "KS")
  divYield: number | null;
  inFno: boolean;
}

/** Live quote fields read from GET /api/quotes (a superset of lib/mobile's Quote). */
export interface CompareQuote {
  price: number;            // 0 on a Yahoo miss — callers MUST guard > 0
  change: number;
  changePct: number;
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  dividendYield: number | null;
  volume: number;
}
export type CompareQuotesMap = Record<string, CompareQuote>;

/** Lazy fundamentals/consensus read from GET /api/enrichment/[tikr]. */
export interface CompareEnrichment {
  beta: number | null;
  pegRatio: number | null;
  enterpriseValue: number | null;
  enterpriseToEbitda: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  grossMargins: number | null;
  ebitdaMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  freeCashflow: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  currentRatio: number | null;
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  numberOfAnalystOpinions: number | null;
  recommendationKey: string | null;
}
export type CompareEnrichmentMap = Record<string, CompareEnrichment>;

/** Why an up/down ratio is what it is — drives honest rendering (never silently "—"). */
export type UpDownNote = "normal" | "below-bear" | "no-base-upside" | "missing";

/** Output of the risk-adjusted engine, one per compared stock. */
export interface ScorecardRow {
  tikr: string;
  cmp: number | null;          // resolved CMP (live > 0 else snapshot)
  cmpIsLive: boolean;
  upDownRatio: number | null;  // base upside ÷ bear downside; null unless note is normal/no-base-upside
  upDownNote: UpDownNote;
  expectedReturn: number | null; // conviction-weighted (model), fraction
  cushionToBear: number | null;  // (cmp − bear)/cmp; >0 = room to fall to bear, <0 = below bear (deep value)
  rankScore: number | null;      // composite [0,1], highlight only — never shown as a number
  isLeader: boolean;
}
