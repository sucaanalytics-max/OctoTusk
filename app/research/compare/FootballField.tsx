// Football field on a %-FROM-CMP axis: every stock's CMP is pinned at 0%, so bear/base/bull
// and 1Y/2Y targets are plotted as % moves and become directly comparable regardless of price
// level. Downside (left of 0) is red-tinted, upside (right of 0) green-tinted.
// SVG viewBox, fluid width, no @media.
// Guards: domain-collapse, missing-CMP, missing-band.
// Layout: bear% label ABOVE band-left-edge; bull% label ABOVE band-right-edge;
//         1Y/2Y ticks and labels BELOW band to avoid overlap. Base notch spans the band.
//
// HTML-label layout (Change 1, 2026-06-30):
//   Each row is a CSS flex row: fixed-width HTML label column + flexible SVG chart column.
//   The axis-header row uses the same template (empty label + tick SVG) for column alignment.
//   Long AMC names no longer clip because the HTML label uses text-overflow:ellipsis.
//   The SVG no longer contains a PAD_L gutter — it owns only the chart area (0..W domain).

import { Fragment, memo } from "react";
import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { fmtRupee, fmtPctRaw } from "@/lib/format";
import { getCompanyShort } from "@/lib/companyName";
import type { CompareStock, CompareQuotesMap } from "@/lib/compare/types";

interface Props {
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
  /**
   * Sector Scan "Chart" view only. When true: bounds the layout in a
   * `.cmp-ff-scan-scroll` pane (max-height ~60vh) and pins the axis-header row via
   * `position:sticky` on its two grid cells (reusing the SAME `.cmp-ff-layout` grid
   * template, not a hand-sized flex row, so the CMP·0 gridlines stay aligned). Also
   * marks each row's chart cell with `data-tikr` so a delegated listener in
   * SectorScanView (ScenarioTip) can identify the hovered/clicked/focused row.
   * Default false → the Comparison-mode render is byte-identical to before.
   */
  scroll?: boolean;
}

// SVG chart area — no label pad here; labels are HTML.
const W = 840;
const PAD_R = 48;
const ROW_H = 64;
const BAND_H = 16;
const LABEL_ABOVE = 16;  // px above band top for bear%/bull% labels
const TICK_BELOW = 10;   // px below band bottom for 1Y/2Y ticks

/** % move from cmp to price. null if either is unusable. */
function pctOf(price: number | null | undefined, cmp: number | null): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  if (cmp == null || cmp <= 0) return null;
  return ((price - cmp) / cmp) * 100;
}

interface RowData {
  stock: CompareStock;
  cmp: number | null;
  bearP: number | null; baseP: number | null; bullP: number | null;
  t1P: number | null; t2P: number | null;
  bandMin: number | null; bandMax: number | null;
  hasBand: boolean;
}

function buildRow(stock: CompareStock, quotes: CompareQuotesMap): RowData {
  const { cmp } = resolveCmp(stock, quotes[stock.tikr]);
  const c = cmp != null && cmp > 0 ? cmp : null;
  const bearP = pctOf(stock.bear, c);
  const baseP = pctOf(stock.base, c);
  const bullP = pctOf(stock.bull, c);
  const present = [bearP, baseP, bullP].filter((v): v is number => v != null);
  const hasBand = present.length >= 2;
  return {
    stock, cmp: c,
    bearP, baseP, bullP,
    t1P: pctOf(stock.target1y, c),
    t2P: pctOf(stock.target2y, c),
    bandMin: hasBand ? Math.min(...present) : null,
    bandMax: hasBand ? Math.max(...present) : null,
    hasBand,
  };
}

function FootballField({ stocks, quotes, scroll = false }: Props) {
  if (stocks.length === 0) return null;
  const rows = stocks.map((s) => buildRow(s, quotes));

  // Domain in % space — always include 0 (the shared CMP reference).
  const vals: number[] = [0];
  for (const r of rows) {
    if (!r.hasBand) continue;
    [r.bearP, r.baseP, r.bullP, r.t1P, r.t2P].forEach((v) => {
      if (v != null) vals.push(v);
    });
  }
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  const span = rawMax - rawMin;
  if (!(span > 0)) {
    return (
      <section className="cmp-ff-wrap" aria-label="Risk/reward chart">
        <h3 className="cmp-section-heading">Risk / Reward · % from current price</h3>
        <p className="cmp-ff-empty">Not enough scenario data to plot</p>
      </section>
    );
  }
  const pad = span * 0.06;
  const domainMin = rawMin - pad;
  const domainMax = rawMax + pad;
  // x() maps a %-value to an SVG x coordinate within the chart-only SVG (no label pad).
  const x = (p: number) => ((p - domainMin) / (domainMax - domainMin)) * (W - PAD_R);
  const zeroX = x(0);

  // Axis ticks — fewer, cleaner. Exclude 0 (the CMP reference line carries that).
  const step = span > 80 ? 20 : span > 40 ? 15 : 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(domainMin / step) * step; t <= domainMax; t += step) {
    if (Math.abs(t) > 1e-6) ticks.push(t);
  }

  // Header SVG height (just the axis row).
  const HEADER_SVG_H = 32;

  return (
    <section className="cmp-ff-wrap" aria-label="Risk/reward — % from current price">
      <h3 className="cmp-section-heading">Risk / Reward · % from current price</h3>
      <div className="cmp-ff-legend" aria-hidden="true">
        <span><i className="cmp-ff-key cmp-ff-key-down" />Bear (downside)</span>
        <span><i className="cmp-ff-key cmp-ff-key-up" />Bull (upside)</span>
        <span className="cmp-ff-legend-base"><i className="cmp-ff-key cmp-ff-key-base" />Base</span>
        <span className="cmp-ff-legend-tick">&#x25B8; 1Y / 2Y target</span>
      </div>

      {/* Outer scroll wrapper — the two-column layout scrolls as a unit.
          Compare mode (scroll=false): plain horizontal-only wrap, unchanged.
          Sector Scan chart (scroll=true): bounded vertical pane + sticky axis row. */}
      <div className={scroll ? "cmp-ff-scan-scroll" : "cmp-ff-svg-wrap"}>
        <div className="cmp-ff-layout" style={{ minWidth: 520 }}>

          {/* ── Axis header row — sticky (both cells) only in scan-scroll mode ── */}
          <div
            className={scroll ? "cmp-ff-label-col cmp-ff-axis-sticky" : "cmp-ff-label-col"}
            aria-hidden="true"
          />
          <div className={scroll ? "cmp-ff-chart-col cmp-ff-axis-sticky" : "cmp-ff-chart-col"}>
            <svg
              viewBox={`0 0 ${W} ${HEADER_SVG_H}`}
              style={{ width: "100%", display: "block" }}
              aria-hidden="true"
            >
              {ticks.map((t, i) => (
                <g key={i}>
                  <text
                    x={x(t)} y={HEADER_SVG_H - 4}
                    textAnchor="middle" fontSize={9} fill="var(--color-text-muted)"
                  >
                    {t > 0 ? "+" : ""}{t}%
                  </text>
                </g>
              ))}
              <text
                x={zeroX} y={HEADER_SVG_H - 4}
                textAnchor="middle" fontSize={10} fontWeight={700}
                fill="var(--color-text-secondary)"
              >
                CMP · 0%
              </text>
            </svg>
          </div>

          {/* ── Data rows ── */}
          {rows.map((r) => {
            const svgH = ROW_H;
            const midY = svgH / 2;
            const bandTop = midY - BAND_H / 2;
            const bandBot = midY + BAND_H / 2;
            const short = getCompanyShort({ official_name: r.stock.name, tikr: r.stock.tikr });
            const bMin = r.bandMin;
            const bMax = r.bandMax;

            return (
              <Fragment key={r.stock.tikr}>
                {/* HTML label cell */}
                <div
                  className="cmp-ff-label-col"
                  title={r.stock.name}
                >
                  <span className="cmp-ff-label-name">{short}</span>
                  {r.cmp != null && (
                    <span className="cmp-ff-label-cmp">{fmtRupee(r.cmp)}</span>
                  )}
                </div>

                {/* SVG chart cell — data-tikr + focus affordance only in Sector Scan chart mode,
                    so ScenarioTip's delegated listener (mount in SectorScanView) can identify
                    the row; compare mode gets neither attribute (byte-identical DOM). */}
                <div
                  className="cmp-ff-chart-col"
                  {...(scroll
                    ? {
                        "data-tikr": r.stock.tikr,
                        tabIndex: 0,
                        role: "button",
                        "aria-label": `Show bear, base, bull for ${r.stock.name}`,
                      }
                    : {})}
                >
                  <svg
                    viewBox={`0 0 ${W} ${svgH}`}
                    style={{ width: "100%", display: "block" }}
                    aria-hidden="true"
                  >
                    {/* Row top divider */}
                    <line
                      x1={0} y1={0} x2={W} y2={0}
                      stroke="var(--color-border-subtle)" strokeWidth={0.5}
                    />

                    {/* Gridlines aligned to axis ticks */}
                    {ticks.map((t, i) => (
                      <line
                        key={i}
                        x1={x(t)} y1={0} x2={x(t)} y2={svgH}
                        stroke="var(--color-border-subtle)" strokeWidth={0.75}
                        strokeDasharray="2 4"
                      />
                    ))}

                    {/* Emphasized CMP · 0% reference line */}
                    <line
                      x1={zeroX} y1={0} x2={zeroX} y2={svgH}
                      stroke="var(--color-text-secondary)" strokeWidth={1.5}
                    />

                    {r.hasBand && bMin != null && bMax != null ? (
                      <>
                        {/* Downside half: bear→0 (red-tinted) */}
                        {bMin < 0 && (
                          <rect
                            x={x(bMin)}
                            y={bandTop}
                            width={Math.max(2, x(Math.min(0, bMax)) - x(bMin))}
                            height={BAND_H}
                            rx={4}
                            fill="var(--color-negative-bg)"
                            stroke="var(--color-negative)"
                            strokeWidth={0.75}
                            strokeOpacity={0.5}
                          />
                        )}
                        {/* Upside half: 0→bull (green-tinted) */}
                        {bMax > 0 && (
                          <rect
                            x={x(Math.max(0, bMin))}
                            y={bandTop}
                            width={Math.max(2, x(bMax) - x(Math.max(0, bMin)))}
                            height={BAND_H}
                            rx={4}
                            fill="var(--color-positive-bg)"
                            stroke="var(--color-positive)"
                            strokeWidth={0.75}
                            strokeOpacity={0.5}
                          />
                        )}

                        {/* Base notch */}
                        {r.baseP != null && (
                          <line
                            x1={x(r.baseP)} y1={bandTop - 1}
                            x2={x(r.baseP)} y2={bandBot + 1}
                            stroke="var(--color-warning)" strokeWidth={2.5}
                            strokeLinecap="round"
                          />
                        )}

                        {/* Bear % label — above band-left-edge */}
                        {r.bearP != null && (
                          <text
                            x={x(bMin)}
                            y={bandTop - LABEL_ABOVE}
                            textAnchor="middle"
                            fontSize={9}
                            fill="var(--color-negative)"
                            fontWeight={600}
                          >
                            {fmtPctRaw(r.bearP)}
                          </text>
                        )}
                        {/* Bull % label — above band-right-edge */}
                        {r.bullP != null && (
                          <text
                            x={x(bMax)}
                            y={bandTop - LABEL_ABOVE}
                            textAnchor="middle"
                            fontSize={9}
                            fill="var(--color-positive)"
                            fontWeight={600}
                          >
                            {fmtPctRaw(r.bullP)}
                          </text>
                        )}

                        {/* 1Y / 2Y target ticks — BELOW band */}
                        {([
                          { p: r.t1P, label: "1Y" },
                          { p: r.t2P, label: "2Y" },
                        ] as const).map((tg, ti) =>
                          tg.p != null ? (
                            <g key={ti}>
                              <text
                                x={x(tg.p)}
                                y={bandBot + TICK_BELOW + 2}
                                textAnchor="middle"
                                fontSize={10}
                                fill="var(--color-text-secondary)"
                              >
                                ▸
                              </text>
                              <text
                                x={x(tg.p)}
                                y={bandBot + TICK_BELOW + 13}
                                textAnchor="middle"
                                fontSize={8}
                                fill="var(--color-text-muted)"
                              >
                                {tg.label}
                              </text>
                            </g>
                          ) : null
                        )}
                      </>
                    ) : (
                      <text
                        x={r.cmp != null ? zeroX + 12 : 12}
                        y={midY + 4}
                        fontSize={9}
                        fill="var(--color-text-muted)"
                      >
                        no scenario band
                      </text>
                    )}

                    {/* CMP dot at 0% */}
                    {r.cmp != null && (
                      <circle
                        cx={zeroX} cy={midY} r={5}
                        fill="var(--color-text-secondary)"
                        stroke="var(--color-bg-card)" strokeWidth={1.5}
                      />
                    )}
                  </svg>
                </div>
              </Fragment>
            );
          })}

          {/* Bottom axis rule */}
          <div className="cmp-ff-label-col" aria-hidden="true" />
          <div className="cmp-ff-chart-col">
            <svg viewBox={`0 0 ${W} 4`} style={{ width: "100%", display: "block" }} aria-hidden="true">
              <line x1={0} y1={2} x2={W - PAD_R} y2={2} stroke="var(--color-border)" strokeWidth={1} />
            </svg>
          </div>

        </div>
      </div>
    </section>
  );
}

// Memoized: used both in Comparison mode (stable `selectedStocks`/`quotes` from CompareClient)
// and Sector Scan's Chart view (stable `sortedStocks`/`quotes` from SectorScanView) — a
// tip-position-only re-render in either parent leaves these props referentially unchanged.
export default memo(FootballField);
