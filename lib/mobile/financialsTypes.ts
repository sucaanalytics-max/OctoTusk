// Types + display metadata for Trendlyne financials. PURE + secret-free, so it is safe to
// import from both server (lib/trendlyne.ts, lib/mobile/financials.ts, the API route) and
// client (FinancialsDetailClient / StatementTable). The server stores the verbatim doPost
// body as jsonb; FinPayload is the *projection* shipped to the client (no `raw` — keeps
// payloads lean and avoids leaking any future field we haven't vetted).

export type Exchange = "NSE" | "BSE";

export type FinStatementKey =
  | "pnl_annual"
  | "pnl_quarterly"
  | "balance_sheet"
  | "cash_flow"
  | "ratios"
  | "valuations"
  | "shareholding";

/** One line item across periods. `values[i]` aligns with `FinStatement.periods[i]`. */
export interface FinRow {
  label: string;
  key?: string;
  values: (number | null)[];
}

/** A single statement: column headers (`periods`, oldest→newest) + line-item rows. */
export interface FinStatement {
  periods: string[];
  rows: FinRow[];
}

/** Typed projection of a doPost success body. Shape-tolerant: any statement may be absent. */
export interface FinPayload {
  symbol: string;
  exchange: Exchange;
  name?: string;
  currency?: string;
  unit?: string; // e.g. "Cr"
  generatedAt?: string;
  statements: Partial<Record<FinStatementKey, FinStatement>>;
}

export type FinSource = "webapp" | "cache" | "not_found" | "manual";

export interface FinMeta {
  symbol: string | null;
  exchange: Exchange | null;
  fetchedAt: string | null;
  stale: boolean;
  source: FinSource;
  /** Why payload is null, when applicable — drives the empty-state copy. */
  reason?: "no_symbol_mapping" | "not_found" | "not_cached" | "unconfigured" | "budget_exhausted" | "fetch_failed" | "in_progress";
}

export interface FinResult {
  payload: FinPayload | null;
  meta: FinMeta;
}

/** Render order + human labels for the statement switcher. Absent statements are skipped. */
export const STATEMENT_ORDER: FinStatementKey[] = [
  "pnl_annual",
  "pnl_quarterly",
  "balance_sheet",
  "cash_flow",
  "ratios",
  "valuations",
  "shareholding",
];

export const STATEMENT_LABEL: Record<FinStatementKey, string> = {
  pnl_annual: "P&L · Annual",
  pnl_quarterly: "P&L · Quarterly",
  balance_sheet: "Balance Sheet",
  cash_flow: "Cash Flow",
  ratios: "Ratios",
  valuations: "Valuations",
  shareholding: "Shareholding",
};

/** Rows whose label implies a percentage (rendered with a % suffix, no ₹). */
export const PERCENT_HINT = /%|margin|yield|roe|roce|ratio|payout|growth|promoter|fii|dii|public/i;
