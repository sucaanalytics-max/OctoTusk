"use client";
import Link from "next/link";
import type { MobileStock } from "@/lib/mobile/types";
import { useQuotes } from "@/lib/mobile/useQuotes";
import { fmtRupee, fmtPct, fmtNum } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";
import { getCompanyShort, cleanTikr } from "@/lib/companyName";
import { getSebiSegment, SEBI_LABELS } from "@/lib/sebi";
import DeltaPill from "../../components/DeltaPill";
import ScenarioBand from "../../components/ScenarioBand";
import RangeBar from "../../components/RangeBar";
import StockNotes from "./StockNotes";
import ChatThread from "../../chat/ChatThread";

function Metric({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="m-metric">
      <span className="m-metric-label">{label}</span>
      <span className="m-metric-val">{value == null ? "—" : `${fmtNum(value)}${suffix ?? ""}`}</span>
    </div>
  );
}

export default function StockDetailClient({ stock, userEmail }: { stock: MobileStock; userEmail: string }) {
  const { quotes } = useQuotes();
  const quote = quotes[stock.tikr];
  const cmp = quote?.price ?? stock.cmp ?? null;
  const seg = getSebiSegment(quote?.marketCap ?? null);
  const name = getCompanyShort({ official_name: stock.name, tikr: stock.tikr });

  const upsides: Array<[string, number | null]> = [
    ["↑ Bear", scenarioUpside(stock.bear, cmp)],
    ["↑ Base", scenarioUpside(stock.base, cmp)],
    ["↑ Bull", scenarioUpside(stock.bull, cmp)],
    ["↑ 1Y target", scenarioUpside(stock.target1y, cmp)],
  ];

  return (
    <div className="m-page m-detail">
      <header className="m-detailhead">
        <Link href="/m/watchlist" className="m-back" aria-label="Back to watchlist">
          ‹
        </Link>
        <div>
          <h1 className="m-title">{name}</h1>
          <p className="m-card-meta">
            {cleanTikr(stock.tikr)} · {stock.sector}
            {stock.subsector ? ` · ${stock.subsector}` : ""}
            {seg ? ` · ${SEBI_LABELS[seg]}` : ""}
          </p>
        </div>
      </header>

      <section className="m-hero">
        <span className="m-hero-cmp">{fmtRupee(cmp)}</span>
        <DeltaPill pct={quote?.changePct ?? null} />
      </section>

      <section className="m-section">
        <ScenarioBand cmp={cmp} bear={stock.bear} base={stock.base} bull={stock.bull} />
        <div className="m-metricgrid">
          {upsides.map(([label, v]) => (
            <div className="m-metric" key={label}>
              <span className="m-metric-label">{label}</span>
              <span className={`m-metric-val ${v != null && v >= 0 ? "is-up" : v != null ? "is-down" : ""}`}>
                {fmtPct(v)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {quote?.fiftyTwoWeekLow != null && quote?.fiftyTwoWeekHigh != null && (
        <section className="m-section">
          <h2 className="m-section-title">52-week range</h2>
          <RangeBar low={quote.fiftyTwoWeekLow} high={quote.fiftyTwoWeekHigh} cmp={cmp} />
        </section>
      )}

      <section className="m-section">
        <h2 className="m-section-title">Key metrics</h2>
        <div className="m-metricgrid">
          <Metric label="Base PE" value={stock.basePe} />
          <Metric label="Base PB" value={stock.basePb} />
          <Metric label="Base EV/EBITDA" value={stock.baseEvEbitda} />
          <Metric label="Div yield" value={stock.divYield} suffix="%" />
          <Metric label="Conviction" value={stock.conviction} />
          <Metric label="Understanding" value={stock.understanding} />
          {quote?.trailingPE != null && <Metric label="TTM PE" value={quote.trailingPE} />}
        </div>
        <p className="m-analysts">
          VP {stock.vp ?? "—"} · SA {stock.sa ?? "—"}
        </p>
      </section>

      <Link href={`/m/financials/${encodeURIComponent(stock.tikr)}`} className="m-row-link">
        View full financials (Trendlyne) →
      </Link>

      <StockNotes tikr={stock.tikr} stockName={name} userEmail={userEmail} />

      <section className="m-section">
        <h2 className="m-section-title">Discussion</h2>
        <ChatThread scope="stock" tikr={stock.tikr} stockName={name} userEmail={userEmail} />
      </section>
    </div>
  );
}
