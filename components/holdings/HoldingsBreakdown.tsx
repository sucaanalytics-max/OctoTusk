"use client";
import { Fragment, useMemo, useState } from "react";
import {
  buildHoldingsBreakdown,
  topSectorsWithOther,
  SECTOR_CONCENTRATED_PCT,
  SECTOR_DOMINANT_PCT,
  type BreakdownInput,
  type CompositionSlice,
} from "@/lib/holdingsBreakdown";

// ── Prop types ────────────────────────────────────────────────────────────────

export interface BreakdownHolding {
  asset_name: string;
  tikr?: string | null;
  liveValue: number;
  amt_invested: number;
  liveGain: number;
  stockData?: { sector?: string | null; subsector?: string | null; companyShort?: string | null } | null;
}

// ── Number formatters (en-IN, Cr scale, real minus) ──────────────────────────

const cr = (n: number) =>
  `₹${(n / 1e7).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
const pctTxt = (p: number | null) =>
  p == null ? "—" : `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`;
const ud = (n: number) => (n >= 0 ? "var(--color-positive)" : "var(--color-negative)");

const RIGHT: React.CSSProperties = { textAlign: "right", padding: "4px 8px" };
const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
const RIGHT_MONO: React.CSSProperties = { ...RIGHT, ...MONO };

// ── Local SectionHeading (copied from SegmentsTab.tsx:48-61) ─────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        marginBottom: 14,
        fontWeight: 700,
        fontSize: "var(--text-base)",
        color: "var(--color-text-primary)",
        paddingLeft: 10,
        borderLeft: "3px solid var(--color-warning)",
      }}
    >
      {children}
    </h3>
  );
}

// ── Donut arc math (copied from SegmentsTab.tsx:468-483) ─────────────────────

const CX = 80, CY = 80, R = 62, R_INNER = 38;

function arcPath(sa: number, ea: number): string {
  const x1 = CX + R * Math.cos(sa),        y1 = CY + R * Math.sin(sa);
  const x2 = CX + R * Math.cos(ea),        y2 = CY + R * Math.sin(ea);
  const x3 = CX + R_INNER * Math.cos(ea),  y3 = CY + R_INNER * Math.sin(ea);
  const x4 = CX + R_INNER * Math.cos(sa),  y4 = CY + R_INNER * Math.sin(sa);
  const lg = (ea - sa) > Math.PI ? 1 : 0;
  return `M${x1},${y1} A${R},${R} 0 ${lg},1 ${x2},${y2} L${x3},${y3} A${R_INNER},${R_INNER} 0 ${lg},0 ${x4},${y4}Z`;
}

function buildPaths(slices: CompositionSlice[]) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  let angle = -Math.PI / 2;
  return slices.map((d) => {
    const sweep = total > 0 ? (d.value / total) * 2 * Math.PI : 0;
    const path = arcPath(angle, angle + sweep);
    angle += sweep;
    return { ...d, path };
  });
}

function sliceColor(i: number, isOther: boolean): string {
  if (isOther) return "var(--color-segment-unclassified)";
  return `var(--color-chart-${i + 1})`;
}

// ── DonutChart (adapted from SegmentsTab.tsx:507-527) ────────────────────────

function DonutChart({ slices }: { slices: CompositionSlice[] }) {
  const paths = buildPaths(slices);
  const ariaLabel =
    slices.length === 0
      ? "No holdings to chart"
      : "Sector allocation: " +
        slices
          .slice(0, 3)
          .map((s) => `${s.key} ${s.weightPct.toFixed(1)}%`)
          .join(", ") +
        (slices.length > 3 ? ` and ${slices.length - 3} more` : "");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg
        viewBox="0 0 160 160"
        className="sector-donut-svg"
        style={{ width: 140, height: 140, flexShrink: 0 }}
        role="img"
        aria-label={ariaLabel}
      >
        {paths.map((p, i) => (
          <path key={p.key} d={p.path} fill={sliceColor(i, p.isOther)} />
        ))}
        {slices.length === 0 && (
          <circle cx={CX} cy={CY} r={R} fill="var(--color-bg-elevated)" />
        )}
      </svg>

      {/* Legend (copied from SegmentsTab.tsx:515-527) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {paths.map((p, i) => (
          <div
            key={p.key}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)" }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: sliceColor(i, p.isOther),
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ color: "var(--color-text-primary)" }}>{p.key}</span>
            <span style={{ ...MONO, color: "var(--color-text-secondary)" }}>
              {p.weightPct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inline neutral weight bar (adapted from SegmentsTab.tsx:202-207) ─────────

function WeightBar({ pct, maxPct = 100 }: { pct: number; maxPct?: number }) {
  const fillPct = maxPct > 0 ? Math.min((pct / maxPct) * 100, 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
      <div
        style={{
          width: 60,
          height: 4,
          borderRadius: 2,
          background: "var(--color-border)",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${fillPct}%`,
            height: "100%",
            background: "var(--color-text-secondary)",
            borderRadius: 2,
            transition: "width 0.3s",
          }}
        />
      </div>
      <span style={{ ...MONO, minWidth: 40, textAlign: "right" }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

// ── Concentration label for weight% cell ─────────────────────────────────────

function ConcentrationLabel({ weightPct }: { weightPct: number }) {
  if (weightPct >= SECTOR_DOMINANT_PCT) {
    return (
      <span style={{ color: "var(--color-negative)", fontWeight: 700 }}>
        {weightPct.toFixed(1)}% ⚠ Dom.
      </span>
    );
  }
  if (weightPct >= SECTOR_CONCENTRATED_PCT) {
    return (
      <span style={{ color: "var(--color-warning)", fontWeight: 700 }}>
        {weightPct.toFixed(1)}% ⚠
      </span>
    );
  }
  return <span style={MONO}>{weightPct.toFixed(1)}%</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function HoldingsBreakdown({ enrichedHoldings }: { enrichedHoldings: BreakdownHolding[] }) {
  const result = useMemo(() => {
    const items: BreakdownInput[] = enrichedHoldings.map((h) => ({
      assetName: h.stockData?.companyShort || h.asset_name,
      tikr: h.tikr ?? null,
      fallbackSector: h.stockData?.sector ?? null,
      fallbackSubsector: h.stockData?.subsector ?? null,
      value: h.liveValue,
      invested: h.amt_invested,
      gain: h.liveGain,
    }));
    return buildHoldingsBreakdown(items);
  }, [enrichedHoldings]);

  // Derive donut slices in a memo keyed on result.sectors
  const donutSlices = useMemo(
    () => topSectorsWithOther(result.sectors, 6),
    [result.sectors],
  );

  // Map sector key → palette index (0-based) for identity accent
  const sectorColorIndex = useMemo(() => {
    const map = new Map<string, number>();
    donutSlices.forEach((s, i) => {
      if (!s.isOther) map.set(s.key, i);
    });
    return map;
  }, [donutSlices]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) =>
    setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  const { summary, total } = result;

  if (!enrichedHoldings.length) {
    return (
      <div style={{ color: "var(--color-text-muted)", padding: "1rem" }}>
        No holdings to break down.
      </div>
    );
  }

  const totalPnlPct = total.gainPct;
  const totalPnlClass = total.gain >= 0 ? "kpi-positive" : "kpi-negative";

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Card 1: Summary + Composition ─────────────────────────────────── */}
      <div className="metric-card">
        <SectionHeading>Sector Allocation</SectionHeading>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "start" }}>

          {/* Left: KPI strip (pattern from SegmentsTab.tsx:119-136) */}
          <div className="kpi-grid">
            <div
              className={`kpi-card ${summary.maxSectorPct >= SECTOR_CONCENTRATED_PCT ? "kpi-warning" : "kpi-accent"}`}
            >
              <p
                className="uppercase tracking-wide font-medium"
                style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}
              >
                Top sector
              </p>
              <p
                className="font-bold mt-1"
                style={{ ...MONO, fontSize: "var(--text-xl)", color: "var(--color-text-primary)" }}
              >
                {summary.maxSectorPct.toFixed(1)}%
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", marginTop: 2 }}>
                {summary.largestSector?.name ?? "—"}
              </p>
            </div>

            <div className="kpi-card kpi-accent">
              <p
                className="uppercase tracking-wide font-medium"
                style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}
              >
                Sectors
              </p>
              <p
                className="font-bold mt-1"
                style={{ fontSize: "var(--text-xl)", color: "var(--color-text-primary)" }}
              >
                {summary.sectorCount}
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", marginTop: 2 }}>
                active
              </p>
            </div>

            <div className="kpi-card kpi-accent">
              <p
                className="uppercase tracking-wide font-medium"
                style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}
              >
                Top 3 weight
              </p>
              <p
                className="font-bold mt-1"
                style={{ ...MONO, fontSize: "var(--text-xl)", color: "var(--color-text-primary)" }}
              >
                {summary.top3WeightPct.toFixed(1)}%
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", marginTop: 2 }}>
                of portfolio
              </p>
            </div>

            <div className={`kpi-card ${totalPnlClass}`}>
              <p
                className="uppercase tracking-wide font-medium"
                style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}
              >
                Total P&amp;L
              </p>
              <p
                className="font-bold mt-1"
                style={{ ...MONO, fontSize: "var(--text-xl)", color: ud(total.gain) }}
              >
                {cr(total.gain)}
              </p>
              <p style={{ ...MONO, fontSize: "var(--text-xs)", color: ud(total.gain), marginTop: 2 }}>
                {pctTxt(totalPnlPct)}
              </p>
            </div>
          </div>

          {/* Right: Donut chart */}
          <DonutChart slices={donutSlices} />
        </div>
      </div>

      {/* ── Card 2: Breakdown table ────────────────────────────────────────── */}
      <div className="metric-card">
        <SectionHeading>Breakdown</SectionHeading>
        <div style={{ overflowX: "auto" }}>
          <table
            className="data-table"
            style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Sector / Sub-sector / Holding</th>
                <th style={{ textAlign: "right" }}>Value</th>
                <th style={{ textAlign: "right" }}>Weight</th>
                <th style={{ textAlign: "right" }}>Invested</th>
                <th style={{ textAlign: "right" }}>P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {result.sectors.map((sec) => {
                const open = !collapsed[sec.sector];
                // Identity accent: top-6 palette color, else neutral border
                const colorIdx = sectorColorIndex.get(sec.sector);
                const accentColor =
                  colorIdx !== undefined
                    ? `var(--color-chart-${colorIdx + 1})`
                    : "var(--color-border)";

                return (
                  <Fragment key={sec.sector}>
                    {/* Sector header row */}
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => toggle(sec.sector)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(sec.sector);
                        }
                      }}
                      style={{
                        cursor: "pointer",
                        fontWeight: 600,
                        background: "rgba(127,127,127,0.06)",
                        borderTop: "1px solid var(--color-border)",
                        borderLeft: `3px solid ${accentColor}`,
                      }}
                    >
                      <td style={{ textAlign: "left", padding: "6px 8px" }}>
                        {open ? "▾" : "▸"} {sec.sector}
                      </td>
                      <td style={{ ...RIGHT_MONO }}>{cr(sec.value)}</td>
                      <td style={{ textAlign: "right", padding: "4px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                          <div
                            style={{
                              width: 60,
                              height: 4,
                              borderRadius: 2,
                              background: "var(--color-border)",
                              overflow: "hidden",
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(sec.weightPct, 100)}%`,
                                height: "100%",
                                background: "var(--color-text-secondary)",
                                borderRadius: 2,
                                transition: "width 0.3s",
                              }}
                            />
                          </div>
                          <ConcentrationLabel weightPct={sec.weightPct} />
                        </div>
                      </td>
                      <td style={{ ...RIGHT_MONO }}>{cr(sec.invested)}</td>
                      <td style={{ ...RIGHT_MONO, color: ud(sec.gain) }}>
                        {cr(sec.gain)} ({pctTxt(sec.gainPct)})
                      </td>
                    </tr>

                    {open &&
                      sec.subsectors.map((sub) => (
                        <Fragment key={sec.sector + "|" + sub.subsector}>
                          {/* Sub-sector row */}
                          <tr style={{ color: "var(--color-text-secondary)" }}>
                            <td style={{ textAlign: "left", padding: "4px 8px 4px 24px", fontWeight: 500 }}>
                              {sub.subsector || "Other"}
                            </td>
                            <td style={{ ...RIGHT_MONO }}>{cr(sub.value)}</td>
                            <td style={{ ...RIGHT }}>
                              <WeightBar pct={sub.weightPct} />
                            </td>
                            <td style={{ ...RIGHT_MONO }}>{cr(sub.invested)}</td>
                            <td style={{ ...RIGHT_MONO, color: ud(sub.gain) }}>
                              {cr(sub.gain)} ({pctTxt(sub.gainPct)})
                            </td>
                          </tr>

                          {/* Individual line rows */}
                          {sub.lines.map((ln, i) => (
                            <tr
                              key={
                                sec.sector +
                                "|" +
                                sub.subsector +
                                "|" +
                                (ln.tikr ?? ln.assetName) +
                                "|" +
                                i
                              }
                              style={{ fontSize: "var(--text-xs)" }}
                            >
                              <td
                                style={{
                                  textAlign: "left",
                                  padding: "3px 8px 3px 40px",
                                  color: "var(--color-text-primary)",
                                }}
                              >
                                {ln.assetName}
                              </td>
                              <td style={{ ...RIGHT_MONO }}>{cr(ln.value)}</td>
                              <td style={{ ...RIGHT_MONO, color: "var(--color-text-muted)" }}>
                                {ln.weightPct.toFixed(1)}%
                              </td>
                              <td style={{ ...RIGHT_MONO }}>{cr(ln.invested)}</td>
                              <td style={{ ...RIGHT_MONO, color: ud(ln.gain) }}>
                                {cr(ln.gain)} ({pctTxt(ln.gainPct)})
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                  </Fragment>
                );
              })}

              {/* Elevated Total row */}
              <tr
                style={{
                  borderTop: "2px solid var(--color-border)",
                  fontWeight: 700,
                  background: "rgba(127,127,127,0.06)",
                }}
              >
                <td style={{ textAlign: "left", padding: "8px" }}>Total</td>
                <td style={{ ...RIGHT_MONO, padding: "8px" }}>{cr(total.value)}</td>
                <td style={{ ...RIGHT, padding: "8px" }}>
                  {/* Full-width 100% neutral bar */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                    <div
                      style={{
                        width: 60,
                        height: 4,
                        borderRadius: 2,
                        background: "var(--color-border)",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background: "var(--color-text-secondary)",
                          borderRadius: 2,
                        }}
                      />
                    </div>
                    <span style={{ ...MONO, minWidth: 40, textAlign: "right" }}>100.0%</span>
                  </div>
                </td>
                <td style={{ ...RIGHT_MONO, padding: "8px" }}>{cr(total.invested)}</td>
                <td style={{ ...RIGHT_MONO, padding: "8px", color: ud(total.gain) }}>
                  {cr(total.gain)} ({pctTxt(total.gainPct)})
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footnotes */}
        <p style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          ⚠ = sector weight ≥{SECTOR_CONCENTRATED_PCT}% (concentrated).
          {" "}⚠ Dom. = ≥{SECTOR_DOMINANT_PCT}% (dominant — consider rebalancing).
          {result.unclassifiedCount > 0 &&
            ` ${result.unclassifiedCount} holding(s) could not be matched to a sector — shown under "Unclassified".`}
        </p>
      </div>
    </div>
  );
}
