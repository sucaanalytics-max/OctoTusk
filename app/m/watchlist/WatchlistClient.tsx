"use client";
import { useMemo, useState } from "react";
import type { MobileStock } from "@/lib/mobile/types";
import { useQuotes } from "@/lib/mobile/useQuotes";
import { scenarioUpside } from "@/lib/scenarioUpside";
import { isMobileHidden } from "@/lib/mobile/hiddenStocks";
import StockCard from "../components/StockCard";
import FilterSheet, { type Conviction, type Understanding, type SortKey } from "../components/FilterSheet";

const FRESH_LABEL: Record<string, string> = {
  LIVE: "● Live",
  STALE: "● Delayed",
  DISCONNECTED: "● Offline",
  CLOSED: "○ Mkt closed",
  LOADING: "○ Loading…",
};
const CONV_LABEL: Record<Conviction, string> = { all: "All", "4plus": "4+", "5": "5 only" };
const UND_LABEL: Record<Understanding, string> = { all: "All", "4plus": "4+", "5": "5 only" };
const SORT_LABEL: Record<SortKey, string> = {
  bear: "Bear ↑",
  base: "Base ↑",
  bull: "Bull ↑",
  y1: "1Y ↑",
  y2: "2Y ↑",
  change: "Day %",
  name: "A–Z",
};

function uniqSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v !== "0"))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export default function WatchlistClient({ stocks }: { stocks: MobileStock[] }) {
  const { quotes, state, fetchedAt } = useQuotes();
  const [q, setQ] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filter state — defaults per spec: Conviction 4+, the de-prioritized names hidden.
  const [conviction, setConviction] = useState<Conviction>("4plus");
  const [understanding, setUnderstanding] = useState<Understanding>("4plus");
  const [sort, setSort] = useState<SortKey>("base");
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(new Set());
  const [selectedVps, setSelectedVps] = useState<Set<string>>(new Set());
  const [selectedSas, setSelectedSas] = useState<Set<string>>(new Set());
  const [inFnoOnly, setInFnoOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const allSectors = useMemo(() => uniqSorted(stocks.map((s) => s.sector)), [stocks]);
  const allVps = useMemo(() => uniqSorted(stocks.map((s) => s.vp)), [stocks]);
  const allSas = useMemo(() => uniqSorted(stocks.map((s) => s.sa)), [stocks]);

  const toggleIn = (setter: typeof setSelectedSectors) => (val: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  const toggleSector = toggleIn(setSelectedSectors);
  const toggleVp = toggleIn(setSelectedVps);
  const toggleSa = toggleIn(setSelectedSas);

  const reset = () => {
    setConviction("4plus");
    setUnderstanding("4plus");
    setSort("base");
    setSelectedSectors(new Set());
    setSelectedVps(new Set());
    setSelectedSas(new Set());
    setInFnoOnly(false);
    setShowHidden(false);
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const cmpOf = (s: MobileStock) => quotes[s.tikr]?.price ?? s.cmp;
    const list = stocks.filter((s) => {
      if (!showHidden && isMobileHidden(s.tikr)) return false;
      if (conviction === "4plus" && !(s.conviction != null && s.conviction >= 4)) return false;
      if (conviction === "5" && s.conviction !== 5) return false;
      if (understanding === "4plus" && !(s.understanding != null && s.understanding >= 4)) return false;
      if (understanding === "5" && s.understanding !== 5) return false;
      if (inFnoOnly && !s.inFno) return false;
      if (selectedSectors.size > 0 && !selectedSectors.has(s.sector)) return false;
      if (selectedVps.size > 0 && !(s.vp && selectedVps.has(s.vp))) return false;
      if (selectedSas.size > 0 && !(s.sa && selectedSas.has(s.sa))) return false;
      if (
        term &&
        !(
          s.name.toLowerCase().includes(term) ||
          s.tikr.toLowerCase().includes(term) ||
          s.sector.toLowerCase().includes(term)
        )
      )
        return false;
      return true;
    });

    if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      const val = (s: MobileStock): number => {
        const cmp = cmpOf(s);
        switch (sort) {
          case "bear":
            return scenarioUpside(s.bear, cmp) ?? -Infinity;
          case "bull":
            return scenarioUpside(s.bull, cmp) ?? -Infinity;
          case "y1":
            return scenarioUpside(s.target1y, cmp) ?? -Infinity;
          case "y2":
            return scenarioUpside(s.target2y, cmp) ?? -Infinity;
          case "change":
            return quotes[s.tikr]?.changePct ?? -Infinity;
          default:
            return scenarioUpside(s.base, cmp) ?? -Infinity;
        }
      };
      list.sort((a, b) => val(b) - val(a));
    }
    return list;
  }, [stocks, q, conviction, understanding, selectedSectors, selectedVps, selectedSas, inFnoOnly, showHidden, sort, quotes]);

  const activeCount =
    (conviction !== "4plus" ? 1 : 0) +
    (understanding !== "4plus" ? 1 : 0) +
    (sort !== "base" ? 1 : 0) +
    (selectedSectors.size > 0 ? 1 : 0) +
    (selectedVps.size > 0 ? 1 : 0) +
    (selectedSas.size > 0 ? 1 : 0) +
    (inFnoOnly ? 1 : 0) +
    (showHidden ? 1 : 0);

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

      {/* Filter bar: Filters button + active-filter chips (tap a chip to clear it) */}
      <div className="m-filterbar">
        <button className="m-filterbtn" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          <span aria-hidden>⚙</span> Filters
          {activeCount > 0 && <span className="m-filterbadge">{activeCount}</span>}
        </button>
        <div className="m-activechips">
          <button className="m-chip is-active" onClick={() => setSheetOpen(true)}>
            ↕ {SORT_LABEL[sort]}
          </button>
          <button className="m-chip is-active" onClick={() => setSheetOpen(true)}>
            Conv {CONV_LABEL[conviction]}
          </button>
          <button className="m-chip is-active" onClick={() => setSheetOpen(true)}>
            Und {UND_LABEL[understanding]}
          </button>
          {Array.from(selectedVps).map((v) => (
            <button key={`vp-${v}`} className="m-chip is-active" onClick={() => toggleVp(v)}>
              VP {v} ✕
            </button>
          ))}
          {Array.from(selectedSas).map((v) => (
            <button key={`sa-${v}`} className="m-chip is-active" onClick={() => toggleSa(v)}>
              SA {v} ✕
            </button>
          ))}
          {Array.from(selectedSectors).map((s) => (
            <button key={`sec-${s}`} className="m-chip is-active" onClick={() => toggleSector(s)}>
              {s} ✕
            </button>
          ))}
          {inFnoOnly && (
            <button className="m-chip is-active" onClick={() => setInFnoOnly(false)}>
              F&amp;O ✕
            </button>
          )}
          {showHidden && (
            <button className="m-chip is-active" onClick={() => setShowHidden(false)}>
              Hidden shown ✕
            </button>
          )}
        </div>
      </div>

      <div className="m-cardlist">
        {filtered.length === 0 ? (
          <p className="m-empty">No stocks match these filters.</p>
        ) : (
          filtered.map((s) => <StockCard key={s.tikr} stock={s} quote={quotes[s.tikr]} />)
        )}
      </div>

      <p className="m-count">
        {filtered.length} of {stocks.length} stocks{updated ? ` · updated ${updated}` : ""}
      </p>

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        conviction={conviction}
        setConviction={setConviction}
        understanding={understanding}
        setUnderstanding={setUnderstanding}
        sort={sort}
        setSort={setSort}
        allSectors={allSectors}
        selectedSectors={selectedSectors}
        toggleSector={toggleSector}
        allVps={allVps}
        selectedVps={selectedVps}
        toggleVp={toggleVp}
        allSas={allSas}
        selectedSas={selectedSas}
        toggleSa={toggleSa}
        inFnoOnly={inFnoOnly}
        setInFnoOnly={setInFnoOnly}
        showHidden={showHidden}
        setShowHidden={setShowHidden}
        resultCount={filtered.length}
        onReset={reset}
      />
    </div>
  );
}
