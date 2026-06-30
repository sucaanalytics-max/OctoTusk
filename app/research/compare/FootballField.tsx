// Football field on a %-FROM-CMP axis: every stock's CMP is pinned at 0%, so bear/base/bull
// and 1Y/2Y targets are plotted as % moves and become directly comparable regardless of price
// level. Downside (left of 0) is red-tinted, upside (right of 0) green-tinted; the conviction-
// weighted model return is a ◆ marker. SVG viewBox, fluid width, no @media.
// Guards: domain-collapse, missing-CMP, missing-band.
// Layout: bear% label ABOVE band-left-edge; bull% label ABOVE band-right-edge;
//         1Y/2Y ticks and labels BELOW band to avoid overlap. Base notch spans the band.

import { resolveCmp, convictionWeightedReturn } from "@/lib/compare/riskAdjusted";
import { fmtRupee, fmtPctRaw } from "@/lib/format";
import { getCompanyShort } from "@/lib/companyName";
import type { CompareStock, CompareQuotesMap } from "@/lib/compare/types";

interface Props {
  stocks: CompareStock[];
  quotes: CompareQuotesMap;
}

const W = 1000;
const PAD_L = 172; // gutter for row labels (name + CMP)
const PAD_R = 56;
const ROW_H = 64;
const HEADER_H = 38;
const BAND_H = 16;       // band height — more presence
const LABEL_ABOVE = 16;  // px above band top for value labels (bear%/bull%)
const TICK_BELOW = 10;   // px below band bottom for 1Y/2Y tick marks

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
  t1P: number | null; t2P: number | null; evP: number | null;
  bandMin: number | null; bandMax: number | null;
  hasBand: boolean;
}

function buildRow(stock: CompareStock, quotes: CompareQuotesMap): RowData {
  const { cmp } = resolveCmp(stock, quotes[stock.tikr]);
  const c = cmp != null && cmp > 0 ? cmp : null;
  const bearP = pctOf(stock.bear, c);
  const baseP = pctOf(stock.base, c);
  const bullP = pctOf(stock.bull, c);
  const erFrac = convictionWeightedReturn(c, stock.bear, stock.base, stock.bull, stock.conviction);
  const present = [bearP, baseP, bullP].filter((v): v is number => v != null);
  const hasBand = present.length >= 2;
  return {
    stock, cmp: c,
    bearP, baseP, bullP,
    t1P: pctOf(stock.target1y, c),
    t2P: pctOf(stock.target2y, c),
    evP: erFrac != null ? erFrac * 100 : null,
    bandMin: hasBand ? Math.min(...present) : null,
    bandMax: hasBand ? Math.max(...present) : null,
    hasBand,
  };
}

export default function FootballField({ stocks, quotes }: Props) {
  if (stocks.length === 0) return null;
  const rows = stocks.map((s) => buildRow(s, quotes));

  // Domain in % space — always include 0 (the shared CMP reference).
  const vals: number[] = [0];
  for (const r of rows) {
    if (!r.hasBand) continue;
    [r.bearP, r.baseP, r.bullP, r.t1P, r.t2P, r.evP].forEach((v) => {
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
  const x = (p: number) => PAD_L + ((p - domainMin) / (domainMax - domainMin)) * (W - PAD_L - PAD_R);
  const svgH = HEADER_H + ROW_H * rows.length + 8;
  const zeroX = x(0);

  // Axis ticks — fewer, cleaner. Exclude 0 (the CMP reference line carries that).
  const step = span > 80 ? 20 : span > 40 ? 15 : 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(domainMin / step) * step; t <= domainMax; t += step) {
    if (Math.abs(t) > 1e-6) ticks.push(t);
  }

  return (
    <section className="cmp-ff-wrap" aria-label="Risk/reward — % from current price">
      <h3 className="cmp-section-heading">Risk / Reward · % from current price</h3>
      <div className="cmp-ff-legend" aria-hidden="true">
        <span><i className="cmp-ff-key cmp-ff-key-down" />Bear (downside)</span>
        <span><i className="cmp-ff-key cmp-ff-key-up" />Bull (upside)</span>
        <span className="cmp-ff-legend-base"><i className="cmp-ff-key cmp-ff-key-base" />Base</span>
        <span><i className="cmp-ff-key cmp-ff-key-ev" />&#x25C6; Model EV</span>
        <span className="cmp-ff-legend-tick">&#x25B8; 1Y / 2Y target</span>
      </div>
      <div className="cmp-ff-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${svgH}`}
          style={{ width: "100%", maxWidth: "100%", display: "block" }}
          role="img"
          aria-hidden="true"
        >
          {/* Subtle gridlines with % labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={x(t)} y1={HEADER_H} x2={x(t)} y2={svgH - 4}
                stroke="var(--color-border-subtle)" strokeWidth={0.75}
                strokeDasharray="2 4"
              />
              <text
                x={x(t)} y={HEADER_H - 6}
                textAnchor="middle" fontSize={9} fill="var(--color-text-muted)"
              >
                {t > 0 ? "+" : ""}{t}%
              </text>
            </g>
          ))}

          {/* Emphasized CMP · 0% reference line */}
          <line
            x1={zeroX} y1={HEADER_H - 2} x2={zeroX} y2={svgH - 4}
            stroke="var(--color-text-secondary)" strokeWidth={1.5}
          />
          <text
            x={zeroX} y={HEADER_H - 6}
            textAnchor="middle" fontSize={10} fontWeight={700}
            fill="var(--color-text-secondary)"
          >
            CMP · 0%
          </text>

          {rows.map((r, ri) => {
            const y = HEADER_H + ri * ROW_H;
            const midY = y + ROW_H / 2;
            const bandTop = midY - BAND_H / 2;
            const bandBot = midY + BAND_H / 2;
            const short = getCompanyShort({ official_name: r.stock.name, tikr: r.stock.tikr });
            const bMin = r.bandMin;
            const bMax = r.bandMax;

            return (
              <g key={r.stock.tikr}>
                {/* Row divider */}
                <line
                  x1={0} y1={y} x2={W} y2={y}
                  stroke="var(--color-border-subtle)" strokeWidth={0.5}
                />

                {/* Label gutter: name + CMP right-aligned */}
                <text
                  x={PAD_L - 12} y={midY - 5}
                  textAnchor="end" fontSize={12} fontWeight={650}
                  fill="var(--color-text-primary)"
                >
                  {short}
                </text>
                {r.cmp != null && (
                  <text
                    x={PAD_L - 12} y={midY + 10}
                    textAnchor="end" fontSize={10}
                    fill="var(--color-text-secondary)"
                    fontFamily="var(--font-mono)"
                  >
                    {fmtRupee(r.cmp)}
                  </text>
                )}

                {r.hasBand && bMin != null && bMax != null ? (
                  <>
                    {/* Downside half: bear→0 (red-tinted, rounded left) */}
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
                    {/* Upside half: 0→bull (green-tinted, rounded right) */}
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

                    {/* Base notch (spans full band height) */}
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

                    {/* 1Y / 2Y target ticks — BELOW band to avoid overlap with value labels */}
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

                    {/* Model EV marker ◆ — above band, between bear% label and band */}
                    {r.evP != null && (
                      <rect
                        x={x(r.evP) - 4}
                        y={bandTop - 10}
                        width={8} height={8}
                        transform={`rotate(45 ${x(r.evP)} ${bandTop - 6})`}
                        fill="var(--color-accent-blue)"
                      />
                    )}
                  </>
                ) : (
                  <text
                    x={r.cmp != null ? zeroX + 12 : PAD_L + 12}
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
              </g>
            );
          })}

          {/* Bottom axis rule */}
          <line
            x1={PAD_L} y1={svgH - 4} x2={W - PAD_R} y2={svgH - 4}
            stroke="var(--color-border)" strokeWidth={1}
          />
        </svg>
      </div>
    </section>
  );
}
