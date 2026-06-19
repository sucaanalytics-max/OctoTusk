"use client";
import { useMemo, useState } from "react";
import type { MobileStock } from "@/lib/mobile/types";
import { useQuotes } from "@/lib/mobile/useQuotes";
import { scenarioUpside } from "@/lib/scenarioUpside";
import StockCard from "../components/StockCard";

const FRESH_LABEL: Record<string, string> = {
  LIVE: "● Live",
  STALE: "● Delayed",
  DISCONNECTED: "● Offline",
  CLOSED: "○ Mkt closed",
  LOADING: "○ Loading…",
};

type SortKey = "upside" | "change" | "name";

export default function WatchlistClient({ stocks }: { stocks: MobileStock[] }) {
  const { quotes, state, fetchedAt } = useQuotes();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("upside");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = stocks;
    if (term) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(term) ||
          s.tikr.toLowerCase().includes(term) ||
          s.sector.toLowerCase().includes(term),
      );
    }
    const cmpOf = (s: MobileStock) => quotes[s.tikr]?.price ?? s.cmp;
    const arr = [...list];
    if (sort === "name") {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "change") {
      arr.sort((a, b) => (quotes[b.tikr]?.changePct ?? -Infinity) - (quotes[a.tikr]?.changePct ?? -Infinity));
    } else {
      arr.sort(
        (a, b) =>
          (scenarioUpside(b.base, cmpOf(b)) ?? -Infinity) - (scenarioUpside(a.base, cmpOf(a)) ?? -Infinity),
      );
    }
    return arr;
  }, [stocks, q, sort, quotes]);

  const updated = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="m-page">
      <header className="m-pagehead">
        <h1 className="m-title">Watchlist</h1>
        <span className={`m-fresh is-${state.toLowerCase()}`}>{FRESH_LABEL[state]}</span>
      </header>

      <input
        className="m-search"
        type="search"
        inputMode="search"
        placeholder="Search company, ticker, sector"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search stocks"
      />

      <div className="m-chips" role="tablist" aria-label="Sort">
        {(["upside", "change", "name"] as SortKey[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={sort === k}
            className={`m-chip${sort === k ? " is-active" : ""}`}
            onClick={() => setSort(k)}
          >
            {k === "upside" ? "Base upside" : k === "change" ? "Day %" : "A–Z"}
          </button>
        ))}
      </div>

      <div className="m-cardlist">
        {filtered.length === 0 ? (
          <p className="m-empty">No stocks match “{q}”.</p>
        ) : (
          filtered.map((s) => <StockCard key={s.tikr} stock={s} quote={quotes[s.tikr]} />)
        )}
      </div>

      <p className="m-count">
        {filtered.length} stocks{updated ? ` · updated ${updated}` : ""}
      </p>
    </div>
  );
}
