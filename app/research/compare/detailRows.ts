// Section and row definitions for DetailTable.
// Extracted to keep DetailTable.tsx under 400 lines.
// Each row maps a label to extractor functions for CompareStock, quote, and enrichment.

import { fmtRupee, fmtPct, fmtPctRaw, fmtNum, fmtCr } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";
import type { CompareStock, CompareQuote, CompareEnrichment } from "@/lib/compare/types";

export interface DetailRow {
  label: string;
  /** Uniform unit suffix for this row's values, rendered in the frozen rail. e.g. "·₹", "·%", "·×" */
  unit?: string;
  getValue: (s: CompareStock, q: CompareQuote | null, e: CompareEnrichment | null, cmp: number | null) => string;
}

export interface DetailSection {
  title: string;
  /** Uniform unit that applies to all rows in this section (overridden by row.unit if set). */
  sectionUnit?: string;
  /** Muted note shown beside the section title — e.g. "not ranked" for multiples. */
  note?: string;
  rows: DetailRow[];
}

export const DETAIL_SECTIONS: DetailSection[] = [
  {
    title: "Price & Valuation",
    sectionUnit: "·₹",
    rows: [
      { label: "CMP", getValue: (_, q, __, cmp) => cmp != null ? fmtRupee(cmp) : "—" },
      { label: "Bear", getValue: (s) => s.bear != null ? fmtRupee(s.bear) : "—" },
      { label: "Base", getValue: (s) => s.base != null ? fmtRupee(s.base) : "—" },
      { label: "Bull", getValue: (s) => s.bull != null ? fmtRupee(s.bull) : "—" },
      { label: "Target 1Y", getValue: (s) => s.target1y != null ? fmtRupee(s.target1y) : "—" },
      { label: "Target 2Y", getValue: (s) => s.target2y != null ? fmtRupee(s.target2y) : "—" },
    ],
  },
  {
    title: "Upside Analysis",
    rows: [
      {
        label: "Bear upside (snap)",
        unit: "·%",
        getValue: (s, _, __, cmp) => {
          const u = s.upsideBear ?? scenarioUpside(s.bear, cmp);
          return u != null ? fmtPct(u) : "—";
        },
      },
      {
        label: "Base upside (snap)",
        unit: "·%",
        getValue: (s, _, __, cmp) => {
          const u = s.upsideBase ?? scenarioUpside(s.base, cmp);
          return u != null ? fmtPct(u) : "—";
        },
      },
      {
        label: "Bull upside (snap)",
        unit: "·%",
        getValue: (s, _, __, cmp) => {
          const u = s.upsideBull ?? scenarioUpside(s.bull, cmp);
          return u != null ? fmtPct(u) : "—";
        },
      },
      {
        label: "1Y upside (snap)",
        unit: "·%",
        getValue: (s, _, __, cmp) => {
          const u = s.upside1y ?? scenarioUpside(s.target1y, cmp);
          return u != null ? fmtPct(u) : "—";
        },
      },
      {
        label: "2Y upside (snap)",
        unit: "·%",
        getValue: (s, _, __, cmp) => {
          const u = s.upside2y ?? scenarioUpside(s.target2y, cmp);
          return u != null ? fmtPct(u) : "—";
        },
      },
      { label: "Conviction", unit: "·/5", getValue: (s) => s.conviction != null ? fmtNum(s.conviction, 0) : "—" },
      { label: "Understanding", unit: "·/5", getValue: (s) => s.understanding != null ? fmtNum(s.understanding, 0) : "—" },
      { label: "VP", getValue: (s) => s.vp ?? "—" },
      { label: "SA", getValue: (s) => s.sa ?? "—" },
    ],
  },
  {
    title: "Valuation Multiples",
    sectionUnit: "·×",
    note: "not ranked",
    rows: [
      { label: "Bear P/E", getValue: (s) => s.bearPe != null ? fmtNum(s.bearPe, 1) : "—" },
      { label: "Base P/E", getValue: (s) => s.basePe != null ? fmtNum(s.basePe, 1) : "—" },
      { label: "Bull P/E", getValue: (s) => s.bullPe != null ? fmtNum(s.bullPe, 1) : "—" },
      { label: "Base P/E +2SD", getValue: (s) => s.basePe2sd != null ? fmtNum(s.basePe2sd, 1) : "—" },
      { label: "Bear P/B", getValue: (s) => s.bearPb != null ? fmtNum(s.bearPb, 1) : "—" },
      { label: "Base P/B", getValue: (s) => s.basePb != null ? fmtNum(s.basePb, 1) : "—" },
      { label: "Bull P/B", getValue: (s) => s.bullPb != null ? fmtNum(s.bullPb, 1) : "—" },
      { label: "Base P/B +2SD", getValue: (s) => s.basePb2sd != null ? fmtNum(s.basePb2sd, 1) : "—" },
      { label: "Bear EV/EBITDA", getValue: (s) => s.bearEv != null ? fmtNum(s.bearEv, 1) : "—" },
      { label: "Base EV/EBITDA", getValue: (s) => s.baseEv != null ? fmtNum(s.baseEv, 1) : "—" },
      { label: "Bull EV/EBITDA", getValue: (s) => s.bullEv != null ? fmtNum(s.bullEv, 1) : "—" },
      { label: "Base EV/EBITDA +2SD", getValue: (s) => s.baseEv2sd != null ? fmtNum(s.baseEv2sd, 1) : "—" },
    ],
  },
  {
    title: "Fundamentals",
    rows: [
      { label: "Beta", getValue: (_, __, e) => e?.beta != null ? fmtNum(e.beta, 2) : "—" },
      { label: "PEG Ratio", getValue: (_, __, e) => e?.pegRatio != null ? fmtNum(e.pegRatio, 1) : "—" },
      { label: "Enterprise Value", getValue: (_, __, e) => e?.enterpriseValue != null ? fmtCr(e.enterpriseValue) : "—" },
      { label: "EV/EBITDA", getValue: (_, __, e) => e?.enterpriseToEbitda != null ? fmtNum(e.enterpriseToEbitda, 1) : "—" },
      { label: "Debt/Equity", getValue: (_, __, e) => e?.debtToEquity != null ? fmtNum(e.debtToEquity, 1) : "—" },
      { label: "Current Ratio", getValue: (_, __, e) => e?.currentRatio != null ? fmtNum(e.currentRatio, 1) : "—" },
      { label: "Free Cashflow", getValue: (_, __, e) => e?.freeCashflow != null ? fmtCr(e.freeCashflow) : "—" },
      // Snapshot div_yield is ALREADY a percent (e.g. 1.5 = 1.5%) — use fmtPctRaw, NOT fmtPct
      // (which would ×100). The live Yahoo dividendYield below IS a fraction, so it uses fmtPct.
      { label: "Div. Yield", getValue: (s) => s.divYield != null ? fmtPctRaw(s.divYield) : "—" },
    ],
  },
  {
    title: "Market Data (Live)",
    rows: [
      { label: "Market Cap", getValue: (_, q) => q?.marketCap != null ? fmtCr(q.marketCap) : "—" },
      { label: "Trailing P/E", getValue: (_, q) => q?.trailingPE != null ? fmtNum(q.trailingPE, 1) : "—" },
      { label: "Forward P/E", getValue: (_, q) => q?.forwardPE != null ? fmtNum(q.forwardPE, 1) : "—" },
      { label: "Price/Book", getValue: (_, q) => q?.priceToBook != null ? fmtNum(q.priceToBook, 1) : "—" },
      { label: "52W High", getValue: (_, q) => q?.fiftyTwoWeekHigh != null ? fmtRupee(q.fiftyTwoWeekHigh) : "—" },
      { label: "52W Low", getValue: (_, q) => q?.fiftyTwoWeekLow != null ? fmtRupee(q.fiftyTwoWeekLow) : "—" },
      { label: "50D Avg", getValue: (_, q) => q?.fiftyDayAverage != null ? fmtRupee(q.fiftyDayAverage) : "—" },
      { label: "200D Avg", getValue: (_, q) => q?.twoHundredDayAverage != null ? fmtRupee(q.twoHundredDayAverage) : "—" },
      { label: "Div. Yield (live)", getValue: (_, q) => q?.dividendYield != null ? fmtPct(q.dividendYield) : "—" },
    ],
  },
  {
    title: "Profitability & Growth",
    rows: [
      { label: "Revenue Growth", getValue: (_, __, e) => e?.revenueGrowth != null ? fmtPct(e.revenueGrowth) : "—" },
      { label: "Earnings Growth", getValue: (_, __, e) => e?.earningsGrowth != null ? fmtPct(e.earningsGrowth) : "—" },
      { label: "Gross Margin", getValue: (_, __, e) => e?.grossMargins != null ? fmtPct(e.grossMargins) : "—" },
      { label: "EBITDA Margin", getValue: (_, __, e) => e?.ebitdaMargins != null ? fmtPct(e.ebitdaMargins) : "—" },
      { label: "Operating Margin", getValue: (_, __, e) => e?.operatingMargins != null ? fmtPct(e.operatingMargins) : "—" },
      { label: "Net Margin", getValue: (_, __, e) => e?.profitMargins != null ? fmtPct(e.profitMargins) : "—" },
      { label: "ROE", getValue: (_, __, e) => e?.returnOnEquity != null ? fmtPct(e.returnOnEquity) : "—" },
      { label: "ROA", getValue: (_, __, e) => e?.returnOnAssets != null ? fmtPct(e.returnOnAssets) : "—" },
      { label: "Street Target (mean)", getValue: (_, __, e) => e?.targetMeanPrice != null ? fmtRupee(e.targetMeanPrice) : "—" },
      { label: "Street Target (high)", getValue: (_, __, e) => e?.targetHighPrice != null ? fmtRupee(e.targetHighPrice) : "—" },
      { label: "Street Target (low)", getValue: (_, __, e) => e?.targetLowPrice != null ? fmtRupee(e.targetLowPrice) : "—" },
      { label: "Recommendation", getValue: (_, __, e) => e?.recommendationKey != null ? e.recommendationKey.toUpperCase() : "—" },
      { label: "Analysts", getValue: (_, __, e) => e?.numberOfAnalystOpinions != null ? `${e.numberOfAnalystOpinions}` : "—" },
    ],
  },
];
