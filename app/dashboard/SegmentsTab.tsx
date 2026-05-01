"use client";

import { useMemo } from "react";
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
  isUnlocked: boolean;
  onUnlockRequest: () => void;
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

// ── Main component ─────────────────────────────────────────────────────────────

export function SegmentsTab({ enrichedStocks, enrichedHoldings, quotes, isUnlocked, onUnlockRequest }: SegmentsTabProps) {
  if (!isUnlocked) {
    return (
      <div id="panel-segments" role="tabpanel" aria-labelledby="tab-segments" className="animate-fade-in"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 16 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontWeight: 600, fontSize: "var(--text-lg)" }}>Holdings PIN Required</div>
        <div style={{ color: "var(--color-text-secondary)", textAlign: "center", maxWidth: 360 }}>
          Segment analysis uses portfolio values and P&amp;L. Please unlock the Holdings tab first.
        </div>
        <button className="btn btn-primary" onClick={onUnlockRequest}>Go to Holdings</button>
      </div>
    );
  }

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
      style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* SEBI Disclaimer */}
      <div className="metric-card" style={{
        background: "var(--color-info-bg)", border: "1px solid rgba(79,142,247,0.25)",
        padding: "10px 14px", fontSize: "var(--text-sm)", color: "var(--color-text-secondary)",
      }}>
        <strong style={{ color: "var(--color-accent-blue)" }}>SEBI Classification</strong> per circular
        SEBI/HO/IMD/DF3/CIR/P/2017/114 — Large Cap: top 100 companies (≈ ≥ ₹20,000 Cr), Mid Cap: 101–250
        (₹5,000–₹20,000 Cr), Small Cap: 251+ (₹500–₹5,000 Cr).{" "}
        <strong>Micro Cap (&lt; ₹500 Cr) is market convention — not defined by SEBI.</strong> Market cap
        sourced from Yahoo Finance (full market cap, not free-float; NSE preferred, BSE fallback).
      </div>

      <AllocationSummary buckets={buckets} total={totalPortfolioValue} />
      <ConcentrationRisk buckets={buckets} />
      <SegmentPnL buckets={buckets} />
      <ModelGapAnalysis buckets={buckets} modelStocks={modelStocks} enrichedHoldings={enrichedHoldings} total={totalPortfolioValue} />
      <SegmentCharts buckets={buckets} modelStocks={modelStocks} total={totalPortfolioValue} />
    </div>
  );
}

// ── 4a: Allocation Summary ─────────────────────────────────────────────────────

function AllocationSummary({ buckets, total }: { buckets: Record<BucketKey, SegmentBucket>; total: number }) {
  const allKeys: BucketKey[] = [...SEGMENT_ORDER, "unclassified"];
  const totalCount = allKeys.reduce((s, k) => s + buckets[k].holdings.length, 0);
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 12, fontWeight: 700, fontSize: "var(--text-base)" }}>4a — Allocation Summary</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Segment</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Threshold</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Stocks</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Value</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {allKeys.map(key => {
              const b = buckets[key];
              const weight = total > 0 ? (b.totalValue / total) * 100 : 0;
              const label  = key === "unclassified" ? "Unclassified" : SEBI_LABELS[key as SebiSegment];
              const color  = key === "unclassified" ? "var(--color-segment-unclassified)" : `var(--color-segment-${key})`;
              return (
                <tr key={key} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px 8px", fontWeight: 600 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 8 }} />
                    {label}
                    {key === "micro" && <sup style={{ marginLeft: 4, color: "var(--color-text-secondary)", fontSize: "var(--text-xs)" }}>*</sup>}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px 8px", color: "var(--color-text-secondary)" }}>
                    {key === "unclassified" ? "Market cap unavailable" : SEBI_THRESHOLDS[key as SebiSegment]}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px 8px" }}>{b.holdings.length}</td>
                  <td style={{ textAlign: "right", padding: "8px 8px", fontFamily: "var(--font-mono)" }}>{fmtRs(b.totalValue)}</td>
                  <td style={{ textAlign: "right", padding: "8px 8px", fontFamily: "var(--font-mono)" }}>{weight.toFixed(1)}%</td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 700, borderTop: "2px solid var(--color-border)" }}>
              <td style={{ padding: "8px 8px" }}>Total</td>
              <td />
              <td style={{ textAlign: "right", padding: "8px 8px" }}>{totalCount}</td>
              <td style={{ textAlign: "right", padding: "8px 8px", fontFamily: "var(--font-mono)" }}>{fmtRs(total)}</td>
              <td style={{ textAlign: "right", padding: "8px 8px" }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
        * Micro Cap (&lt; ₹500 Cr) is a market convention threshold — not defined in SEBI circular SEBI/HO/IMD/DF3/CIR/P/2017/114.
      </p>
    </div>
  );
}

// ── 4b: Concentration & Risk ───────────────────────────────────────────────────

function ConcentrationRisk({ buckets }: { buckets: Record<BucketKey, SegmentBucket> }) {
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontWeight: 700, fontSize: "var(--text-base)" }}>4b — Concentration &amp; Risk</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {SEGMENT_ORDER.map(key => {
          const b = buckets[key];
          if (b.holdings.length === 0) return null;
          const top3 = [...b.holdings].sort((a, c) => c.liveValue - a.liveValue).slice(0, 3);
          return (
            <div key={key} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, color: `var(--color-segment-${key})` }}>
                {SEBI_LABELS[key]} — {b.holdings.length} stock{b.holdings.length !== 1 ? "s" : ""}
              </div>
              {top3.map(h => {
                const pct = b.totalValue > 0 ? (h.liveValue / b.totalValue) * 100 : 0;
                const dominant    = pct > 50;
                const concentrated = pct > 10;
                return (
                  <div key={h.asset_name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--color-border)" }}>
                    <span style={{ fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "55%" }}>{h.asset_name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>
                      {fmtRs(h.liveValue)}
                      <span style={{
                        marginLeft: 6,
                        color: dominant ? "var(--color-negative)" : concentrated ? "var(--color-warning)" : "var(--color-text-secondary)",
                        fontWeight: dominant || concentrated ? 700 : 400,
                      }}>
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
        ⚠ = &gt;10% of segment weight (concentrated). ⚠ Dom. = &gt;50% of segment weight (dominant position).
      </p>
    </div>
  );
}

// ── 4c: Segment P&L ────────────────────────────────────────────────────────────

function SegmentPnL({ buckets }: { buckets: Record<BucketKey, SegmentBucket> }) {
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontWeight: 700, fontSize: "var(--text-base)" }}>4c — Segment P&amp;L</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {SEGMENT_ORDER.map(key => {
          const b = buckets[key];
          if (b.holdings.length === 0) return null;
          const gainPct = b.totalCost > 0 ? (b.totalGain / b.totalCost) * 100 : 0;
          const sorted  = [...b.holdings].sort((a, c) => c.liveGainPct - a.liveGainPct);
          const best    = sorted[0];
          const worst   = sorted[sorted.length - 1];
          const isGain  = b.totalGain >= 0;
          return (
            <div key={key} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: `var(--color-segment-${key})` }}>
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

// ── 4d: Model vs Holdings Gap ──────────────────────────────────────────────────

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
      <h3 style={{ marginBottom: 16, fontWeight: 700, fontSize: "var(--text-base)" }}>4d — Model vs Holdings Gap</h3>

      <div style={{ overflowX: "auto", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Segment</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Model stocks</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Held stocks</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Holdings %</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Model %</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Δ</th>
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
                <tr key={key} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px 8px", fontWeight: 600, color: `var(--color-segment-${key})` }}>{SEBI_LABELS[key]}</td>
                  <td style={{ textAlign: "right", padding: "8px 8px" }}>{modelSeg.length}</td>
                  <td style={{ textAlign: "right", padding: "8px 8px" }}>{b.holdings.length}</td>
                  <td style={{ textAlign: "right", padding: "8px 8px", fontFamily: "var(--font-mono)" }}>{holdPct.toFixed(1)}%</td>
                  <td style={{ textAlign: "right", padding: "8px 8px", fontFamily: "var(--font-mono)" }}>{modelPct.toFixed(1)}%</td>
                  <td style={{
                    textAlign: "right", padding: "8px 8px", fontFamily: "var(--font-mono)", fontWeight: 700,
                    color: diff > 2 ? "var(--color-positive)" : diff < -2 ? "var(--color-negative)" : "var(--color-text-secondary)",
                  }}>
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

// ── 4e: Segment Charts ─────────────────────────────────────────────────────────

function SegmentCharts({ buckets, modelStocks, total }: {
  buckets: Record<BucketKey, SegmentBucket>;
  modelStocks: EnrichedStock[];
  total: number;
}) {
  // Donut data (holdings only, skip 0-value segments)
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
    const path = arcPath(angle, angle + sweep);
    angle += sweep;
    return { ...d, path };
  });

  // Bar chart: holdings % vs model %
  const modelTotal = modelStocks.reduce((s, st) => s + (st.holding_cash_lakhs ?? 0), 0);
  const bars: Array<{ key: SebiSegment; holdPct: number; modelPct: number }> = SEGMENT_ORDER.map(key => ({
    key,
    holdPct:  total > 0 ? (buckets[key].totalValue / total) * 100 : 0,
    modelPct: modelTotal > 0
      ? (modelStocks.filter(s => s.sebiSegment === key).reduce((s, st) => s + (st.holding_cash_lakhs ?? 0), 0) / modelTotal) * 100
      : 0,
  }));
  const maxPct  = Math.max(...bars.flatMap(b => [b.holdPct, b.modelPct]), 10);
  const BAR_H   = 100;
  const BAR_Y0  = 115;

  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontWeight: 700, fontSize: "var(--text-base)" }}>4e — Segment Charts</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>

        {/* Donut: Holdings by segment */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            Holdings Allocation by Segment
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
                const b = buckets[key];
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

        {/* Side-by-side bar: Holdings vs Model */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            Holdings vs Model Allocation
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
              Holdings (solid)
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 12, height: 10, background: "var(--color-segment-large)", opacity: 0.3, borderRadius: 2, display: "inline-block" }} />
              Model (muted)
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
