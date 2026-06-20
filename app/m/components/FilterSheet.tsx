"use client";
import { useEffect } from "react";

export type Conviction = "all" | "4plus" | "5";
export type SortKey = "bear" | "base" | "bull" | "y1" | "y2" | "change" | "name";

interface Props {
  open: boolean;
  onClose: () => void;
  conviction: Conviction;
  setConviction: (c: Conviction) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  allSectors: string[];
  selectedSectors: Set<string>;
  toggleSector: (s: string) => void;
  allVps: string[];
  selectedVps: Set<string>;
  toggleVp: (v: string) => void;
  allSas: string[];
  selectedSas: Set<string>;
  toggleSa: (v: string) => void;
  inFnoOnly: boolean;
  setInFnoOnly: (v: boolean) => void;
  showHidden: boolean;
  setShowHidden: (v: boolean) => void;
  resultCount: number;
  onReset: () => void;
}

const CONVICTIONS: Array<[Conviction, string]> = [
  ["4plus", "4+"],
  ["5", "5 only"],
  ["all", "All"],
];
const SORTS: Array<[SortKey, string]> = [
  ["bear", "Bear ↑"],
  ["base", "Base ↑"],
  ["bull", "Bull ↑"],
  ["y1", "1Y ↑"],
  ["y2", "2Y ↑"],
  ["change", "Day %"],
  ["name", "A–Z"],
];

export default function FilterSheet(p: Props) {
  // Lock body scroll while open.
  useEffect(() => {
    if (!p.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [p.open]);

  if (!p.open) return null;

  return (
    <div className="m-sheet-root" role="dialog" aria-modal="true" aria-label="Filters">
      <button className="m-sheet-backdrop" aria-label="Close filters" onClick={p.onClose} />
      <div className="m-sheet">
        <div className="m-sheet-grab" aria-hidden />
        <div className="m-sheet-head">
          <span className="m-sheet-title">Filters &amp; sort</span>
          <button className="m-sheet-reset" onClick={p.onReset}>
            Reset
          </button>
        </div>

        <div className="m-sheet-body">
          <section className="m-fgroup">
            <span className="m-flabel">Sort by</span>
            <div className="m-chipwrap">
              {SORTS.map(([val, lab]) => (
                <button
                  key={val}
                  className={`m-chip${p.sort === val ? " is-active" : ""}`}
                  aria-pressed={p.sort === val}
                  onClick={() => p.setSort(val)}
                >
                  {lab}
                </button>
              ))}
            </div>
          </section>

          <section className="m-fgroup">
            <span className="m-flabel">Conviction</span>
            <div className="m-seg">
              {CONVICTIONS.map(([val, lab]) => (
                <button
                  key={val}
                  className={`m-seg-btn${p.conviction === val ? " is-active" : ""}`}
                  aria-pressed={p.conviction === val}
                  onClick={() => p.setConviction(val)}
                >
                  {lab}
                </button>
              ))}
            </div>
          </section>

          {p.allVps.length > 0 && (
            <section className="m-fgroup">
              <span className="m-flabel">VP{p.selectedVps.size > 0 ? ` · ${p.selectedVps.size}` : ""}</span>
              <div className="m-chipwrap">
                {p.allVps.map((v) => (
                  <button
                    key={v}
                    className={`m-chip${p.selectedVps.has(v) ? " is-active" : ""}`}
                    aria-pressed={p.selectedVps.has(v)}
                    onClick={() => p.toggleVp(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </section>
          )}

          {p.allSas.length > 0 && (
            <section className="m-fgroup">
              <span className="m-flabel">SA{p.selectedSas.size > 0 ? ` · ${p.selectedSas.size}` : ""}</span>
              <div className="m-chipwrap">
                {p.allSas.map((v) => (
                  <button
                    key={v}
                    className={`m-chip${p.selectedSas.has(v) ? " is-active" : ""}`}
                    aria-pressed={p.selectedSas.has(v)}
                    onClick={() => p.toggleSa(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="m-fgroup">
            <span className="m-flabel">
              Sector{p.selectedSectors.size > 0 ? ` · ${p.selectedSectors.size}` : ""}
            </span>
            <div className="m-chipwrap">
              {p.allSectors.map((s) => (
                <button
                  key={s}
                  className={`m-chip${p.selectedSectors.has(s) ? " is-active" : ""}`}
                  aria-pressed={p.selectedSectors.has(s)}
                  onClick={() => p.toggleSector(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>

          <section className="m-fgroup m-ftoggles">
            <label className="m-toggle">
              <span>In F&amp;O only</span>
              <input type="checkbox" checked={p.inFnoOnly} onChange={(e) => p.setInFnoOnly(e.target.checked)} />
            </label>
            <label className="m-toggle">
              <span>Show hidden stocks</span>
              <input type="checkbox" checked={p.showHidden} onChange={(e) => p.setShowHidden(e.target.checked)} />
            </label>
          </section>
        </div>

        <div className="m-sheet-foot">
          <button className="m-sheet-apply" onClick={p.onClose}>
            Show {p.resultCount} stock{p.resultCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
