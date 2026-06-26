// Always-visible compact valuation table — surfaces the core research values
// (Bear/Base/Bull, 1Y/2Y upside, P/E·P/B·EV/EBITDA) that otherwise only live in the
// collapsed detail dropdown. All scenario data is on CompareStock (no fetch); multiples
// fall back to the LIVE quote/enrichment multiple when scenario bands are absent.

import type { ReactNode } from "react";
import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { scenarioUpside } from "@/lib/scenarioUpside";
import { getCompanyShort } from "@/lib/companyName";
import { fmtRupee, fmtPct, fmtNum } from "@/lib/format";
import type { CompareStock, CompareQuotesMap, CompareEnrichmentMap } from "@/lib/compare/types";

interface Props {
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
  enrichment: CompareEnrichmentMap;
}

const EMPTY = "—";

interface Col {
  s: CompareStock;
  cmp: number | null;
  isLive: boolean;
  q: CompareQuotesMap[string] | null;
  e: CompareEnrichmentMap[string] | null;
}

function priceCell(price: number | null, cmp: number | null): ReactNode {
  if (price == null) return <span className="cmp-km-dash">{EMPTY}</span>;
  const up = scenarioUpside(price, cmp);
  return (
    <>
      {fmtRupee(price)}
      {up != null && <span className={`cmp-km-up ${up >= 0 ? "is-pos" : "is-neg"}`}>{fmtPct(up)}</span>}
    </>
  );
}

// Base scenario multiple if present; else the live "current" multiple (flagged); else "—".
function multipleCell(band: number | null, live: number | null): ReactNode {
  if (band != null) return <>{`${fmtNum(band, 1)}×`}</>;
  if (live != null) return <>{`${fmtNum(live, 1)}×`}<span className="cmp-km-cur">cur</span></>;
  return <span className="cmp-km-dash">{EMPTY}</span>;
}

const ROWS: Array<{ label: string; render: (c: Col) => ReactNode }> = [
  {
    label: "CMP",
    render: (c) =>
      c.cmp != null ? (
        <>{fmtRupee(c.cmp)}{c.isLive && <span className="cmp-km-live">live</span>}</>
      ) : (
        <span className="cmp-km-dash">{EMPTY}</span>
      ),
  },
  { label: "Bear", render: (c) => priceCell(c.s.bear, c.cmp) },
  { label: "Base", render: (c) => priceCell(c.s.base, c.cmp) },
  { label: "Bull", render: (c) => priceCell(c.s.bull, c.cmp) },
  { label: "1Y Target", render: (c) => priceCell(c.s.target1y, c.cmp) },
  { label: "2Y Target", render: (c) => priceCell(c.s.target2y, c.cmp) },
  { label: "P/E", render: (c) => multipleCell(c.s.basePe, c.q?.trailingPE ?? null) },
  { label: "P/B", render: (c) => multipleCell(c.s.basePb, c.q?.priceToBook ?? null) },
  { label: "EV/EBITDA", render: (c) => multipleCell(c.s.baseEv, c.e?.enterpriseToEbitda ?? null) },
];

export default function KeyMetrics({ stocks, quotes, enrichment }: Props) {
  if (stocks.length === 0) return null;

  const cols: Col[] = stocks.map((s) => {
    const { cmp, isLive } = resolveCmp(s, quotes[s.tikr]);
    return { s, cmp, isLive, q: quotes[s.tikr] ?? null, e: enrichment[s.tikr] ?? null };
  });

  return (
    <section className="cmp-km-section" aria-label="Key valuation metrics">
      <h3 className="cmp-section-heading">Valuation</h3>
      <div className="cmp-km-scroll">
        <table className="cmp-dt-table">
          <thead>
            <tr>
              <th className="cmp-dt-th cmp-dt-metric-col" scope="col">Metric</th>
              {cols.map(({ s }) => (
                <th key={s.tikr} className="cmp-dt-th cmp-dt-stock-col" scope="col">
                  <div className="cmp-dt-th-name">{getCompanyShort({ official_name: s.name, tikr: s.tikr })}</div>
                  <div className="cmp-dt-th-tikr">{s.tikr}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="cmp-dt-row">
                <td className="cmp-dt-td cmp-dt-label-cell">{row.label}</td>
                {cols.map((c) => (
                  <td key={c.s.tikr} className="cmp-dt-td cmp-dt-value-cell">{row.render(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cmp-km-note">
        P/E · P/B · EV/EBITDA show the analyst base-case band; <span className="cmp-km-cur">cur</span> = current
        (live) multiple where no scenario band exists. Full financials in the detail table below.
      </p>
    </section>
  );
}
