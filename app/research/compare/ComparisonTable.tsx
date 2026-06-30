// Merged comparison table: stock = column, metric = row.
// Groups: Price · Our Research · Model · Quality · Multiples · Street.
// Sticky header + sticky first column via existing cmp-dt-* classes.
// Enrichment-dependent cells show per-cell "…" while loading (not a whole-column skeleton).
// Row defs in comparisonRows.tsx. Single math source: reads ScorecardRow, never re-computes.

import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { getCompanyShort } from "@/lib/companyName";
import { fmtRupee } from "@/lib/format";
import { COMPARISON_GROUPS, type Col } from "./comparisonRows";
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
    // Fallback ScorecardRow in case a stock has no matching row (shouldn't happen; defensive).
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
              {group.rows.map((groupRow) => (
                <tr key={groupRow.label} className="cmp-dt-row">
                  <td className="cmp-dt-td cmp-dt-label-cell">
                    {groupRow.label}
                  </td>
                  {cols.map((col) => {
                    const content = groupRow.render(col);
                    const isEmpty =
                      content === "—" ||
                      content === null ||
                      content === undefined;
                    return (
                      <td
                        key={col.stock.tikr}
                        className={`cmp-dt-td cmp-dt-value-cell${isEmpty ? " is-muted" : ""}`}
                      >
                        {content ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
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
