// Row definitions for ComparisonTable — extracted to keep the component under 400 lines.
// Each group has a title + rows; each row has a label and a render function.
// The render function receives a Col (pre-resolved) and returns a ReactNode.

import type { ReactNode } from "react";
import { fmtRupee, fmtPct, fmtNum } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";
import type { CompareStock, CompareQuote, CompareEnrichment, ScorecardRow } from "@/lib/compare/types";

export const EMPTY = "—";
export const LOADING = "…";

/** Column context passed to every render fn */
export interface Col {
  stock: CompareStock;
  row: ScorecardRow;          // scorecard row for this stock (by tikr)
  cmp: number | null;
  isLive: boolean;
  q: CompareQuote | null;
  e: CompareEnrichment | null;
  enrichmentLoading: boolean;
}

export type CellRender = (col: Col) => ReactNode;

export interface ComparisonRow {
  label: string;
  render: CellRender;
}

export interface ComparisonGroup {
  title: string;
  rows: ComparisonRow[];
}

// Helper: price + upside % inline.
function priceWithUpside(price: number | null, cmp: number | null): ReactNode {
  if (price == null) return EMPTY;
  const up = scenarioUpside(price, cmp);
  const upText = up != null ? fmtPct(up) : null;
  const upCls = up == null ? "" : up >= 0 ? " is-pos" : " is-neg";
  return (
    <>
      {fmtRupee(price)}
      {upText && <span className={`cmp-ct-upside${upCls}`}>{upText}</span>}
    </>
  );
}

// Helper: base-band multiple, else live current multiple with "cur" flag, else "—".
function multipleCell(band: number | null, live: number | null): ReactNode {
  if (band != null) return <>{`${fmtNum(band, 1)}×`}</>;
  if (live != null)
    return (
      <>
        {`${fmtNum(live, 1)}×`}
        <span className="cmp-ct-cur">cur</span>
      </>
    );
  return EMPTY;
}

function RecChip({ rec }: { rec: string | null }) {
  if (!rec) return <span className="cmp-ct-dash">{EMPTY}</span>;
  const upper = rec.toUpperCase();
  let cls = "cmp-rec-chip";
  if (upper === "BUY" || upper === "STRONG_BUY") cls += " is-buy";
  else if (upper === "SELL" || upper === "STRONG_SELL") cls += " is-sell";
  else cls += " is-hold";
  return <span className={cls}>{upper.replace("_", " ")}</span>;
}

export const COMPARISON_GROUPS: ComparisonGroup[] = [
  {
    title: "Price",
    rows: [
      {
        label: "CMP",
        render: ({ cmp, isLive }) =>
          cmp != null ? (
            <>
              {fmtRupee(cmp)}
              {isLive && <span className="cmp-ct-live">live</span>}
            </>
          ) : (
            EMPTY
          ),
      },
    ],
  },
  {
    title: "Our Research",
    rows: [
      { label: "Bear", render: ({ stock, cmp }) => priceWithUpside(stock.bear, cmp) },
      { label: "Base", render: ({ stock, cmp }) => priceWithUpside(stock.base, cmp) },
      { label: "Bull", render: ({ stock, cmp }) => priceWithUpside(stock.bull, cmp) },
      { label: "Target 1Y", render: ({ stock, cmp }) => priceWithUpside(stock.target1y, cmp) },
      { label: "Target 2Y", render: ({ stock, cmp }) => priceWithUpside(stock.target2y, cmp) },
    ],
  },
  {
    title: "Model",
    rows: [
      {
        label: "Exp. return (model)",
        render: ({ row }) => {
          const er = row.expectedReturn;
          if (er == null) return <span className="is-muted">{EMPTY}</span>;
          const cls = er > 0 ? "is-pos" : er < 0 ? "is-neg" : "";
          return <span className={cls}>{fmtPct(er)}</span>;
        },
      },
      {
        label: "Up / Down ratio",
        render: ({ row }) => {
          if (row.upDownNote === "below-bear")
            return (
              <span className="cmp-sc-below-bear" title="CMP below bear — entire band is upside">
                &#x25B2; below bear
              </span>
            );
          if (row.upDownNote === "missing")
            return <span className="is-muted">{EMPTY}</span>;
          const v = row.upDownRatio;
          const display = v != null ? fmtNum(v, 1) + "×" : EMPTY;
          const cls = v != null && v > 0 ? "is-pos" : "is-muted";
          return <span className={cls}>{display}</span>;
        },
      },
      {
        label: "Downside to bear",
        render: ({ row }) => {
          const c = row.cushionToBear;
          if (c == null) return <span className="is-muted">{EMPTY}</span>;
          if (c <= 0) return <span className="is-pos">below bear</span>;
          return <span className="is-warn">{fmtPct(-c)}</span>;
        },
      },
    ],
  },
  {
    title: "Quality",
    rows: [
      {
        label: "Conviction",
        render: ({ stock }) =>
          stock.conviction != null ? String(Math.round(stock.conviction)) : EMPTY,
      },
      {
        label: "Analyst Score (1–5)",
        render: ({ stock }) =>
          stock.score != null ? fmtNum(stock.score, 0) : EMPTY,
      },
      {
        label: "VP",
        render: ({ stock }) => stock.vp ?? EMPTY,
      },
      {
        label: "SA",
        render: ({ stock }) => stock.sa ?? EMPTY,
      },
    ],
  },
  {
    title: "Multiples",
    rows: [
      {
        label: "P/E",
        render: ({ stock, q }) =>
          multipleCell(stock.basePe, q?.trailingPE ?? null),
      },
      {
        label: "P/B",
        render: ({ stock, q }) =>
          multipleCell(stock.basePb, q?.priceToBook ?? null),
      },
      {
        label: "EV/EBITDA",
        render: ({ stock, e, enrichmentLoading }) => {
          if (enrichmentLoading)
            return <span className="is-muted">{LOADING}</span>;
          return multipleCell(stock.baseEv, e?.enterpriseToEbitda ?? null);
        },
      },
    ],
  },
  {
    title: "Street",
    rows: [
      {
        label: "Target (mean)",
        render: ({ e, cmp, enrichmentLoading }) => {
          if (enrichmentLoading) return <span className="is-muted">{LOADING}</span>;
          if (!e?.targetMeanPrice) return EMPTY;
          const up = scenarioUpside(e.targetMeanPrice, cmp);
          const upText = up != null ? fmtPct(up) : null;
          const upCls = up == null ? "" : up >= 0 ? " is-pos" : " is-neg";
          return (
            <>
              {fmtRupee(e.targetMeanPrice)}
              {upText && <span className={`cmp-ct-upside${upCls}`}>{upText}</span>}
            </>
          );
        },
      },
      {
        label: "Recommendation",
        render: ({ e, enrichmentLoading }) => {
          if (enrichmentLoading) return <span className="is-muted">{LOADING}</span>;
          return <RecChip rec={e?.recommendationKey ?? null} />;
        },
      },
      {
        label: "# Analysts",
        render: ({ e, enrichmentLoading }) => {
          if (enrichmentLoading) return <span className="is-muted">{LOADING}</span>;
          return e?.numberOfAnalystOpinions != null
            ? `${e.numberOfAnalystOpinions}`
            : EMPTY;
        },
      },
      {
        label: "Trailing P/E",
        render: ({ q }) =>
          q?.trailingPE != null ? fmtNum(q.trailingPE, 1) : EMPTY,
      },
      {
        label: "Forward P/E",
        render: ({ q }) =>
          q?.forwardPE != null ? fmtNum(q.forwardPE, 1) : EMPTY,
      },
    ],
  },
];
