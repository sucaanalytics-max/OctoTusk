"use client";
// Sector Scan — the CIO opportunity view: rank a sector (or the whole universe) by
// risk-adjusted opportunity, see upside AND downside, and direction-typed action flags.
// Chart <-> Leaderboard, reusing computeScorecard (ranking/downside/upsides) and
// FootballField (scroll mode) — sectorScan.ts adds only coverage/flags/aggregate/sort.
// Manual add lets a CIO pull in any stock regardless of the current scope.

import { useId, useMemo, useRef, useState } from "react";
import { computeScorecard } from "@/lib/compare/riskAdjusted";
import { searchStocks, type SearchableStock } from "@/lib/searchStocks";
import { SECTOR_ORDER } from "@/lib/sectors";
import { fmtPct } from "@/lib/format";
import {
  hasScenarioBand,
  scanFlags,
  sortScanRows,
  sectorAggregate,
  buildScanRowExtras,
  type ScanSort,
  type ScanFlag,
} from "./sectorScan";
import { useScenarioTip } from "./ScenarioTip";
import SectorScanRows from "./SectorScanRows";
import FootballField from "./FootballField";
import type { CompareStock, CompareQuotesMap } from "@/lib/compare/types";

interface Props {
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
}

function toSearchable(s: CompareStock): SearchableStock {
  return { tikr: s.tikr, name: s.name, sector: s.sector, subsector: s.subsector, dayPct: null, cmp: s.cmp };
}

const SCAN_SECTORS = SECTOR_ORDER.filter((s) => s !== "Unclassified");

export default function SectorScanView({ stocks, quotes }: Props) {
  const scopeId = useId();
  const sortId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [scope, setScope] = useState<string>("Universe");
  const [view, setView] = useState<"board" | "chart">("board");
  const [sort, setSort] = useState<ScanSort>("opportunity");
  const [manualTikrs, setManualTikrs] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const scopeStocks = useMemo(
    () => (scope === "Universe" ? stocks : stocks.filter((s) => s.sector === scope)),
    [stocks, scope]
  );
  const coveredScope = useMemo(
    () => scopeStocks.filter((s) => hasScenarioBand(s, quotes)),
    [scopeStocks, quotes]
  );
  const manualStocks = useMemo(() => {
    const coveredSet = new Set(coveredScope.map((s) => s.tikr));
    return manualTikrs
      .map((t) => stocks.find((s) => s.tikr === t))
      .filter((s): s is CompareStock => s != null && !coveredSet.has(s.tikr));
  }, [manualTikrs, stocks, coveredScope]);

  const comboStocks = useMemo(() => [...coveredScope, ...manualStocks], [coveredScope, manualStocks]);

  const rows = useMemo(() => computeScorecard(comboStocks, quotes), [comboStocks, quotes]);

  const flagsByTikr = useMemo(() => {
    const now = new Date();
    const out: Record<string, ScanFlag[]> = {};
    for (const s of comboStocks) out[s.tikr] = scanFlags(s, quotes, now);
    return out;
  }, [comboStocks, quotes]);

  const extras = useMemo(() => buildScanRowExtras(comboStocks, rows), [comboStocks, rows]);
  const sortedRows = useMemo(
    () => sortScanRows(rows, flagsByTikr, extras, sort),
    [rows, flagsByTikr, extras, sort]
  );
  // Aggregate strip must reflect the SCOPE's covered rows only — manual adds are shown
  // separately via "· K added" and would otherwise inflate/skew the zone counts + median
  // relative to the "N of M covered" count next to it (which also excludes manual adds).
  const coveredTikrs = useMemo(() => new Set(coveredScope.map((s) => s.tikr)), [coveredScope]);
  const scopeRows = useMemo(
    () => rows.filter((r) => coveredTikrs.has(r.tikr)),
    [rows, coveredTikrs]
  );
  const aggregate = useMemo(() => sectorAggregate(scopeRows, extras), [scopeRows, extras]);

  const sortedStocks = useMemo(() => {
    const byTikr = new Map(comboStocks.map((s) => [s.tikr, s]));
    return sortedRows
      .map((r) => byTikr.get(r.tikr))
      .filter((s): s is CompareStock => s != null);
  }, [sortedRows, comboStocks]);

  const inView = useMemo(() => new Set(comboStocks.map((s) => s.tikr)), [comboStocks]);
  const trimmedQuery = query.trim();
  const searchResults = useMemo(() => {
    if (trimmedQuery.length < 2) return [];
    return searchStocks(trimmedQuery, stocks.map(toSearchable), 8).filter((r) => !inView.has(r.tikr));
  }, [trimmedQuery, stocks, inView]);

  const { handlers, tip } = useScenarioTip(comboStocks, quotes, wrapperRef);

  function handleAdd(tikr: string) {
    setManualTikrs((prev) => (prev.includes(tikr) ? prev : [...prev, tikr]));
    setQuery("");
  }
  function handleRemoveManual(tikr: string) {
    setManualTikrs((prev) => prev.filter((t) => t !== tikr));
  }

  const scopeLabel = scope === "Universe" ? "the whole universe" : scope;

  return (
    <section className="cmp-scan" aria-label="Sector Scan">
      <div className="cmp-scan-controls">
        <div className="cmp-scan-field">
          <label htmlFor={scopeId} className="cmp-scan-field-label">Scope</label>
          <select
            id={scopeId}
            className="cmp-scan-select"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="Universe">Whole universe</option>
            {SCAN_SECTORS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="cmp-scan-field">
          <span className="cmp-scan-field-label">View</span>
          <div className="cmp-scan-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>
              Leaderboard
            </button>
            <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>
              Chart
            </button>
          </div>
        </div>

        <div className="cmp-scan-field">
          <label htmlFor={sortId} className="cmp-scan-field-label">Rank by</label>
          <select
            id={sortId}
            className="cmp-scan-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as ScanSort)}
          >
            <option value="opportunity">Opportunity (risk-adjusted)</option>
            <option value="u2">2Y upside</option>
            <option value="action">Needs action first</option>
          </select>
        </div>

        <div className="cmp-scan-summary">
          <span>
            <b>{coveredScope.length}</b> of {scopeStocks.length} covered
            {manualStocks.length > 0 && (
              <>
                {" "}&middot; <b>{manualStocks.length}</b> added
              </>
            )}
          </span>
          <div className="cmp-scan-summary-agg">
            {aggregate.cheap} cheap &middot; {aggregate.fair} fair &middot; {aggregate.rich} rich
            {" "}&middot; median 2Y {fmtPct(aggregate.medianU2)}
          </div>
        </div>
      </div>

      <div className="cmp-scan-manual">
        <div className="cmp-search-wrap">
          <span className="cmp-search-icon" aria-hidden="true">&#x1F50D;</span>
          <input
            type="search"
            className="cmp-search-input"
            placeholder="Add a stock from any sector…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Add a stock to the scan"
            autoComplete="off"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="cmp-scan-add-results">
            {searchResults.map((r) => (
              <button key={r.tikr} type="button" className="cmp-scan-add-btn" onClick={() => handleAdd(r.tikr)}>
                + {r.tikr} &middot; {r.display}
              </button>
            ))}
          </div>
        )}
        {manualStocks.length > 0 && (
          <div className="cmp-chips" role="group" aria-label="Manually added stocks">
            {manualStocks.map((s) => (
              <span key={s.tikr} className="cmp-chip">
                <span>{s.tikr}</span>
                <button
                  type="button"
                  className="cmp-chip-remove"
                  onClick={() => handleRemoveManual(s.tikr)}
                  aria-label={`Remove ${s.tikr}`}
                >
                  &#x00D7;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div ref={wrapperRef} className="cmp-scan-body" {...handlers}>
        {sortedRows.length === 0 ? (
          <p className="cmp-scan-note">0 of {scopeStocks.length} covered in {scopeLabel}.</p>
        ) : view === "board" ? (
          <SectorScanRows
            rows={sortedRows}
            stocks={comboStocks}
            quotes={quotes}
            flagsByTikr={flagsByTikr}
            manualTikrs={manualTikrs}
          />
        ) : (
          <FootballField stocks={sortedStocks} quotes={quotes} scroll />
        )}
        {tip}
      </div>

      <p className="cmp-scan-foot">
        Hover or tap any range bar / chart row for the Bear &middot; Base &middot; Bull &middot; 1Y &middot; 2Y
        numbers. Ranked by a risk-adjusted <b>Opportunity</b> score (return p.a. + margin-of-safety + downside
        cushion + conviction) &mdash; the number itself isn&rsquo;t shown. Flags:{" "}
        <span className="cmp-lb-flag is-below-bear">BELOW BEAR</span> buy/re-underwrite &middot;{" "}
        <span className="cmp-lb-flag is-buy-watch">BUY WATCH</span> within 7% above bear &middot;{" "}
        <span className="cmp-lb-flag is-trim-watch">TRIM WATCH</span> within 7% below bull &middot;{" "}
        <span className="cmp-lb-flag is-above-bull">ABOVE BULL</span> trim &middot;{" "}
        <span className="cmp-lb-flag is-stale">STALE</span> model &gt;60d. Only covered names (a bear/base/bull
        band) plus any manual adds are shown.
      </p>
    </section>
  );
}
