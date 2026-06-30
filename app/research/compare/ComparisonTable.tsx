// Merged comparison table: stock = column, metric = row.
// Groups: Price · Our Research · Model · Quality · Multiples · Street.
// Sticky header + sticky first column via existing cmp-dt-* classes.
// Enrichment-dependent cells show per-cell "…" while loading (not a whole-column skeleton).
// Row defs in comparisonRows.tsx. Single math source: reads ScorecardRow, never re-computes.
//
// Change 2 (2026-06-30): per-row winner highlight + inline magnitude bars.
//   For rows with metric + goal: compute winning column (strictly unique, ≥2 finite values).
//   For rows with bar: render a thin coloured bar under the value cell.

import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { getCompanyShort } from "@/lib/companyName";
import { fmtRupee } from "@/lib/format";
import { COMPARISON_GROUPS, type Col, type ComparisonRow } from "./comparisonRows";
import type {
  CompareStock,
  CompareQuotesMap,
  CompareEnrichmentMap,
  CompareQuote,
  CompareEnrichment,
  ScorecardRow,
} from "@/lib/compare/types";

interface Props {
  rows: ScorecardRow[];
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
  enrichment: CompareEnrichmentMap;
  enrichmentLoading: Record<string, boolean>;
}

/** Determine which column index wins for a given row, or -1 if no unique winner. */
function findWinner(
  groupRow: ComparisonRow,
  cols: Col[]
): number {
  if (!groupRow.metric || !groupRow.goal) return -1;
  const values = cols.map((col) => groupRow.metric!(col));
  const finite = values.filter((v) => v != null && Number.isFinite(v));
  if (finite.length < 2) return -1; // need ≥2 finite values to crown a winner

  // POSITIVE_INFINITY from "below-bear" is valid — treat as the maximum.
  const allVals = values.map((v) =>
    v === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : v
  );

  let bestIdx = -1;
  let bestVal = groupRow.goal === "max" ? -Infinity : Infinity;
  let bestCount = 0;

  for (let i = 0; i < allVals.length; i++) {
    const v = allVals[i];
    if (v == null || !Number.isFinite(v) && v !== Number.POSITIVE_INFINITY) continue;
    const better =
      groupRow.goal === "max" ? v > bestVal : Math.abs(v) < Math.abs(bestVal);
    const tied =
      groupRow.goal === "max" ? v === bestVal : Math.abs(v) === Math.abs(bestVal);
    if (better) {
      bestVal = v;
      bestIdx = i;
      bestCount = 1;
    } else if (tied) {
      bestCount += 1;
    }
  }

  return bestCount === 1 ? bestIdx : -1;
}

/** Bar width fraction [0,1] for each column, or null when no bar should render. */
function computeBars(
  groupRow: ComparisonRow,
  cols: Col[]
): Array<number | null> {
  if (!groupRow.bar || !groupRow.metric) return cols.map(() => null);

  const values = cols.map((col) => groupRow.metric!(col));
  const mags = values.map((v) =>
    v != null && Number.isFinite(v) ? Math.abs(v) : null
  );
  const finite = mags.filter((m): m is number => m != null);
  const rowMaxAbs = finite.length > 0 ? Math.max(...finite) : null;
  if (rowMaxAbs == null || rowMaxAbs === 0) return cols.map(() => null);

  return values.map((v, i) => {
    // For "risk" bars: ≤0 cushion means no downside — render no bar.
    if (groupRow.bar === "risk" && (v == null || v <= 0)) return null;
    const mag = mags[i];
    if (mag == null) return null;
    // Enforce a 4% minimum so tiny bars are still visible.
    return Math.max(0.04, mag / rowMaxAbs);
  });
}

/** Bar fill class from bar style + metric value sign. */
function barFillClass(bar: "signed" | "risk", value: number | null): string {
  if (bar === "risk") return "is-risk";
  if (value == null) return "is-pos";
  return value >= 0 ? "is-pos" : "is-neg";
}

export default function ComparisonTable({
  rows,
  stocks,
  quotes,
  enrichment,
  enrichmentLoading,
}: Props) {
  if (stocks.length === 0) return null;

  // Build per-stock Col context — resolve CMP once.
  const cols: Col[] = stocks.map((stock) => {
    const { cmp, isLive } = resolveCmp(stock, quotes[stock.tikr]);
    const scoreRow = rows.find((r) => r.tikr === stock.tikr);
    const row: ScorecardRow = scoreRow ?? {
      tikr: stock.tikr,
      cmp,
      cmpIsLive: isLive,
      upDownRatio: null,
      upDownNote: "missing",
      expectedReturn: null,
      cushionToBear: null,
      rankScore: null,
      rankParts: { upDown: null, expected: null, cushion: null },
      isLeader: false,
    };
    return {
      stock,
      row,
      cmp,
      isLive,
      q: (quotes[stock.tikr] as CompareQuote | undefined) ?? null,
      e: (enrichment[stock.tikr] as CompareEnrichment | undefined) ?? null,
      enrichmentLoading: !!enrichmentLoading[stock.tikr],
    };
  });

  const totalRows = COMPARISON_GROUPS.reduce((s, g) => s + g.rows.length, 0);

  return (
    <section className="cmp-dt-section" aria-label="Comparison table">
      <h3 className="cmp-section-heading" style={{ padding: "var(--space-4) var(--space-4) 0" }}>
        Side-by-side ({totalRows} metrics)
      </h3>
      <div className="cmp-dt-scroll">
        <table className="cmp-dt-table">
          <thead>
            <tr>
              <th className="cmp-dt-th cmp-dt-metric-col" scope="col">
                Metric
              </th>
              {cols.map(({ stock, cmp, isLive }) => {
                const shortName = getCompanyShort({
                  official_name: stock.name,
                  tikr: stock.tikr,
                });
                return (
                  <th
                    key={stock.tikr}
                    className="cmp-dt-th cmp-dt-stock-col"
                    scope="col"
                  >
                    <div className="cmp-dt-th-name">{shortName}</div>
                    <div className="cmp-dt-th-tikr">{stock.tikr}</div>
                    {cmp != null && (
                      <div className={isLive ? "cmp-dt-th-cmp-live" : "cmp-dt-th-cmp"}>
                        {fmtRupee(cmp)}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {/* One <tbody> per group for consistent zebra striping */}
          {COMPARISON_GROUPS.map((group) => (
            <tbody key={group.title} className="cmp-dt-tbody">
              <tr className="cmp-dt-section-row">
                <td
                  className="cmp-dt-section-label"
                  colSpan={stocks.length + 1}
                >
                  {group.title}
                </td>
              </tr>
              {group.rows.map((groupRow) => {
                // Compute winner index and bar widths for this row.
                const winnerIdx = findWinner(groupRow, cols);
                const bars = computeBars(groupRow, cols);

                return (
                  <tr key={groupRow.label} className="cmp-dt-row">
                    <td className="cmp-dt-td cmp-dt-label-cell">
                      {groupRow.label}
                    </td>
                    {cols.map((col, colIdx) => {
                      const content = groupRow.render(col);
                      const isEmpty =
                        content === "—" ||
                        content === null ||
                        content === undefined;
                      const isWinner = winnerIdx === colIdx;
                      const barWidth = bars[colIdx];
                      const metricVal = groupRow.metric ? groupRow.metric(col) : null;

                      let tdClass = `cmp-dt-td cmp-dt-value-cell`;
                      if (isEmpty) tdClass += " is-muted";
                      if (isWinner) tdClass += " cmp-ct-winner";

                      return (
                        <td
                          key={col.stock.tikr}
                          className={tdClass}
                        >
                          {content ?? "—"}
                          {groupRow.bar && barWidth != null && (
                            <div className="cmp-ct-bar" aria-hidden="true">
                              <div
                                className={`cmp-ct-bar-fill ${barFillClass(groupRow.bar, metricVal)}`}
                                style={{ width: `${Math.round(barWidth * 100)}%` }}
                              />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <p className="cmp-km-note" style={{ padding: "0 var(--space-4) var(--space-3)" }}>
        P/E · P/B show the analyst base-case band;{" "}
        <span className="cmp-ct-cur">cur</span> = current (live) multiple
        where no band exists. EV/EBITDA and Street data load lazily.
      </p>
    </section>
  );
}
