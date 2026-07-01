// Cell-building helpers for ComparisonTable rows.
// Extracted from comparisonRows.tsx to keep that file under 400 lines.
// These are pure render helpers — no side-effects, no hooks.

import type { ReactNode } from "react";
import { fmtRupee, fmtPct, fmtNum } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";

export const EMPTY = "—";
export const LOADING = "…";

/** ₹price + signed upside% inline. */
export function priceWithUpside(price: number | null, cmp: number | null): ReactNode {
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

/** Valuation multiple: base-band first, else live "cur" fallback, else "—". */
export function multipleCell(band: number | null, live: number | null): ReactNode {
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

/** Recommendation chip — glyph-paired, never color-only. */
export function RecChip({ rec }: { rec: string | null }): ReactNode {
  if (!rec) return <span className="cmp-ct-dash">{EMPTY}</span>;
  const upper = rec.toUpperCase();
  let cls = "cmp-rec-chip";
  if (upper === "BUY" || upper === "STRONG_BUY") cls += " is-buy";
  else if (upper === "SELL" || upper === "STRONG_SELL") cls += " is-sell";
  else cls += " is-hold";
  return <span className={cls}>{upper.replace("_", " ")}</span>;
}
