// Internal research vs Street consensus — side-by-side per stock.
// "Do we agree with the street?"

import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { scenarioUpside } from "@/lib/scenarioUpside";
import { fmtRupee, fmtPct, fmtNum } from "@/lib/format";
import { getCompanyShort } from "@/lib/companyName";
import type {
  CompareStock, CompareQuotesMap, CompareEnrichmentMap,
} from "@/lib/compare/types";

interface Props {
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
  enrichment: CompareEnrichmentMap;
  enrichmentLoading: Record<string, boolean>;
}

function upStr(price: number | null, cmp: number | null): string {
  const u = scenarioUpside(price, cmp);
  return u != null ? fmtPct(u) : "—";
}

function RecChip({ rec }: { rec: string | null }) {
  if (!rec) return <span className="cmp-ivs-dash">—</span>;
  const upper = rec.toUpperCase();
  let cls = "cmp-rec-chip";
  if (upper === "BUY" || upper === "STRONG_BUY") cls += " is-buy";
  else if (upper === "SELL" || upper === "STRONG_SELL") cls += " is-sell";
  else cls += " is-hold";
  return <span className={cls}>{upper.replace("_", " ")}</span>;
}

function StockBlock({
  stock, cmp, cmpIsLive, quotes, enrichment, loading,
}: {
  stock: CompareStock;
  cmp: number | null;
  cmpIsLive: boolean;
  quotes: CompareQuotesMap;
  enrichment: CompareEnrichmentMap;
  loading: boolean;
}) {
  const q = quotes[stock.tikr] ?? null;
  const e = enrichment[stock.tikr] ?? null;
  const shortName = getCompanyShort({ official_name: stock.name, tikr: stock.tikr });

  return (
    <div className="cmp-ivs-stock">
      <div className="cmp-ivs-stock-header">
        <span className="cmp-ivs-stock-name">{shortName}</span>
        <span className="cmp-ivs-cmp">
          {cmp != null ? fmtRupee(cmp) : "—"}
          <span className={cmpIsLive ? "cmp-ivs-live" : "cmp-ivs-snapshot"}>
            {cmpIsLive ? " live" : " snapshot"}
          </span>
        </span>
      </div>

      <div className="cmp-ivs-cols">
        {/* ── Our Research ─────────────────────────────────────── */}
        <div className="cmp-ivs-col">
          <div className="cmp-ivs-col-label">Our Research</div>
          <dl className="cmp-ivs-dl">
            <div className="cmp-ivs-row">
              <dt>Bear</dt>
              <dd>
                {stock.bear != null ? fmtRupee(stock.bear) : "—"}
                <span className="cmp-ivs-upside">{upStr(stock.bear, cmp)}</span>
              </dd>
            </div>
            <div className="cmp-ivs-row">
              <dt>Base</dt>
              <dd>
                {stock.base != null ? fmtRupee(stock.base) : "—"}
                <span className="cmp-ivs-upside">{upStr(stock.base, cmp)}</span>
              </dd>
            </div>
            <div className="cmp-ivs-row">
              <dt>Bull</dt>
              <dd>
                {stock.bull != null ? fmtRupee(stock.bull) : "—"}
                <span className="cmp-ivs-upside">{upStr(stock.bull, cmp)}</span>
              </dd>
            </div>
            <div className="cmp-ivs-row">
              <dt>Conviction</dt>
              <dd>{stock.conviction != null ? fmtNum(stock.conviction, 0) : "—"}</dd>
            </div>
            <div className="cmp-ivs-row">
              <dt>VP</dt>
              <dd>{stock.vp ?? "—"}</dd>
            </div>
            <div className="cmp-ivs-row">
              <dt>SA</dt>
              <dd>{stock.sa ?? "—"}</dd>
            </div>
            <div className="cmp-ivs-row">
              <dt>Score</dt>
              <dd>{stock.score != null ? fmtNum(stock.score, 0) : "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="cmp-ivs-divider" aria-hidden="true" />

        {/* ── Street Consensus ──────────────────────────────────── */}
        <div className="cmp-ivs-col">
          <div className="cmp-ivs-col-label">Street Consensus</div>
          {loading ? (
            <div className="cmp-ivs-loading" aria-label="Loading street data">
              <span className="cmp-ivs-skeleton" />
              <span className="cmp-ivs-skeleton" />
              <span className="cmp-ivs-skeleton" />
            </div>
          ) : (
            <dl className="cmp-ivs-dl">
              <div className="cmp-ivs-row">
                <dt>Target (mean)</dt>
                <dd>
                  {e?.targetMeanPrice != null ? fmtRupee(e.targetMeanPrice) : "—"}
                  <span className="cmp-ivs-upside">{upStr(e?.targetMeanPrice ?? null, cmp)}</span>
                </dd>
              </div>
              <div className="cmp-ivs-row">
                <dt>Recommendation</dt>
                <dd><RecChip rec={e?.recommendationKey ?? null} /></dd>
              </div>
              <div className="cmp-ivs-row">
                <dt>Analysts</dt>
                <dd>
                  {e?.numberOfAnalystOpinions != null
                    ? `${e.numberOfAnalystOpinions} analysts`
                    : "—"}
                </dd>
              </div>
              <div className="cmp-ivs-row">
                <dt>Trailing P/E</dt>
                <dd>{q?.trailingPE != null ? fmtNum(q.trailingPE, 1) : "—"}</dd>
              </div>
              <div className="cmp-ivs-row">
                <dt>Forward P/E</dt>
                <dd>{q?.forwardPE != null ? fmtNum(q.forwardPE, 1) : "—"}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InternalVsStreet({ stocks, quotes, enrichment, enrichmentLoading }: Props) {
  if (stocks.length === 0) return null;

  return (
    <section className="cmp-ivs-section" aria-label="Internal vs Street comparison">
      <h3 className="cmp-section-heading">Our Research vs Street</h3>
      <div className="cmp-ivs-list">
        {stocks.map((stock) => {
          const { cmp, isLive } = resolveCmp(stock, quotes[stock.tikr]);
          return (
            <StockBlock
              key={stock.tikr}
              stock={stock}
              cmp={cmp}
              cmpIsLive={isLive}
              quotes={quotes}
              enrichment={enrichment}
              loading={!!enrichmentLoading[stock.tikr]}
            />
          );
        })}
      </div>
    </section>
  );
}
