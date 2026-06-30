"use client";
// Stock search + sector filter + peer-recommendation grid.
// After the first pick, suggests PEERS of the first selected stock (same subsector, then
// sector), capped to ~2 rows with "View more". Search (>=2 chars) or an explicit sector
// dropdown override the suggestions. Before any pick: a short prompt (never the full universe).
// Click toggles selection; at MAX_SELECTED unselected cards disable; selected stay clickable.

import { useState, useId } from "react";
import { searchStocks, type SearchableStock } from "@/lib/searchStocks";
import { getCompanyShort } from "@/lib/companyName";
import { fmtRupee } from "@/lib/format";
import { SECTOR_ORDER } from "@/lib/sectors";
import { peerStocks } from "@/lib/compare/peerStocks";
import type { CompareStock } from "@/lib/compare/types";

const MAX_SELECTED = 4;
const PREVIEW_COUNT = 12; // ~2 rows on a 6-column desktop grid

interface Props {
  stocks: CompareStock[];
  selected: string[];
  onToggle: (tikr: string) => void;
  onClear: () => void;
}

function toSearchable(s: CompareStock): SearchableStock {
  return { tikr: s.tikr, name: s.name, sector: s.sector, subsector: s.subsector, dayPct: null, cmp: s.cmp };
}

export default function StockPicker({ stocks, selected, onToggle, onClear }: Props) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("All");
  const [expanded, setExpanded] = useState(false);
  const inputId = useId();

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const anchorTikr = selected[0] ?? null;
  const anchorStock = anchorTikr ? stocks.find((s) => s.tikr === anchorTikr) : undefined;

  const searchable: SearchableStock[] = stocks.map(toSearchable);

  // Decide what to show. Priority: search -> explicit sector -> peers-of-first -> prompt.
  let mode: "search" | "sector" | "peers" | "empty" = "empty";
  let candidates: SearchableStock[] = [];
  let peersResolvedSector = "";
  if (hasQuery) {
    mode = "search";
    candidates = searchStocks(trimmed, searchable, searchable.length);
  } else if (sector !== "All") {
    mode = "sector";
    candidates = searchable
      .filter((s) => s.sector === sector)
      .sort((a, b) => a.name.localeCompare(b.name));
  } else if (anchorTikr) {
    mode = "peers";
    const peerResult = peerStocks(anchorTikr, stocks, selected);
    candidates = peerResult.peers.map(toSearchable);
    // Capture sector name for the sparse-peers helper message.
    peersResolvedSector = peerResult.sector;
  }

  // Reset the 2-row cap whenever the basis (query / sector / anchor) changes.
  // Set-state-during-render (React's recommended pattern) -- no effect, no flash.
  const modeKey = `${hasQuery ? trimmed : ""}|${sector}|${anchorTikr ?? ""}`;
  const [prevModeKey, setPrevModeKey] = useState(modeKey);
  if (modeKey !== prevModeKey) {
    setPrevModeKey(modeKey);
    setExpanded(false);
  }

  const isAtMax = selected.length >= MAX_SELECTED;
  const truncated = candidates.length > PREVIEW_COUNT;
  const displayList = expanded ? candidates : candidates.slice(0, PREVIEW_COUNT);

  const selectedStocks = selected
    .map((tikr) => stocks.find((s) => s.tikr === tikr))
    .filter((s): s is CompareStock => s !== undefined);

  const sectors = ["All", ...SECTOR_ORDER.filter((s) => s !== "Unclassified")];

  let heading = "";
  if (mode === "search") heading = `Results for "${trimmed}"`;
  else if (mode === "sector") heading = sector;
  else if (mode === "peers") heading = "Suggested peers";

  return (
    <section className="cmp-picker" aria-label="Stock picker">
      {/* Controls row */}
      <div className="cmp-picker-controls">
        <div className="cmp-search-wrap">
          <span className="cmp-search-icon" aria-hidden="true">&#x1F50D;</span>
          <input
            id={inputId}
            type="search"
            className="cmp-search-input"
            placeholder="Search ticker or company..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            aria-label="Search stocks"
            aria-describedby="cmp-search-hint"
          />
        </div>

        <select
          className="cmp-sector-select"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          aria-label="Filter by sector"
        >
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {selected.length > 0 && (
          <button
            type="button"
            className="cmp-clear-btn"
            onClick={onClear}
            aria-label="Clear all selected stocks"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Selected chips */}
      {selectedStocks.length > 0 && (
        <div className="cmp-chips" role="group" aria-label="Selected stocks">
          {selectedStocks.map((s) => (
            <span key={s.tikr} className="cmp-chip">
              <span>{s.tikr}</span>
              <button
                type="button"
                className="cmp-chip-remove"
                onClick={() => onToggle(s.tikr)}
                aria-label={`Remove ${s.tikr} from comparison`}
              >
                &#x00D7;
              </button>
            </span>
          ))}
          <span id="cmp-search-hint" className="cmp-chips-hint">
            {isAtMax ? "Max 4 selected" : `${MAX_SELECTED - selected.length} more`}
          </span>
        </div>
      )}

      {/* Heading: what the grid is showing */}
      {mode !== "empty" && candidates.length > 0 && (
        <div className="cmp-browse-head">
          <span className="cmp-browse-head-label">
            {heading}
            {mode === "peers" && peersResolvedSector && (
              <span className="cmp-browse-sector-tag">{peersResolvedSector}</span>
            )}
          </span>
          <span className="cmp-browse-head-count">{candidates.length}</span>
        </div>
      )}

      {/* Sparse peers helper: shown when <=1 peer in resolved sector */}
      {mode === "peers" && candidates.length <= 1 && candidates.length > 0 && (
        <p className="cmp-peers-sparse-hint">
          Few direct peers in {peersResolvedSector || "this sector"} &mdash; search or pick a sector to add any stock.
        </p>
      )}

      {/* Grid / prompt */}
      <div className="cmp-browse-scroll" role="region" aria-label="Stocks to add">
        {mode === "empty" ? (
          <p className="cmp-picker-prompt">
            Pick a stock to see suggested peers for comparison &mdash; or search by ticker or company.
          </p>
        ) : candidates.length === 0 ? (
          <p className="cmp-no-results">
            {mode === "search"
              ? `No results for "${trimmed}"`
              : mode === "peers"
              ? `Few direct peers in ${peersResolvedSector || "this sector"} — search or pick a sector to add any stock.`
              : "No stocks in this sector."}
          </p>
        ) : (
          <ul className="cmp-result-grid" role="list">
            {displayList.map((r) => {
              const isSelected = selected.includes(r.tikr);
              const isDisabled = !isSelected && isAtMax;
              const shortName = getCompanyShort({ official_name: r.name, tikr: r.tikr });
              const cmpDisplay = r.cmp != null && r.cmp > 0 ? fmtRupee(r.cmp) : "—";
              return (
                <li key={r.tikr} role="listitem">
                  <button
                    type="button"
                    className={`cmp-result-item${isSelected ? " is-selected" : ""}`}
                    onClick={() => {
                      if (isDisabled) return;
                      onToggle(r.tikr);
                      // Adding a stock from search → clear the box so its peers surface immediately.
                      if (!isSelected && query) setQuery("");
                    }}
                    disabled={isDisabled}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? "Remove" : "Add"} ${r.tikr} — ${shortName}${isDisabled ? " (maximum 4 reached)" : ""}`}
                  >
                    <span className="cmp-result-tikr">{r.tikr}</span>
                    <span className="cmp-result-name">{shortName}</span>
                    <span className="cmp-result-sector">{r.sector}</span>
                    <span className="cmp-result-cmp">{cmpDisplay}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* View more / fewer */}
      {truncated && (
        <button
          type="button"
          className="cmp-view-more"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Show fewer" : `View ${candidates.length - PREVIEW_COUNT} more`}
        </button>
      )}
    </section>
  );
}
