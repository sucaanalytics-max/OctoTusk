// Equity-research football-field chart: bear/base/bull/target bands per stock.
// SVG viewBox="0 0 1000 H", width:100% — no hardcoded pixel widths, no @media.
// Red-team guards: domain-collapse check (≥2 distinct finite points, span>0);
// band-ordering: draws min→max of PRESENT scenario values (not canonical order).

import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { scenarioZone } from "@/lib/scenarioUpside";
import { fmtRupee, fmtNum } from "@/lib/format";
import { getCompanyShort } from "@/lib/companyName";
import type { CompareStock, CompareQuotesMap } from "@/lib/compare/types";

interface Props {
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
}

const W = 1000;
const PAD_L = 155; // gutter for row labels
const PAD_R = 60;
const ROW_H = 46;
const HEADER_H = 56;
const BAND_H = 12;
const TICK_COUNT = 5;

function xScale(v: number, domainMin: number, domainMax: number): number {
  return PAD_L + ((v - domainMin) / (domainMax - domainMin)) * (W - PAD_L - PAD_R);
}

// Zone → CSS var name (used as SVG fill via currentColor trick with inline style).
function zoneColor(zone: ReturnType<typeof scenarioZone>): string {
  if (zone === "cheap") return "var(--color-positive)";
  if (zone === "rich") return "var(--color-negative)";
  if (zone === "fair") return "var(--color-warning)";
  return "var(--color-text-muted)";
}

interface RowData {
  stock: CompareStock;
  cmp: number | null;
  cmpIsLive: boolean;
  hasBand: boolean;
  // Present scenario prices (bear, base, bull) — only non-null ones included
  scenarios: { bear: number | null; base: number | null; bull: number | null };
  bandMin: number | null; // min of present {bear, base, bull}
  bandMax: number | null; // max of present {bear, base, bull}
}

function buildRowData(stock: CompareStock, quotes: CompareQuotesMap): RowData {
  const { cmp, isLive } = resolveCmp(stock, quotes[stock.tikr]);
  const { bear, base, bull, target1y, target2y } = stock;

  // Present band points (only >0 finite values)
  const present = [bear, base, bull].filter(
    (v): v is number => v != null && Number.isFinite(v) && v > 0
  );
  const hasBand = present.length >= 2;
  const bandMin = hasBand ? Math.min(...present) : null;
  const bandMax = hasBand ? Math.max(...present) : null;

  void target1y; void target2y; // used in domain calc below

  return {
    stock,
    cmp: cmp && cmp > 0 ? cmp : null,
    cmpIsLive: isLive,
    hasBand,
    scenarios: { bear, base, bull },
    bandMin,
    bandMax,
  };
}

export default function FootballField({ stocks, quotes }: Props) {
  if (stocks.length === 0) return null;

  const rows = stocks.map((s) => buildRowData(s, quotes));

  // Domain: collect all finite positive values across stocks.
  const allDomainValues: number[] = [];
  for (const r of rows) {
    const { cmp, stock } = r;
    const { bear, base, bull, target1y, target2y } = stock;
    [cmp, bear, base, bull, target1y, target2y].forEach((v) => {
      if (v != null && Number.isFinite(v) && v > 0) allDomainValues.push(v);
    });
  }
  const seen = new Set<number>();
  const distinctValues = allDomainValues.filter((v) => { if (seen.has(v)) return false; seen.add(v); return true; }).sort((a, b) => a - b);

  // Red-team #8: guard against domain collapse.
  if (distinctValues.length < 2) {
    return (
      <div className="cmp-ff-wrap" aria-label="Football field chart">
        <p className="cmp-ff-empty">Not enough scenario data to plot</p>
      </div>
    );
  }
  const rawMin = distinctValues[0];
  const rawMax = distinctValues[distinctValues.length - 1];
  const span = rawMax - rawMin;
  if (span <= 0) {
    return (
      <div className="cmp-ff-wrap" aria-label="Football field chart">
        <p className="cmp-ff-empty">Not enough scenario data to plot</p>
      </div>
    );
  }

  const pad = span * 0.04;
  const domainMin = rawMin - pad;
  const domainMax = rawMax + pad;
  const domainSpan = domainMax - domainMin;

  const svgH = HEADER_H + ROW_H * rows.length;

  // Gridline ticks
  const ticks: number[] = [];
  for (let i = 0; i < TICK_COUNT; i++) {
    ticks.push(domainMin + (i / (TICK_COUNT - 1)) * domainSpan);
  }

  return (
    <section className="cmp-ff-wrap" aria-label="Football field — bear/base/bull price ranges">
      <h3 className="cmp-section-heading">Price Range (Football Field)</h3>
      <div className="cmp-ff-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${svgH}`}
          style={{ width: "100%", maxWidth: "100%", display: "block" }}
          aria-hidden="true"
          role="img"
        >
          {/* Gridlines */}
          {ticks.map((v, i) => {
            const x = xScale(v, domainMin, domainMax);
            return (
              <g key={i}>
                <line
                  x1={x} y1={HEADER_H} x2={x} y2={svgH}
                  stroke="var(--color-border)" strokeWidth={1}
                />
                <text
                  x={x} y={HEADER_H - 8}
                  textAnchor="middle" fontSize={11}
                  fill="var(--color-text-secondary)"
                >
                  {fmtRupee(v, 0)}
                </text>
              </g>
            );
          })}

          {/* Rows */}
          {rows.map((r, ri) => {
            const y = HEADER_H + ri * ROW_H;
            const midY = y + ROW_H / 2;
            const { stock, cmp, hasBand, scenarios, bandMin, bandMax } = r;
            const zone = scenarioZone(cmp, scenarios.bear, scenarios.bull);
            const cmpColor = zoneColor(zone);
            const shortName = getCompanyShort({ official_name: stock.name, tikr: stock.tikr });

            return (
              <g key={stock.tikr}>
                {/* Row separator */}
                <line x1={0} y1={y} x2={W} y2={y} stroke="var(--color-border-subtle)" strokeWidth={1} />

                {/* Label gutter */}
                <text
                  x={PAD_L - 8} y={midY - 6}
                  textAnchor="end" fontSize={11} fontWeight={600}
                  fill="var(--color-text-primary)"
                >
                  {shortName}
                </text>
                {cmp != null && (
                  <text
                    x={PAD_L - 8} y={midY + 8}
                    textAnchor="end" fontSize={10}
                    fill={cmpColor}
                  >
                    {fmtRupee(cmp)}
                  </text>
                )}

                {/* Band */}
                {hasBand && bandMin != null && bandMax != null ? (
                  <>
                    {/* Bear→Bull band rect */}
                    <rect
                      x={xScale(bandMin, domainMin, domainMax)}
                      y={midY - BAND_H / 2}
                      width={Math.max(1, xScale(bandMax, domainMin, domainMax) - xScale(bandMin, domainMin, domainMax))}
                      height={BAND_H}
                      fill="var(--color-info-bg)"
                      stroke="var(--color-accent-blue)"
                      strokeWidth={1}
                      rx={3}
                    />
                    {/* Base internal tick (if present and within band) */}
                    {scenarios.base != null && (
                      <line
                        x1={xScale(scenarios.base, domainMin, domainMax)}
                        y1={midY - BAND_H / 2 - 3}
                        x2={xScale(scenarios.base, domainMin, domainMax)}
                        y2={midY + BAND_H / 2 + 3}
                        stroke="var(--color-warning)"
                        strokeWidth={2}
                      />
                    )}
                    {/* Target 1Y marker (diamond above band) */}
                    {stock.target1y != null && stock.target1y > 0 && (
                      <>
                        <polygon
                          points={`${xScale(stock.target1y, domainMin, domainMax)},${midY - BAND_H / 2 - 10} ${xScale(stock.target1y, domainMin, domainMax) - 5},${midY - BAND_H / 2 - 5} ${xScale(stock.target1y, domainMin, domainMax)},${midY - BAND_H / 2} ${xScale(stock.target1y, domainMin, domainMax) + 5},${midY - BAND_H / 2 - 5}`}
                          fill="var(--color-text-muted)"
                          opacity={0.7}
                        />
                        <text
                          x={xScale(stock.target1y, domainMin, domainMax)}
                          y={midY - BAND_H / 2 - 13}
                          textAnchor="middle" fontSize={8}
                          fill="var(--color-text-muted)"
                        >1Y</text>
                      </>
                    )}
                    {/* Target 2Y marker */}
                    {stock.target2y != null && stock.target2y > 0 && (
                      <>
                        <polygon
                          points={`${xScale(stock.target2y, domainMin, domainMax)},${midY + BAND_H / 2 + 10} ${xScale(stock.target2y, domainMin, domainMax) - 5},${midY + BAND_H / 2 + 5} ${xScale(stock.target2y, domainMin, domainMax)},${midY + BAND_H / 2} ${xScale(stock.target2y, domainMin, domainMax) + 5},${midY + BAND_H / 2 + 5}`}
                          fill="var(--color-text-secondary)"
                          opacity={0.7}
                        />
                        <text
                          x={xScale(stock.target2y, domainMin, domainMax)}
                          y={midY + BAND_H / 2 + 22}
                          textAnchor="middle" fontSize={8}
                          fill="var(--color-text-muted)"
                        >2Y</text>
                      </>
                    )}
                  </>
                ) : (
                  // No band: CMP-dot-only with muted "no band" tag
                  <text
                    x={cmp != null ? xScale(cmp, domainMin, domainMax) + 8 : PAD_L + 8}
                    y={midY + 4}
                    fontSize={9} fill="var(--color-text-muted)"
                  >
                    no band
                  </text>
                )}

                {/* CMP circle */}
                {cmp != null && (
                  <circle
                    cx={xScale(cmp, domainMin, domainMax)}
                    cy={midY}
                    r={6}
                    fill={cmpColor}
                    stroke="var(--color-bg-card)"
                    strokeWidth={1.5}
                  />
                )}

                {/* Scenario price labels at band ends */}
                {hasBand && bandMin != null && scenarios.bear != null && (
                  <text
                    x={xScale(bandMin, domainMin, domainMax) - 3}
                    y={midY + 4}
                    textAnchor="end" fontSize={9}
                    fill="var(--color-negative)"
                  >
                    {fmtNum(scenarios.bear, 0)}
                  </text>
                )}
                {hasBand && bandMax != null && scenarios.bull != null && (
                  <text
                    x={xScale(bandMax, domainMin, domainMax) + 3}
                    y={midY + 4}
                    textAnchor="start" fontSize={9}
                    fill="var(--color-positive)"
                  >
                    {fmtNum(scenarios.bull, 0)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Bottom baseline */}
          <line
            x1={PAD_L} y1={svgH - 2} x2={W - PAD_R} y2={svgH - 2}
            stroke="var(--color-border)" strokeWidth={1}
          />
        </svg>
      </div>
    </section>
  );
}
