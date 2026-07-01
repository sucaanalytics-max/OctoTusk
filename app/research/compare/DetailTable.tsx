"use client";
// Full metric comparison table — collapsed in a <details> element.
// Restyled (2026-07-01) to match the Verdict Table chrome (cmp-vt-* classes).
// Two-tier sticky header, leader-column spine, frozen metric rail, group bands.
// All values via lib/format.ts and detailRows extractors. null → "—".

import { useRef, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { getCompanyShort } from "@/lib/companyName";
import { fmtRupee } from "@/lib/format";
import { DETAIL_SECTIONS } from "./detailRows";
import type {
  CompareStock, CompareQuotesMap, CompareEnrichmentMap,
  CompareQuote, CompareEnrichment, ScorecardRow,
} from "@/lib/compare/types";

interface Props {
  rows: ScorecardRow[];
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
  enrichment: CompareEnrichmentMap;
  enrichmentLoading: Record<string, boolean>;
}

const LOADING_PLACEHOLDER = "…";
const EMPTY = "—";

// Sections that need enrichment data (0-indexed): Fundamentals(3) + Profitability&Growth(5)
const ENRICHMENT_SECTIONS = new Set([3, 5]);

function cellValue(
  stock: CompareStock,
  q: CompareQuote | null,
  e: CompareEnrichment | null,
  cmp: number | null,
  isEnrichmentLoading: boolean,
  getValue: (s: CompareStock, q: CompareQuote | null, e: CompareEnrichment | null, cmp: number | null) => string,
  needsEnrichment: boolean,
): string {
  if (needsEnrichment && isEnrichmentLoading) return LOADING_PLACEHOLDER;
  const v = getValue(stock, q, e, cmp);
  return v ?? EMPTY;
}

export default function DetailTable({ rows, stocks, quotes, enrichment, enrichmentLoading }: Props) {
  const totalRows = DETAIL_SECTIONS.reduce((s, sec) => s + sec.rows.length, 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const hdr1Ref = useRef<HTMLTableRowElement>(null);

  // Measure row-1 height → --hdr-1-h (CSS fallback 66px covers SSR/no-JS).
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

  // Early-return after all hooks — guards rendering with 0 selected stocks.
  if (stocks.length === 0) return null;

  // Build per-stock column contexts — resolve CMP + isLeader once.
  const cols = stocks.map((stock) => {
    const { cmp, isLive } = resolveCmp(stock, quotes[stock.tikr]);
    const scoreRow = rows.find((r) => r.tikr === stock.tikr);
    const isLeader = scoreRow?.isLeader ?? false;
    return {
      stock,
      cmp,
      isLive,
      isLeader,
      q: (quotes[stock.tikr] as CompareQuote | undefined) ?? null,
      e: (enrichment[stock.tikr] as CompareEnrichment | undefined) ?? null,
      enrichmentLoading: !!enrichmentLoading[stock.tikr],
    };
  });

  return (
    <section className="cmp-dt-section" aria-label="Full metric detail table">
      <details className="cmp-dt-details">
        <summary className="cmp-dt-summary">
          Financials &amp; full metric detail ({totalRows} rows)
        </summary>

        <div
          className="cmp-vt-scroll"
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label="Full metric detail table; scroll horizontally to see all columns"
          style={{ "--hdr-1-h": "66px" } as CSSProperties}
        >
          <table className="cmp-vt-table">
            {/* ── Two-tier sticky header ── */}
            <thead>
              {/* Row 1: identity — TIKR, company name, ★ leader chip */}
              <tr className="cmp-vt-r-identity" ref={hdr1Ref}>
                <th scope="col" className="cmp-vt-rail cmp-vt-corner">
                  <span className="cmp-vt-corner-cap">
                    <span className="cmp-vt-corner-eyebrow">Full detail</span>
                    <span className="cmp-vt-corner-hint">{totalRows} metrics</span>
                  </span>
                </th>
                {cols.map(({ stock, isLeader }) => {
                  const shortName = getCompanyShort({
                    official_name: stock.name,
                    tikr: stock.tikr,
                  });
                  return (
                    <th
                      key={stock.tikr}
                      scope="col"
                      className={isLeader ? "cmp-vt-leader" : ""}
                    >
                      <span className="cmp-vt-id-block">
                        <span className="cmp-vt-id-tikr">
                          {isLeader && (
                            <span className="cmp-vt-star" aria-hidden="true">★</span>
                          )}
                          {stock.tikr}
                        </span>
                        <span className="cmp-vt-id-name" title={stock.name}>
                          {shortName}
                        </span>
                        {isLeader && (
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
                {cols.map(({ stock, cmp, isLive, isLeader }) => (
                  <th key={stock.tikr} scope="col" className={isLeader ? "cmp-vt-leader" : ""}>
                    <span className="cmp-vt-cmp-cell">
                      <span className="cmp-vt-live">
                        <span
                          className="cmp-vt-live-dot"
                          aria-hidden="true"
                          style={!isLive ? { background: "var(--color-text-muted)", animation: "none" } : undefined}
                        />
                        {isLive ? "LIVE" : "SNAP"}
                      </span>
                      <span className="cmp-vt-cmp-val">
                        {cmp != null ? fmtRupee(cmp) : "—"}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            {/* ── One tbody per section: group band + data rows ── */}
            {DETAIL_SECTIONS.map((section, secIdx) => {
              const needsEnrichment = ENRICHMENT_SECTIONS.has(secIdx);
              return (
                <tbody key={`sec-${secIdx}`}>
                  {/* Group band row */}
                  <tr className="cmp-vt-group">
                    <th scope="colgroup" className="cmp-vt-rail">
                      <span className="cmp-vt-group-label">
                        {section.title}
                        {section.note && (
                          <span className="cmp-vt-group-note">{section.note}</span>
                        )}
                      </span>
                    </th>
                    <td colSpan={stocks.length} />
                  </tr>

                  {/* Data rows */}
                  {section.rows.map((row, rowIdx) => {
                    const effectiveUnit = row.unit ?? section.sectionUnit;
                    return (
                      <tr key={`${secIdx}-${rowIdx}`}>
                        {/* Frozen metric rail with unit suffix */}
                        <th scope="row" className="cmp-vt-rail">
                          {row.label}
                          {effectiveUnit && (
                            <span className="cmp-vt-rail-unit"> {effectiveUnit}</span>
                          )}
                        </th>

                        {cols.map(({ stock, cmp, q, e, isLeader, enrichmentLoading: eLoading }) => {
                          const val = cellValue(
                            stock, q, e, cmp, eLoading, row.getValue, needsEnrichment,
                          );
                          const isMuted = val === EMPTY || val === LOADING_PLACEHOLDER;
                          return (
                            <td
                              key={stock.tikr}
                              className={[
                                isLeader ? "cmp-vt-leader" : "",
                                isMuted ? "cmp-dt-val-muted" : "",
                              ].filter(Boolean).join(" ") || undefined}
                            >
                              <span className="cmp-vt-single">{val}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      </details>
    </section>
  );
}
