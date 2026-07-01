// Row definitions for ComparisonTable — extracted to keep the component under 400 lines.
// Each group has a title + rows; each row has a label, optional unit suffix, and a render fn.
// The render function receives a Col (pre-resolved) and returns a ReactNode.
//
// Change 2 (2026-06-30): ComparisonRow gains optional `metric`, `goal`, `bar` fields so
// ComparisonTable can compute per-row winner highlights and inline magnitude bars.
// Change 3 (2026-07-01): `unit` field added for the frozen metric-rail unit suffix.
// Cell helpers extracted to comparisonHelpers.tsx.

import type { ReactNode } from "react";
import { fmtPct, fmtNum } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";
import { EMPTY, LOADING, priceWithUpside, multipleCell, RecChip } from "./comparisonHelpers";
import type {
  CompareStock,
  CompareQuote,
  CompareEnrichment,
  ScorecardRow,
} from "@/lib/compare/types";

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

/** Direction of "better": max = higher wins; minAbs = smallest magnitude wins. */
export type Goal = "max" | "minAbs";

/** Bar style: signed = center-zero green≥0/red<0; risk = amber right-to-center; false = no bar. */
export type BarStyle = "signed" | "risk" | false;

export interface ComparisonRow {
  label: string;
  /** Muted unit suffix shown in the frozen rail label (e.g. "·₹", "·p.a.", "·/5"). */
  unit?: string;
  render: CellRender;
  /** Returns the comparable numeric value for a column. null = not comparable. */
  metric?: (col: Col) => number | null;
  /** Direction of "better". Required when metric is set. */
  goal?: Goal;
  /** Bar style below the value. false/absent = no bar. */
  bar?: BarStyle;
}

export interface ComparisonGroup {
  title: string;
  /** Muted secondary note shown in the group band. */
  note?: string;
  rows: ComparisonRow[];
}

export const COMPARISON_GROUPS: ComparisonGroup[] = [
  {
    title: "Price",
    rows: [
      {
        label: "CMP",
        unit: "·₹",
        render: ({ cmp, isLive }) =>
          cmp != null ? (
            <>
              {/* CMP row rendered in the two-tier header; this cell is a fallback. */}
              {String(cmp)}
              {isLive && <span className="cmp-ct-live">live</span>}
            </>
          ) : (
            EMPTY
          ),
        // No metric/goal — CMP comparison is ambiguous; no winner highlight.
      },
    ],
  },
  {
    title: "Our Research",
    note: "prices not ranked",
    rows: [
      {
        label: "Bear",
        unit: "·₹",
        render: ({ stock, cmp }) => priceWithUpside(stock.bear, cmp),
        metric: ({ stock, cmp }) => scenarioUpside(stock.bear, cmp),
        goal: "max",
        bar: "signed",
      },
      {
        label: "Base",
        unit: "·₹",
        render: ({ stock, cmp }) => priceWithUpside(stock.base, cmp),
        metric: ({ stock, cmp }) => scenarioUpside(stock.base, cmp),
        goal: "max",
        bar: "signed",
      },
      {
        label: "Bull",
        unit: "·₹",
        render: ({ stock, cmp }) => priceWithUpside(stock.bull, cmp),
        metric: ({ stock, cmp }) => scenarioUpside(stock.bull, cmp),
        goal: "max",
        bar: "signed",
      },
      {
        label: "Target 1Y",
        unit: "·₹",
        render: ({ stock, cmp }) => priceWithUpside(stock.target1y, cmp),
        metric: ({ stock, cmp }) => scenarioUpside(stock.target1y, cmp),
        goal: "max",
        bar: "signed",
      },
      {
        label: "Target 2Y",
        unit: "·₹",
        render: ({ stock, cmp }) => priceWithUpside(stock.target2y, cmp),
        metric: ({ stock, cmp }) => scenarioUpside(stock.target2y, cmp),
        goal: "max",
        bar: "signed",
      },
    ],
  },
  {
    title: "Model",
    rows: [
      {
        label: "Exp. return",
        unit: "·p.a.",
        render: ({ row }) => {
          const er = row.expReturnAnn;
          if (er == null) return <span className="is-muted">{EMPTY}</span>;
          const cls = er > 0 ? "is-pos" : er < 0 ? "is-neg" : "";
          return <span className={cls}>{fmtPct(er)}</span>;
        },
        metric: ({ row }) => row.expReturnAnn,
        goal: "max",
        bar: "signed",
      },
      {
        label: "Up / Down ratio",
        unit: "·×",
        render: ({ row }) => {
          if (row.upDownNote === "below-bear")
            return (
              <span
                className="cmp-sc-below-bear"
                title="CMP below bear — entire band is upside"
              >
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
        metric: ({ row }) => {
          if (row.upDownNote === "below-bear") return Number.POSITIVE_INFINITY;
          if (row.upDownNote === "no-base-upside") return 0;
          if (row.upDownNote === "normal") return row.upDownRatio;
          return null; // "missing"
        },
        goal: "max",
        bar: false, // ratios don't bar well — highlight winner only
      },
      {
        label: "Position in range",
        // No unit — rendered as a mini-track widget in ComparisonTable.
        render: ({ row }) => {
          const zone = row.scenarioZone;
          if (zone == null) return <span className="is-muted">{EMPTY}</span>;
          const bp = row.bandPos;
          const bpText = bp != null ? ` (${Math.round(bp * 100)}%)` : "";
          const cls =
            zone === "cheap" ? "is-pos" : zone === "rich" ? "is-neg" : "is-muted";
          const label =
            zone === "cheap" ? "Cheap" : zone === "rich" ? "Rich" : "Fair";
          return <span className={cls}>{label}{bpText}</span>;
        },
        // Categorical — no metric/goal/bar; no winner highlight.
      },
      {
        label: "Downside to bear",
        unit: "·%",
        render: ({ row }) => {
          const c = row.cushionToBear;
          if (c == null) return <span className="is-muted">{EMPTY}</span>;
          if (c <= 0) return <span className="is-pos">below bear</span>;
          return <span className="is-warn">{fmtPct(-c)}</span>;
        },
        // cushionToBear > 0 means downside exists; 0 or below means already safe.
        // goal:"minAbs" → smallest magnitude = least downside = safest.
        metric: ({ row }) => row.cushionToBear,
        goal: "minAbs",
        bar: "risk",
      },
    ],
  },
  {
    title: "Quality",
    rows: [
      {
        label: "Conviction",
        unit: "·/5",
        render: ({ stock }) =>
          stock.conviction != null ? String(Math.round(stock.conviction)) : EMPTY,
        metric: ({ stock }) => (stock.conviction != null ? stock.conviction : null),
        goal: "max",
        bar: false,
      },
      {
        label: "Understanding",
        unit: "·/5",
        render: ({ stock }) =>
          stock.understanding != null ? String(Math.round(stock.understanding)) : EMPTY,
        metric: ({ stock }) => (stock.understanding != null ? stock.understanding : null),
        goal: "max",
        bar: false,
      },
      {
        label: "VP · SA",
        render: ({ stock }) =>
          stock.vp || stock.sa
            ? `${stock.vp ?? "—"} · ${stock.sa ?? "—"}`
            : EMPTY,
        // No metric — text field; ambiguous comparison.
      },
    ],
  },
  {
    title: "Multiples",
    note: "not ranked — cheaper isn't always better",
    rows: [
      {
        label: "P/E",
        unit: "·×",
        render: ({ stock, q }) =>
          multipleCell(stock.basePe, q?.trailingPE ?? null),
        // No metric — negatives + ambiguous "better".
      },
      {
        label: "P/B",
        unit: "·×",
        render: ({ stock, q }) =>
          multipleCell(stock.basePb, q?.priceToBook ?? null),
        // No metric.
      },
      {
        label: "EV/EBITDA",
        unit: "·×",
        render: ({ stock, e, enrichmentLoading }) => {
          if (enrichmentLoading)
            return <span className="is-muted">{LOADING}</span>;
          return multipleCell(stock.baseEv, e?.enterpriseToEbitda ?? null);
        },
        // No metric.
      },
    ],
  },
  {
    title: "Street",
    rows: [
      {
        label: "Target mean",
        unit: "·₹",
        render: ({ e, cmp, enrichmentLoading }) => {
          if (enrichmentLoading) return <span className="is-muted">{LOADING}</span>;
          if (!e?.targetMeanPrice) return EMPTY;
          const up = scenarioUpside(e.targetMeanPrice, cmp);
          const upText = up != null ? fmtPct(up) : null;
          const upCls = up == null ? "" : up >= 0 ? " is-pos" : " is-neg";
          return (
            <>
              {String(e.targetMeanPrice)}
              {upText && <span className={`cmp-ct-upside${upCls}`}>{upText}</span>}
            </>
          );
        },
        metric: ({ e, cmp, enrichmentLoading }) => {
          if (enrichmentLoading || !e?.targetMeanPrice) return null;
          return scenarioUpside(e.targetMeanPrice, cmp);
        },
        goal: "max",
        bar: "signed",
      },
      {
        label: "Recommendation",
        render: ({ e, enrichmentLoading }) => {
          if (enrichmentLoading) return <span className="is-muted">{LOADING}</span>;
          return <RecChip rec={e?.recommendationKey ?? null} />;
        },
        // No metric — categorical.
      },
      {
        label: "# Analysts",
        render: ({ e, enrichmentLoading }) => {
          if (enrichmentLoading) return <span className="is-muted">{LOADING}</span>;
          return e?.numberOfAnalystOpinions != null
            ? `${e.numberOfAnalystOpinions}`
            : EMPTY;
        },
        metric: ({ e, enrichmentLoading }) => {
          if (enrichmentLoading) return null;
          return e?.numberOfAnalystOpinions ?? null;
        },
        goal: "max",
        bar: false,
      },
      {
        label: "Trailing P/E",
        unit: "·×",
        render: ({ q }) =>
          q?.trailingPE != null ? fmtNum(q.trailingPE, 1) : EMPTY,
        // No metric.
      },
      {
        label: "Forward P/E",
        unit: "·×",
        render: ({ q }) =>
          q?.forwardPE != null ? fmtNum(q.forwardPE, 1) : EMPTY,
        // No metric.
      },
    ],
  },
];
