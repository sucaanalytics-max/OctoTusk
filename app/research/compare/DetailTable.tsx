// Full metric comparison table — collapsed in a <details> element.
// 6 sections defined in detailRows.ts; sticky header + sticky first column.
// All values via lib/format.ts and detailRows extractors. null → "—".

import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { getCompanyShort } from "@/lib/companyName";
import { fmtRupee } from "@/lib/format";
import { DETAIL_SECTIONS } from "./detailRows";
import type {
  CompareStock, CompareQuotesMap, CompareEnrichmentMap, CompareQuote, CompareEnrichment,
} from "@/lib/compare/types";

interface Props {
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
  enrichment: CompareEnrichmentMap;
  enrichmentLoading: Record<string, boolean>;
}

const LOADING_PLACEHOLDER = "…";
const EMPTY = "—";

function cellValue(
  stock: CompareStock,
  q: CompareQuote | null,
  e: CompareEnrichment | null,
  cmp: number | null,
  isEnrichmentLoading: boolean,
  getValue: (s: CompareStock, q: CompareQuote | null, e: CompareEnrichment | null, cmp: number | null) => string,
  needsEnrichment: boolean,
): string {
  if (needsEnrichment && isEnrichmentLoading) return LOADING_PLACEHOLDER;
  const v = getValue(stock, q, e, cmp);
  return v ?? EMPTY;
}

// Heuristic: a row "needs enrichment" if it touches CompareEnrichment fields.
// We check by calling with null enrichment — if the result differs from calling
// with an empty enrichment object, it touches enrichment.
// Simpler: just track by section index (sections 3 = fundamentals, 5 = prof&growth use enrichment).
const ENRICHMENT_SECTIONS = new Set([3, 5]); // 0-indexed

export default function DetailTable({ stocks, quotes, enrichment, enrichmentLoading }: Props) {
  if (stocks.length === 0) return null;

  const totalRows = DETAIL_SECTIONS.reduce((s, sec) => s + sec.rows.length, 0);

  // Resolve CMP per stock
  const resolved = stocks.map((s) => {
    const { cmp, isLive } = resolveCmp(s, quotes[s.tikr]);
    return { stock: s, cmp, isLive };
  });

  return (
    <section className="cmp-dt-section" aria-label="Full metric detail table">
      <details className="cmp-dt-details">
        <summary className="cmp-dt-summary">
          ▸ Financials &amp; full metric detail ({totalRows} rows)
        </summary>

        <div className="cmp-dt-scroll">
          <table className="cmp-dt-table">
            <thead>
              <tr>
                <th className="cmp-dt-th cmp-dt-metric-col" scope="col">Metric</th>
                {resolved.map(({ stock, cmp, isLive }) => {
                  const shortName = getCompanyShort({ official_name: stock.name, tikr: stock.tikr });
                  return (
                    <th key={stock.tikr} className="cmp-dt-th cmp-dt-stock-col" scope="col">
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
            {/* One <tbody> per section: carries the React key (no Fragment) and lets
                zebra striping use nth-of-type within each section consistently. */}
            {DETAIL_SECTIONS.map((section, secIdx) => {
              const needsEnrichment = ENRICHMENT_SECTIONS.has(secIdx);
              return (
                <tbody key={`sec-${secIdx}`} className="cmp-dt-tbody">
                  <tr className="cmp-dt-section-row">
                    <td className="cmp-dt-section-label" colSpan={stocks.length + 1}>
                      {section.title}
                    </td>
                  </tr>
                  {section.rows.map((row, rowIdx) => (
                    <tr key={`${secIdx}-${rowIdx}`} className="cmp-dt-row">
                      <td className="cmp-dt-td cmp-dt-label-cell">{row.label}</td>
                      {resolved.map(({ stock, cmp }) => {
                        const q = quotes[stock.tikr] ?? null;
                        const e = enrichment[stock.tikr] ?? null;
                        const loading = !!enrichmentLoading[stock.tikr];
                        const val = cellValue(
                          stock, q, e, cmp, loading, row.getValue, needsEnrichment
                        );
                        const isMuted = val === EMPTY || val === LOADING_PLACEHOLDER;
                        return (
                          <td
                            key={stock.tikr}
                            className={`cmp-dt-td cmp-dt-value-cell${isMuted ? " is-muted" : ""}`}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      </details>
    </section>
  );
}
