"use client";

import { useMemo, useState, Fragment } from "react";
import {
  getSebiSegment,
  SEBI_LABELS,
  SEBI_THRESHOLDS,
  SEGMENT_ORDER,
  type SebiSegment,
} from "@/lib/sebi";
import type { EnrichedStock, EnrichedHolding } from "./DashboardClient";

interface QuoteData { marketCap?: number | null; price: number; }

interface SegmentsTabProps {
  enrichedStocks: EnrichedStock[];
  enrichedHoldings: EnrichedHolding[];
  quotes: Record<string, QuoteData>;
}

type BucketKey = SebiSegment | "unclassified";

interface SegmentBucket {
  key: BucketKey;
  holdings: EnrichedHolding[];
  totalValue: number;
  totalCost: number;
  totalGain: number;
  modelStocks: EnrichedStock[];
}

function getHoldingSegment(h: EnrichedHolding, quotes: Record<string, QuoteData>): SebiSegment | null {
  if (h.stockData?.sebiSegment) return h.stockData.sebiSegment;
  if (h.tikr) return getSebiSegment(quotes[h.tikr]?.marketCap ?? null);
  return null;
}

function fmtRs(n: number): string {
  const lakhs = n / 100_000;
  if (Math.abs(lakhs) >= 100) return `₹${(lakhs / 100).toFixed(1)} Cr`;
  return `₹${lakhs.toFixed(0)}L`;
}

function fmtPnl(n: number): string {
  return `${n >= 0 ? "+" : ""}${fmtRs(n)}`;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      marginBottom: 14,
      fontWeight: 700,
      fontSize: "var(--text-base)",
      color: "var(--color-text-primary)",
      paddingLeft: 10,
      borderLeft: "3px solid var(--color-warning)",
    }}>
      {children}
    </h3>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SegmentsTab({ enrichedStocks, enrichedHoldings, quotes }: SegmentsTabProps) {
  const { buckets, totalPortfolioValue, modelStocks } = useMemo(() => {
    const model = enrichedStocks.filter(s => (s.base_current ?? 0) > 0);
    const raw: Record<BucketKey, EnrichedHolding[]> = {
      large: [], mid: [], small: [], micro: [], unclassified: [],
    };
    for (const h of enrichedHoldings) {
      const seg = getHoldingSegment(h, quotes);
      raw[seg ?? "unclassified"].push(h);
    }
    const allKeys: BucketKey[] = [...SEGMENT_ORDER, "unclassified"];
    const buckets: Record<BucketKey, SegmentBucket> = {} as Record<BucketKey, SegmentBucket>;
    for (const key of allKeys) {
      const holdings = raw[key];
      buckets[key] = {
        key,
        holdings,
        totalValue: holdings.reduce((s, h) => s + h.liveValue, 0),
        totalCost:  holdings.reduce((s, h) => s + h.amt_invested, 0),
        totalGain:  holdings.reduce((s, h) => s + h.liveGain, 0),
        modelStocks: key === "unclassified" ? [] : model.filter(s => s.sebiSegment === key),
      };
    }
    return {
      buckets,
      totalPortfolioValue: enrichedHoldings.reduce((s, h) => s + h.liveValue, 0),
      modelStocks: model,
    };
  }, [enrichedStocks, enrichedHoldings, quotes]);

  return (
    <div id="panel-segments" role="tabpanel" aria-labelledby="tab-segments" className="animate-fade-in"
      style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SegmentKPIs buckets={buckets} total={totalPortfolioValue} />
      <AllocationSummary buckets={buckets} total={totalPortfolioValue} />
      <ConcentrationRisk buckets={buckets} />
      <SegmentPnL buckets={buckets} />
      <ModelGapAnalysis buckets={buckets} modelStocks={modelStocks} enrichedHoldings={enrichedHoldings} total={totalPortfolioValue} />
      <SegmentCharts buckets={buckets} modelStocks={modelStocks} total={totalPortfolioValue} />
    </div>
  );
}

// ── KPI summary strip ──────────────────────────────────────────────────────────

function SegmentKPIs({ buckets, total }: { buckets: Record<BucketKey, SegmentBucket>; total: number }) {
  return (
    <div className="kpi-grid">
      {SEGMENT_ORDER.map(key => {
        const b = buckets[key];
        if (b.holdings.length === 0) return null;
        const weight  = total > 0 ? (b.totalValue / total) * 100 : 0;
        const gainPct = b.totalCost > 0 ? (b.totalGain / b.totalCost) * 100 : 0;
        const color   = `var(--color-segment-${key})`;
        return (
          <div key={key} className="kpi-card" style={{ borderTop: `3px solid ${color}` }}>
            <p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color }}>
              {SEBI_LABELS[key]}
            </p>
            <p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
              {weight.toFixed(1)}%
            </p>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              {b.holdings.length} stock{b.holdings.length !== 1 ? "s" : ""}
            </p>
            <p style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", color: gainPct >= 0 ? "var(--color-positive)" : "var(--color-negative)", marginTop: 2 }}>
              {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}% P&L
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Allocation Summary ─────────────────────────────────────────────────────────

function AllocationSummary({ buckets, total }: { buckets: Record<BucketKey, SegmentBucket>; total: number }) {
  const [expanded, setExpanded] = useState<Set<BucketKey>>(new Set());
  const allKeys: BucketKey[] = [...SEGMENT_ORDER, "unclassified"];
  const totalCount = allKeys.reduce((s, k) => s + buckets[k].holdings.length, 0);

  function toggle(key: BucketKey) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="metric-card">
      <SectionHeading>Allocation</SectionHeading>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table w-full">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Segment</th>
              <th style={{ textAlign: "right" }}>Threshold</th>
              <th style={{ textAlign: "right" }}>Stocks</th>
              <th style={{ textAlign: "right" }}>Value</th>
              <th style={{ textAlign: "right", minWidth: 130 }}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {allKeys.map(key => {
              const b        = buckets[key];
              const weight   = total > 0 ? (b.totalValue / total) * 100 : 0;
              const label    = key === "unclassified" ? "Unclassified" : SEBI_LABELS[key as SebiSegment];
              const color    = key === "unclassified" ? "var(--color-segment-unclassified)" : `var(--color-segment-${key})`;
              const isOpen   = expanded.has(key);
              const hasHoldings = b.holdings.length > 0;
              const sorted   = [...b.holdings].sort((a, c) => c.liveValue - a.liveValue);
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => hasHoldings && toggle(key)}
                    style={{ cursor: hasHoldings ? "pointer" : "default" }}
                  >
                    <td style={{ fontWeight: 600 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        {label}
                        {key === "micro" && <sup style={{ color: "var(--color-text-secondary)", fontSize: "0.6rem" }}>*</sup>}
                        {hasHoldings && (
                          <span style={{ fontSize: "0.6rem", color: "var(--color-text-muted)", marginLeft: 2, lineHeight: 1 }}>
                            {isOpen ? "▲" : "▼"}
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>
                      {key === "unclassified" ? "Market cap unavailable" : SEBI_THRESHOLDS[key as SebiSegment]}
                    </td>
                    <td style={{ textAlign: "right" }}>{b.holdings.length}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmtRs(b.totalValue)}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "var(--color-border)", overflow: "hidden", flexShrink: 0 }}>
                          <div style={{ width: `${Math.min(weight, 100)}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", minWidth: 40, textAlign: "right" }}>{weight.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} style={{ padding: 0, background: "var(--color-surface-secondary, rgba(0,0,0,0.15))" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <th style={{ textAlign: "left", padding: "6px 12px 6px 28px", color: "var(--color-text-muted)", fontWeight: 600 }}>Stock</th>
                              <th style={{ textAlign: "right", padding: "6px 12px", color: "var(--color-text-muted)", fontWeight: 600 }}>Value</th>
                              <th style={{ textAlign: "right", padding: "6px 12px", color: "var(--color-text-muted)", fontWeight: 600 }}>% of Seg</th>
                              <th style={{ textAlign: "right", padding: "6px 12px", color: "var(--color-text-muted)", fontWeight: 600 }}>P&amp;L (₹)</th>
                              <th style={{ textAlign: "right", padding: "6px 12px", color: "var(--color-text-muted)", fontWeight: 600 }}>P&amp;L %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sorted.map((h, i) => {
                              const segPct   = b.totalValue > 0 ? (h.liveValue / b.totalValue) * 100 : 0;
                              const pnlPct   = h.amt_invested > 0 ? (h.liveGain / h.amt_invested) * 100 : 0;
                              const pnlColor = h.liveGain >= 0 ? "var(--color-positive)" : "var(--color-negative)";
                              return (
                                <tr key={h.tikr ?? i} style={{ borderBottom: "1px solid var(--color-border-subtle, rgba(255,255,255,0.04))" }}>
                                  <td style={{ padding: "5px 12px 5px 28px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                                    {h.asset_name || h.tikr || "—"}
                                  </td>
                                  <td style={{ textAlign: "right", padding: "5px 12px", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
                                    {fmtRs(h.liveValue)}
                                  </td>
                                  <td style={{ textAlign: "right", padding: "5px 12px", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                                    {segPct.toFixed(1)}%
                                  </td>
                                  <td style={{ textAlign: "right", padding: "5px 12px", fontFamily: "var(--font-mono)", color: pnlColor }}>
                                    {fmtPnl(h.liveGain)}
                                  </td>
                                  <td style={{ textAlign: "right", padding: "5px 12px", fontFamily: "var(--font-mono)", color: pnlColor }}>
                                    {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            <tr style={{ fontWeight: 700, borderTop: "2px solid var(--color-border)" }}>
              <td>Total</td>
              <td />
              <td style={{ textAlign: "right" }}>{totalCount}</td>
              <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmtRs(total)}</td>
              <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
        * Micro Cap (&lt; ₹500 Cr) is a market convention — not defined by SEBI circular SEBI/HO/IMD/DF3/CIR/P/2017/114. Market cap from Yahoo Finance (full, not free-float). Click a segment row to view holdings breakdown.
      </p>
    </div>
  );
}

// ── Concentration & Risk ───────────────────────────────────────────────────────

function ConcentrationRisk({ buckets }: { buckets: Record<BucketKey, SegmentBucket> }) {
  return (
    <div className="metric-card">
      <SectionHeading>Concentration &amp; Risk</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {SEGMENT_ORDER.map(key => {
          const b = buckets[key];
          if (b.holdings.length === 0) return null;
          const top3  = [...b.holdings].sort((a, c) => c.liveValue - a.liveValue).slice(0, 3);
          const color = `var(--color-segment-${key})`;
          return (
            <div key={key} style={{ border: "1px solid var(--color-border)", borderTop: `3px solid ${color}`, borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, color }}>
                {SEBI_LABELS[key]} — {b.holdings.length} stock{b.holdings.length !== 1 ? "s" : ""}
              </div>
              {top3.map(h => {
                const pct          = b.totalValue > 0 ? (h.liveValue / b.totalValue) * 100 : 0;
                const dominant     = pct > 50;
                const concentrated = pct > 10;
                return (
                  <div key={h.asset_name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--color-border)" }}>
                    <span style={{ fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "55%" }}>{h.asset_name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>
                      {fmtRs(h.liveValue)}
                      <span style={{ marginLeft: 6, color: dominant ? "var(--color-negative)" : concentrated ? "var(--color-warning)" : "var(--color-text-secondary)", fontWeight: dominant || concentrated ? 700 : 400 }}>
                        {pct.toFixed(0)}%{dominant ? " ⚠ Dom." : concentrated ? " ⚠" : ""}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
        ⚠ = &gt;10% of segment (concentrated). ⚠ Dom. = &gt;50% of segment (dominant).
      </p>
    </div>
  );
}

// ── Segment P&L ────────────────────────────────────────────────────────────────

function SegmentPnL({ buckets }: { buckets: Record<BucketKey, SegmentBucket> }) {
  return (
    <div className="metric-card">
      <SectionHeading>Segment P&amp;L</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {SEGMENT_ORDER.map(key => {
          const b       = buckets[key];
          if (b.holdings.length === 0) return null;
          const gainPct = b.totalCost > 0 ? (b.totalGain / b.totalCost) * 100 : 0;
          const sorted  = [...b.holdings].sort((a, c) => c.liveGainPct - a.liveGainPct);
          const best    = sorted[0];
          const worst   = sorted[sorted.length - 1];
          const isGain  = b.totalGain >= 0;
          const color   = `var(--color-segment-${key})`;
          return (
            <div key={key} style={{ border: "1px solid var(--color-border)", borderTop: `3px solid ${color}`, borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color }}>
                {SEBI_LABELS[key]}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>Unrealised P&amp;L</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "var(--text-sm)", color: isGain ? "var(--color-positive)" : "var(--color-negative)" }}>
                  {fmtPnl(b.totalGain)} ({gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%)
                </span>
              </div>
              {best && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", marginBottom: 2 }}>
                  Best: <strong style={{ color: "var(--color-positive)" }}>{best.asset_name}</strong>{" "}
                  {best.liveGainPct >= 0 ? "+" : ""}{best.liveGainPct.toFixed(1)}%
                </div>
              )}
              {worst && worst.asset_name !== best?.asset_name && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
                  Worst: <strong style={{ color: "var(--color-negative)" }}>{worst.asset_name}</strong>{" "}
                  {worst.liveGainPct >= 0 ? "+" : ""}{worst.liveGainPct.toFixed(1)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Model vs Holdings Gap ──────────────────────────────────────────────────────

function ModelGapAnalysis({ buckets, modelStocks, enrichedHoldings, total }: {
  buckets: Record<BucketKey, SegmentBucket>;
  modelStocks: EnrichedStock[];
  enrichedHoldings: EnrichedHolding[];
  total: number;
}) {
  const heldTikrs  = new Set(enrichedHoldings.map(h => h.tikr).filter(Boolean));
  const notHeld    = modelStocks.filter(s => !heldTikrs.has(s.tikr));
  const offModel   = enrichedHoldings.filter(h => !h.stockData || !((h.stockData.base_current ?? 0) > 0));
  const modelTotal = modelStocks.reduce((s, st) => s + (st.holding_cash_lakhs ?? 0), 0);

  return (
    <div className="metric-card">
      <SectionHeading>Model vs Holdings Gap</SectionHeading>

      <div style={{ overflowX: "auto", marginBottom: 24 }}>
        <table className="data-table w-full">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Segment</th>
              <th style={{ textAlign: "right" }}>Model</th>
              <th style={{ textAlign: "right" }}>Held</th>
              <th style={{ textAlign: "right" }}>Holdings %</th>
              <th style={{ textAlign: "right" }}>Model %</th>
              <th style={{ textAlign: "right" }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {SEGMENT_ORDER.map(key => {
              const b        = buckets[key];
              const modelSeg = modelStocks.filter(s => s.sebiSegment === key);
              const holdPct  = total > 0 ? (b.totalValue / total) * 100 : 0;
              const modelPct = modelTotal > 0
                ? (modelSeg.reduce((s, st) => s + (st.holding_cash_lakhs ?? 0), 0) / modelTotal) * 100
                : 0;
              const diff = holdPct - modelPct;
              return (
                <tr key={key}>
                  <td style={{ fontWeight: 600, color: `var(--color-segment-${key})` }}>{SEBI_LABELS[key]}</td>
                  <td style={{ textAlign: "right" }}>{modelSeg.length}</td>
                  <td style={{ textAlign: "right" }}>{b.holdings.length}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{holdPct.toFixed(1)}%</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{modelPct.toFixed(1)}%</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: diff > 2 ? "var(--color-positive)" : diff < -2 ? "var(--color-negative)" : "var(--color-text-secondary)" }}>
                    {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
          Model % uses <code>holding_cash_lakhs</code> as intended position weight. &ldquo;In model&rdquo; = <code>base_current &gt; 0</code>.
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: "var(--text-sm)" }}>
          In model but not held ({notHeld.length} stock{notHeld.length !== 1 ? "s" : ""})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {notHeld.length === 0
            ? <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>None — all model stocks are held.</span>
            : notHeld.map(s => (
              <span key={s.tikr} style={{ padding: "3px 10px", borderRadius: 20, fontSize: "var(--text-xs)", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}>
                {s.tikr}
                {s.sebiSegment && <span style={{ marginLeft: 5, color: `var(--color-segment-${s.sebiSegment})` }}>{SEBI_LABELS[s.sebiSegment]}</span>}
              </span>
            ))}
        </div>
      </div>

      {offModel.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: "var(--text-sm)", color: "var(--color-warning)" }}>
            Off-model positions ({offModel.length} — held but not in Octopus model)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {offModel.map(h => (
              <span key={h.asset_name} style={{ padding: "3px 10px", borderRadius: 20, fontSize: "var(--text-xs)", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)" }}>
                {h.asset_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Segment Charts ─────────────────────────────────────────────────────────────

function SegmentCharts({ buckets, modelStocks, total }: {
  buckets: Record<BucketKey, SegmentBucket>;
  modelStocks: EnrichedStock[];
  total: number;
}) {
  const donutSlices = SEGMENT_ORDER
    .map(key => ({ key, value: buckets[key].totalValue }))
    .filter(d => d.value > 0);
  const donutTotal = donutSlices.reduce((s, d) => s + d.value, 0);

  const cx = 80, cy = 80, R = 62, rInner = 38;
  function arcPath(sa: number, ea: number): string {
    const x1 = cx + R * Math.cos(sa),      y1 = cy + R * Math.sin(sa);
    const x2 = cx + R * Math.cos(ea),      y2 = cy + R * Math.sin(ea);
    const x3 = cx + rInner * Math.cos(ea), y3 = cy + rInner * Math.sin(ea);
    const x4 = cx + rInner * Math.cos(sa), y4 = cy + rInner * Math.sin(sa);
    const lg = (ea - sa) > Math.PI ? 1 : 0;
    return `M${x1},${y1} A${R},${R} 0 ${lg},1 ${x2},${y2} L${x3},${y3} A${rInner},${rInner} 0 ${lg},0 ${x4},${y4}Z`;
  }
  let angle = -Math.PI / 2;
  const paths = donutSlices.map(d => {
    const sweep = donutTotal > 0 ? (d.value / donutTotal) * 2 * Math.PI : 0;
    const path  = arcPath(angle, angle + sweep);
    angle += sweep;
    return { ...d, path };
  });

  const modelTotal = modelStocks.reduce((s, st) => s + (st.holding_cash_lakhs ?? 0), 0);
  const bars: Array<{ key: SebiSegment; holdPct: number; modelPct: number }> = SEGMENT_ORDER.map(key => ({
    key,
    holdPct:  total > 0 ? (buckets[key].totalValue / total) * 100 : 0,
    modelPct: modelTotal > 0
      ? (modelStocks.filter(s => s.sebiSegment === key).reduce((s, st) => s + (st.holding_cash_lakhs ?? 0), 0) / modelTotal) * 100
      : 0,
  }));
  const maxPct = Math.max(...bars.flatMap(b => [b.holdPct, b.modelPct]), 10);
  const BAR_H  = 100;
  const BAR_Y0 = 115;

  return (
    <div className="metric-card">
      <SectionHeading>Allocation Charts</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            Holdings by Segment
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg viewBox="0 0 160 160" style={{ width: 140, height: 140, flexShrink: 0 }}>
              {paths.map(p => (
                <path key={p.key} d={p.path} fill={`var(--color-segment-${p.key})`} />
              ))}
              {donutSlices.length === 0 && (
                <circle cx={cx} cy={cy} r={R} fill="var(--color-bg-elevated)" />
              )}
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {SEGMENT_ORDER.map(key => {
                const b   = buckets[key];
                const pct = total > 0 ? (b.totalValue / total) * 100 : 0;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: `var(--color-segment-${key})`, display: "inline-block", flexShrink: 0 }} />
                    <span>{SEBI_LABELS[key]}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            Holdings vs Model
          </div>
          <svg viewBox="0 0 240 140" style={{ width: "100%", maxWidth: 280 }}>
            {bars.map((b, i) => {
              const x  = 28 + i * 52;
              const hh = Math.max(1, (b.holdPct  / maxPct) * BAR_H);
              const mh = Math.max(1, (b.modelPct / maxPct) * BAR_H);
              return (
                <g key={b.key}>
                  <rect x={x}      y={BAR_Y0 - hh} width={20} height={hh} fill={`var(--color-segment-${b.key})`} opacity={0.9} rx={2} />
                  <rect x={x + 22} y={BAR_Y0 - mh} width={20} height={mh} fill={`var(--color-segment-${b.key})`} opacity={0.3} rx={2} />
                  <text x={x + 21} y={BAR_Y0 + 12} textAnchor="middle" fontSize="7" fill="var(--color-text-secondary)">
                    {SEBI_LABELS[b.key].replace(" Cap", "")}
                  </text>
                </g>
              );
            })}
            {[0, 25, 50, 75].map(pct => {
              const y = BAR_Y0 - (pct / maxPct) * BAR_H;
              if (y < 4) return null;
              return (
                <g key={pct}>
                  <text x={24} y={y + 3} textAnchor="end" fontSize="7" fill="var(--color-text-secondary)">{pct}%</text>
                  <line x1={26} x2={234} y1={y} y2={y} stroke="var(--color-border)" strokeWidth={0.5} />
                </g>
              );
            })}
          </svg>
          <div style={{ display: "flex", gap: 14, fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", marginTop: 4 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 12, height: 10, background: "var(--color-segment-large)", borderRadius: 2, display: "inline-block" }} />
              Holdings
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 12, height: 10, background: "var(--color-segment-large)", opacity: 0.3, borderRadius: 2, display: "inline-block" }} />
              Model
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
