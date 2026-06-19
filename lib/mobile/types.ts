// Mobile-local types. Deliberately decoupled from the frozen DashboardClient monolith.

/** A stock shaped for mobile consumption (subset of the snapshot, normalized). */
export interface MobileStock {
  tikr: string;
  name: string;            // official_name ?? tikr
  sector: string;
  subsector: string;
  cmp: number | null;      // snapshot CMP — fallback before live quotes arrive
  bear: number | null;
  base: number | null;
  bull: number | null;
  target1y: number | null;
  basePe: number | null;
  basePb: number | null;
  baseEvEbitda: number | null;
  conviction: number | null;
  understanding: number | null;
  vp: string | null;
  sa: string | null;
  divYield: number | null;
  inFno: boolean;
}

/** Live quote fields the mobile UI reads from GET /api/quotes (session-gated). */
export interface Quote {
  price: number;
  change: number;
  changePct: number;
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  trailingPE: number | null;
  marketCap: number | null;
  volume: number;
}

export type QuotesMap = Record<string, Quote>;

export type FreshnessState = "LIVE" | "STALE" | "DISCONNECTED" | "CLOSED" | "LOADING";
