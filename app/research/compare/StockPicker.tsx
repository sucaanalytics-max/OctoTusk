"use client";
// Stock search + sector filter + selected chips.
// Reuses searchStocks(); requires ≥2 chars before showing results.

import { useState, useId } from "react";
import { searchStocks, type SearchableStock } from "@/lib/searchStocks";
import { getCompanyShort } from "@/lib/companyName";
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

  const sectorFiltered =
    sector === "All" ? searchable : searchable.filter((s) => s.sector === sector);

  // Show results when ≥2 chars typed; otherwise show nothing (or selected chips only).
  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const results = hasQuery
    ? searchStocks(trimmed, sectorFiltered, 24)
    : [];

  // Exclude already-selected stocks from results.
  const unselectedResults = results.filter((r) => !selected.includes(r.tikr));
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

      {/* Search results grid */}
      {hasQuery && (
        <div role="region" aria-label="Search results">
          {unselectedResults.length === 0 ? (
            <p className="cmp-no-results">No results for &ldquo;{trimmed}&rdquo;</p>
          ) : (
            <ul className="cmp-result-grid" role="list">
              {unselectedResults.map((r) => {
                const disabled = isAtMax;
                const shortName = getCompanyShort({ official_name: r.name, tikr: r.tikr });
                return (
                  <li key={r.tikr} role="listitem">
                    <button
                      type="button"
                      className="cmp-result-item"
                      onClick={() => !disabled && onToggle(r.tikr)}
                      disabled={disabled}
                      aria-label={`Add ${r.tikr} — ${shortName}${disabled ? " (maximum 4 reached)" : ""}`}
                    >
                      <span className="cmp-result-tikr">{r.tikr}</span>
                      <span className="cmp-result-name">{shortName}</span>
                      <span className="cmp-result-sector">{r.sector}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
