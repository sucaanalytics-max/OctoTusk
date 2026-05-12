"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchStocks, type SearchableStock, type SearchResult } from "@/lib/searchStocks";

const MAX_RESULTS = 12;

interface Props {
  open: boolean;
  stocks: SearchableStock[];
  onClose: () => void;
  onSelect: (tikr: string) => void;
}

function fmtCmp(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(p: number | null): string {
  if (p == null || !isFinite(p)) return "—";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

function pctClass(p: number | null): string {
  if (p == null) return "ox-flat";
  if (p > 0) return "ox-pos";
  if (p < 0) return "ox-neg";
  return "ox-flat";
}

export function CommandPalette({ open, stocks, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results: SearchResult[] = useMemo(
    () => searchStocks(query, stocks, MAX_RESULTS),
    [query, stocks]
  );

  // Reset when palette toggles or query is cleared
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // Defer focus until modal is in the DOM
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp active index when results shrink
  useEffect(() => {
    setActiveIdx((idx) => Math.max(0, Math.min(idx, Math.max(results.length - 1, 0))));
  }, [results.length]);

  // Keep highlighted row in view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const list = listRef.current;
    const el = list.children[activeIdx] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  // Local key handlers when palette is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const choice = results[activeIdx];
        if (choice) onSelect(choice.tikr);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, activeIdx, onClose, onSelect]);

  if (!open) return null;

  return (
    <div
      className="ox-palette-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search stocks"
    >
      <div
        className="ox-palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ox-palette-head">
          <span className="ox-palette-title">Search</span>
          <span className="ox-palette-kbd-hint">⌘K</span>
        </div>
        <input
          ref={inputRef}
          className="ox-palette-input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
          }}
          placeholder="Find a stock by name or ticker…"
          autoComplete="off"
          spellCheck={false}
        />
        <div ref={listRef} className="ox-palette-results" role="listbox">
          {query.trim() === "" ? (
            <div className="ox-palette-empty">
              Start typing to search your coverage universe.
            </div>
          ) : results.length === 0 ? (
            <div className="ox-palette-empty">No matches for &ldquo;{query}&rdquo;.</div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.tikr}
                type="button"
                className="ox-palette-row"
                data-active={i === activeIdx || undefined}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => onSelect(r.tikr)}
              >
                <div className="ox-palette-row-main">
                  <span className="ox-palette-row-name">{r.display}</span>
                  <span className="ox-palette-row-numbers">
                    <span className="ox-palette-row-cmp">
                      <span className="ox-rupee">₹</span>
                      {fmtCmp(r.cmp)}
                    </span>
                    <span className={`ox-palette-row-pct ${pctClass(r.dayPct)}`}>
                      {fmtPct(r.dayPct)}
                    </span>
                  </span>
                </div>
                <div className="ox-palette-row-meta">
                  <span className="ox-palette-row-tikr">{r.tikr}</span>
                  {r.subsector ? (
                    <span className="ox-palette-row-sub">{r.subsector}</span>
                  ) : (
                    <span className="ox-palette-row-sub">{r.sector}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="ox-palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> select
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
