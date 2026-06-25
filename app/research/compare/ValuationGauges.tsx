// Groups PE / PB / EV-EBITDA gauges per stock. Each gauge has its OWN axis.
// Missing gauge → "—", never blanks the block.

import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { getCompanyShort } from "@/lib/companyName";
import ValuationGauge from "./ValuationGauge";
import type { CompareStock, CompareQuotesMap, CompareEnrichmentMap } from "@/lib/compare/types";

interface Props {
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
  enrichment: CompareEnrichmentMap;
}

export default function ValuationGauges({ stocks, quotes, enrichment }: Props) {
  if (stocks.length === 0) return null;

  return (
    <section className="cmp-gauges-section" aria-label="Valuation multiple gauges">
      <h3 className="cmp-section-heading">Valuation Multiples</h3>
      <div className="cmp-gauges-grid">
        {stocks.map((stock) => {
          const { cmp } = resolveCmp(stock, quotes[stock.tikr]);
          const q = quotes[stock.tikr] ?? null;
          const e = enrichment[stock.tikr] ?? null;
          const shortName = getCompanyShort({ official_name: stock.name, tikr: stock.tikr });

          // Current multiples: from live quotes first, enrichment fallback.
          const currentPe = q?.trailingPE ?? null;
          const currentPb = q?.priceToBook ?? null;
          const currentEv = e?.enterpriseToEbitda ?? null;

          void cmp; // available for tooltip use if needed

          return (
            <div key={stock.tikr} className="cmp-gauges-stock-block">
              <div className="cmp-gauges-stock-name">{shortName}</div>
              <div className="cmp-gauges-metrics">
                <ValuationGauge
                  label="P/E"
                  bear={stock.bearPe}
                  base={stock.basePe}
                  bull={stock.bullPe}
                  plus2sd={stock.basePe2sd}
                  current={currentPe}
                  currentLabel="trailing P/E"
                />
                <ValuationGauge
                  label="P/B"
                  bear={stock.bearPb}
                  base={stock.basePb}
                  bull={stock.bullPb}
                  plus2sd={stock.basePb2sd}
                  current={currentPb}
                  currentLabel="price/book"
                />
                <ValuationGauge
                  label="EV/EBITDA"
                  bear={stock.bearEv}
                  base={stock.baseEv}
                  bull={stock.bullEv}
                  plus2sd={stock.baseEv2sd}
                  current={currentEv}
                  currentLabel="EV/EBITDA (TTM)"
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
