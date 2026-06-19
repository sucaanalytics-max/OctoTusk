import Link from "next/link";
import type { MobileStock, Quote } from "@/lib/mobile/types";
import { fmtRupee, fmtPct } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";
import { getCompanyShort, cleanTikr } from "@/lib/companyName";
import DeltaPill from "./DeltaPill";
import ScenarioBand from "./ScenarioBand";

export default function StockCard({ stock, quote }: { stock: MobileStock; quote?: Quote }) {
  const cmp = quote?.price ?? stock.cmp ?? null;
  const baseUpside = scenarioUpside(stock.base, cmp);
  const name = getCompanyShort({ official_name: stock.name, tikr: stock.tikr });

  return (
    <Link href={`/m/stock/${encodeURIComponent(stock.tikr)}`} className="m-card" aria-label={`${name} details`}>
      <div className="m-card-row1">
        <div className="m-card-id">
          <span className="m-card-name">{name}</span>
          <span className="m-card-meta">
            {cleanTikr(stock.tikr)} · {stock.sector}
          </span>
        </div>
        <DeltaPill pct={quote?.changePct ?? null} />
      </div>
      <div className="m-card-row2">
        <span className="m-card-cmp">{fmtRupee(cmp)}</span>
        {baseUpside != null && (
          <span className={`m-card-upside ${baseUpside >= 0 ? "is-up" : "is-down"}`}>Base {fmtPct(baseUpside)}</span>
        )}
      </div>
      <ScenarioBand cmp={cmp} bear={stock.bear} base={stock.base} bull={stock.bull} />
    </Link>
  );
}
