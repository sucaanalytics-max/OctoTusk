"use client";
// Verdict Table — two-tier sticky header, leader-column tint, frozen metric rail,
// center-zero magnitude bars, 5-pip meters, per-row winner mark.
//
// Change 3 (2026-07-01): full visual port of the Verdict Table mockup.
//   - Two-tier thead: row 1 = identity (sticky top:0); row 2 = CMP strip (sticky top:--hdr-1-h).
//   - useRef + useEffect: measures row-1 height → sets --hdr-1-h CSS var on scroll container.
//   - Scroll listener: adds scrolled-x / scrolled-y classes for rail + freeze shadow CSS hooks.
//   - SSR-safe: all DOM work inside useEffect; CSS fallback --hdr-1-h:66px holds without JS.
//   - Sub-components (MagBar, PipMeter, RangeTrack) + winner helpers in comparisonCells.tsx.
//   - Cell helpers (priceWithUpside, multipleCell, RecChip) in comparisonHelpers.tsx.

import { useRef, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { getCompanyShort } from "@/lib/companyName";
import { fmtRupee } from "@/lib/format";
import { COMPARISON_GROUPS, type Col } from "./comparisonRows";
import { findWinner, computeRowMaxAbs, MagBar, PipMeter, RangeTrack } from "./comparisonCells";
import type {
  CompareStock,
  CompareQuotesMap,
  CompareEnrichmentMap,
  CompareQuote,
  CompareEnrichment,
  ScorecardRow,
} from "@/lib/compare/types";

interface Props {
  rows: ScorecardRow[];
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
  enrichment: CompareEnrichmentMap;
  enrichmentLoading: Record<string, boolean>;
}

export default function ComparisonTable({
  rows,
  stocks,
  quotes,
  enrichment,
  enrichmentLoading,
}: Props) {
  if (stocks.length === 0) return null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const hdr1Ref = useRef<HTMLTableRowElement>(null);

  // Measure row-1 header height → --hdr-1-h (CSS fallback 66px covers SSR/no-JS).
  const measureHdr = useCallback(() => {
    if (!hdr1Ref.current || !scrollRef.current) return;
    const h = hdr1Ref.current.getBoundingClientRect().height;
    scrollRef.current.style.setProperty("--hdr-1-h", `${h}px`);
  }, []);

  // scrolled-x / scrolled-y classes activate rail + freeze box-shadows in CSS.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.classList.toggle("scrolled-x", el.scrollLeft > 0);
    el.classList.toggle("scrolled-y", el.scrollTop > 0);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measureHdr();
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(measureHdr);
    if (hdr1Ref.current) ro.observe(hdr1Ref.current);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [measureHdr, onScroll]);

  // Build per-stock column contexts — resolve CMP once.
  const cols: Col[] = stocks.map((stock) => {
    const { cmp, isLive } = resolveCmp(stock, quotes[stock.tikr]);
    const scoreRow = rows.find((r) => r.tikr === stock.tikr);
    const row: ScorecardRow = scoreRow ?? {
      tikr: stock.tikr,
      cmp,
      cmpIsLive: isLive,
      upDownRatio: null,
      upDownNote: "missing",
      expectedReturn: null,
      cushionToBear: null,
      rankScore: null,
      expReturnAnn: null,
      ann1: null,
      ann2: null,
      bandPos: null,
      scenarioZone: null,
      dispersion: null,
      rankParts: { ret: null, margin: null, safety: null, conviction: null },
      isLeader: false,
    };
    return {
      stock,
      row,
      cmp,
      isLive,
      q: (quotes[stock.tikr] as CompareQuote | undefined) ?? null,
      e: (enrichment[stock.tikr] as CompareEnrichment | undefined) ?? null,
      enrichmentLoading: !!enrichmentLoading[stock.tikr],
    };
  });

  return (
    <section className="cmp-dt-section" aria-label="Comparison table">
      <div
        className="cmp-vt-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="Stock comparison table; scroll horizontally to see all columns"
        style={{ "--hdr-1-h": "66px" } as CSSProperties}
      >
        <table className="cmp-vt-table">
          {/* ── Two-tier sticky header ── */}
          <thead>
            {/* Row 1: identity — TIKR, company name, ★ leader chip */}
            <tr className="cmp-vt-r-identity" ref={hdr1Ref}>
              <th scope="col" className="cmp-vt-rail cmp-vt-corner">
                <span className="cmp-vt-corner-cap">
                  <span className="cmp-vt-corner-eyebrow">Compare</span>
                  <span className="cmp-vt-corner-hint">upside vs CMP</span>
                </span>
              </th>
              {cols.map(({ stock, row }) => {
                const shortName = getCompanyShort({
                  official_name: stock.name,
                  tikr: stock.tikr,
                });
                return (
                  <th
                    key={stock.tikr}
                    scope="col"
                    className={row.isLeader ? "cmp-vt-leader" : ""}
                  >
                    <span className="cmp-vt-id-block">
                      <span className="cmp-vt-id-tikr">
                        {row.isLeader && (
                          <span className="cmp-vt-star" aria-hidden="true">★</span>
                        )}
                        {stock.tikr}
                      </span>
                      <span className="cmp-vt-id-name" title={stock.name}>
                        {shortName}
                      </span>
                      {row.isLeader && (
                        <span className="cmp-vt-leader-chip" role="note" aria-label="Risk-adjusted leader">
                          <span aria-hidden="true">★</span>Best risk-adj
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
            {/* Row 2: CMP sub-strip — pinned below row 1 via top:--hdr-1-h */}
            <tr className="cmp-vt-r-cmp">
              <th scope="col" className="cmp-vt-rail cmp-vt-corner">
                <span className="cmp-vt-cmp-corner">CMP · live</span>
              </th>
              {cols.map(({ stock, cmp, row }) => (
                <th key={stock.tikr} scope="col" className={row.isLeader ? "cmp-vt-leader" : ""}>
                  <span className="cmp-vt-cmp-cell">
                    <span className="cmp-vt-live">
                      <span className="cmp-vt-live-dot" aria-hidden="true" />
                      LIVE
                    </span>
                    <span className="cmp-vt-cmp-val">
                      {cmp != null ? fmtRupee(cmp) : "—"}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {/* ── One tbody per group ── */}
          {COMPARISON_GROUPS.map((group) => (
            <tbody key={group.title}>
              {/* Group band row */}
              <tr className="cmp-vt-group">
                <th scope="colgroup" className="cmp-vt-rail">
                  <span className="cmp-vt-group-label">
                    {group.title}
                    {group.note && (
                      <span className="cmp-vt-group-note">{group.note}</span>
                    )}
                  </span>
                </th>
                <td colSpan={stocks.length} />
              </tr>

              {/* Data rows */}
              {group.rows.map((groupRow) => {
                const winnerIdx = findWinner(groupRow, cols);
                const rowMaxAbs = computeRowMaxAbs(groupRow, cols);
                const isConviction = groupRow.label === "Conviction";
                const isAnalystScore = groupRow.label === "Analyst Score";
                const isRange = groupRow.label === "Position in range";
                const isDirectional = !!groupRow.metric && !!groupRow.goal;
                const barStyle =
                  groupRow.bar === "signed" || groupRow.bar === "risk"
                    ? groupRow.bar
                    : null;

                return (
                  <tr key={groupRow.label}>
                    {/* Frozen metric rail with unit suffix */}
                    <th scope="row" className="cmp-vt-rail">
                      {groupRow.label}
                      {groupRow.unit && (
                        <span className="cmp-vt-rail-unit"> {groupRow.unit}</span>
                      )}
                    </th>

                    {cols.map((col, colIdx) => {
                      const isLeader = col.row.isLeader;
                      const isWin = winnerIdx === colIdx;
                      const isLoser = isDirectional && winnerIdx !== -1 && !isWin;
                      const metricVal = groupRow.metric ? groupRow.metric(col) : null;

                      let tdClass = isLeader ? "cmp-vt-leader" : "";
                      if (isWin) tdClass += " cmp-vt-win";
                      else if (isLoser) tdClass += " cmp-vt-loser";

                      // Pip meter rows
                      if (isConviction || isAnalystScore) {
                        const val = isConviction ? col.stock.conviction : col.stock.score;
                        return (
                          <td key={col.stock.tikr} className={tdClass.trim()}>
                            <PipMeter value={val} isWin={isWin} />
                          </td>
                        );
                      }

                      // Position-in-range row
                      if (isRange) {
                        return (
                          <td key={col.stock.tikr} className={tdClass.trim()}>
                            <RangeTrack row={col.row} stock={col.stock} isLeader={isLeader} />
                          </td>
                        );
                      }

                      // Standard cell
                      const content = groupRow.render(col);
                      const hasBar = barStyle != null && metricVal != null;

                      return (
                        <td key={col.stock.tikr} className={tdClass.trim()}>
                          <span className="cmp-vt-stack">
                            <span className="cmp-vt-primary">
                              {isWin && (
                                <span className="cmp-vt-win-mark" aria-label="best in row">
                                  &#x25B8;
                                </span>
                              )}
                              {content ?? "—"}
                            </span>
                            {hasBar && barStyle && (
                              <MagBar value={metricVal} rowMaxAbs={rowMaxAbs} barStyle={barStyle} />
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      {/* Legend */}
      <div className="cmp-vt-legend" aria-hidden="true">
        <span><span className="k">★</span> risk-adjusted leader</span>
        <span><span className="k">▸</span> best in row (directional metrics only)</span>
        <span>— not available</span>
        <span>prices &amp; multiples shown for reference, not ranked</span>
      </div>

      <p className="cmp-km-note" style={{ padding: "0 var(--space-1) var(--space-3)" }}>
        P/E · P/B show the analyst base-case band;{" "}
        <span className="cmp-ct-cur">cur</span> = current (live) multiple where no
        band exists. EV/EBITDA and Street data load lazily.
      </p>
    </section>
  );
}
