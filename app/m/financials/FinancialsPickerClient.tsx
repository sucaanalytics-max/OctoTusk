"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { MobileStock } from "@/lib/mobile/types";
import { searchStocks, type SearchableStock } from "@/lib/searchStocks";
import { displayName } from "@/lib/displayName";

const toSearchable = (s: MobileStock): SearchableStock => ({
  tikr: s.tikr,
  name: s.name,
  sector: s.sector,
  subsector: s.subsector,
  dayPct: null,
  cmp: s.cmp,
});

export default function FinancialsPickerClient({ stocks }: { stocks: MobileStock[] }) {
  const [q, setQ] = useState("");

  // Empty query → full universe A–Z; otherwise the fuzzy ranker.
  const rows = useMemo(() => {
    const term = q.trim();
    if (!term) {
      return [...stocks]
        .map((s) => ({ tikr: s.tikr, display: displayName(s.tikr, s.name), sector: s.sector }))
        .sort((a, b) => a.display.localeCompare(b.display));
    }
    return searchStocks(term, stocks.map(toSearchable), 20).map((r) => ({
      tikr: r.tikr,
      display: r.display,
      sector: r.sector,
    }));
  }, [q, stocks]);

  return (
    <div className="m-page">
      <header className="m-pagehead">
        <h1 className="m-title">Financials</h1>
      </header>

      <input
        className="m-search"
        type="search"
        inputMode="search"
        placeholder="Search a stock for Trendlyne financials"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search stocks"
      />

      <div className="m-cardlist">
        {rows.length === 0 ? (
          <p className="m-empty">No stocks match “{q}”.</p>
        ) : (
          rows.map((r) => (
            <Link
              key={r.tikr}
              href={`/m/financials/${encodeURIComponent(r.tikr)}`}
              className="m-row-link m-fin-pick"
            >
              <span className="m-fin-pick-name">{r.display}</span>
              <span className="m-card-meta">{r.sector}</span>
            </Link>
          ))
        )}
      </div>

      <p className="m-count">{rows.length} of {stocks.length} stocks</p>
    </div>
  );
}
