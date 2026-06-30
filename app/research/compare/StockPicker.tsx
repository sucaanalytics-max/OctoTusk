"use client";
// Stock search + sector filter + browse-to-select grid.
// Always-visible scrollable grid (sector-filtered). Search (≥2 chars) narrows it further.
// Click toggles selection; selected cards stay clickable (to deselect). At MAX_SELECTED,
// unselected cards are disabled with a hint; selected cards remain enabled.

import { useState, useId } from "react";
import { searchStocks, type SearchableStock } from "@/lib/searchStocks";
import { getCompanyShort } from "@/lib/companyName";
import { fmtRupee } from "@/lib/format";
import { SECTOR_ORDER } from "@/lib/sectors";
import type { CompareStock } from "@/lib/compare/types";

const MAX_SELECTED = 4;

interface Props {
  stocks: CompareStock[];
  selected: string[];
  onToggle: (tikr: string) => void;
  onClear: () => void;
}

export default function StockPicker({ stocks, selected, onToggle, onClear }: Props) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("All");
  const inputId = useId();

  // Map CompareStock → SearchableStock (searchStocks interface).
  const searchable: SearchableStock[] = stocks.map((s) => ({
    tikr: s.tikr,
    name: s.name,
    sector: s.sector,
    subsector: s.subsector,
    dayPct: null,
    cmp: s.cmp,
  }));

  // Sector filter first.
  const sectorFiltered =
    sector === "All" ? searchable : searchable.filter((s) => s.sector === sector);

  // When ≥2 chars: run search on the sector-filtered list. Otherwise show all sector-filtered.
  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;

  // browseList is the full sector-filtered set sorted by name (for always-visible mode).
  const browseList = [...sectorFiltered].sort((a, b) => a.name.localeCompare(b.name));

  // displayList: search results when querying, else the browse list.
  const displayList: SearchableStock[] = hasQuery
    ? searchStocks(trimmed, sectorFiltered, sectorFiltered.length) // no cap — scroll handles it
    : browseList;

  const isAtMax = selected.length >= MAX_SELECTED;

  // Find stock objects for selected chips.
  const selectedStocks = selected
    .map((tikr) => stocks.find((s) => s.tikr === tikr))
    .filter((s): s is CompareStock => s !== undefined);

  const sectors = ["All", ...SECTOR_ORDER.filter((s) => s !== "Unclassified")];

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
            placeholder="Search ticker or company…"
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

      {/* Always-visible scrollable browse grid */}
      <div className="cmp-browse-scroll" role="region" aria-label="Browse stocks">
        {displayList.length === 0 ? (
          <p className="cmp-no-results">
            {hasQuery
              ? `No results for “${trimmed}”`
              : "No stocks in this sector."}
          </p>
        ) : (
          <ul className="cmp-result-grid" role="list">
            {displayList.map((r) => {
              const isSelected = selected.includes(r.tikr);
              // Unselected at max → disabled. Selected always clickable (to deselect).
              const isDisabled = !isSelected && isAtMax;
              const shortName = getCompanyShort({ official_name: r.name, tikr: r.tikr });
              const cmpDisplay = r.cmp != null && r.cmp > 0 ? fmtRupee(r.cmp) : "—";
              return (
                <li key={r.tikr} role="listitem">
                  <button
                    type="button"
                    className={`cmp-result-item${isSelected ? " is-selected" : ""}`}
                    onClick={() => !isDisabled && onToggle(r.tikr)}
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
    </section>
  );
}
