"use client";
import { Fragment, useMemo, useState } from "react";
import { buildHoldingsBreakdown, type BreakdownInput } from "@/lib/holdingsBreakdown";

// The subset of DashboardClient's enrichedHoldings element that this view needs.
export interface BreakdownHolding {
  asset_name: string;
  tikr?: string | null;
  liveValue: number;
  amt_invested: number;
  liveGain: number;
  stockData?: { sector?: string | null; subsector?: string | null; companyShort?: string | null } | null;
}

const cr = (n: number) => `₹${(n / 1e7).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
const pctTxt = (p: number | null) => (p == null ? "—" : `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`);
const ud = (n: number) => (n >= 0 ? "var(--color-positive)" : "var(--color-negative)");
const RIGHT = { textAlign: "right" as const, padding: "4px 8px" };

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

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  if (!enrichedHoldings.length) {
    return <div style={{ color: "var(--color-text-muted)", padding: "1rem" }}>No holdings to break down.</div>;
  }

  return (
    <div className="animate-fade-in">
      {result.unclassifiedCount > 0 && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 8 }}>
          {result.unclassifiedCount} holding(s) could not be matched to a sector — shown under "Unclassified".
        </div>
      )}
      <table className="w-full" style={{ borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
        <thead>
          <tr style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" }}>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Sector / Sub-sector / Holding</th>
            <th style={RIGHT}>Value</th>
            <th style={RIGHT}>Weight</th>
            <th style={RIGHT}>Invested</th>
            <th style={RIGHT}>P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {result.sectors.map((sec) => {
            const open = !collapsed[sec.sector];
            return (
              <Fragment key={sec.sector}>
                <tr
                  onClick={() => toggle(sec.sector)}
                  style={{ cursor: "pointer", fontWeight: 600, background: "rgba(127,127,127,0.06)", borderTop: "1px solid var(--color-border)" }}
                >
                  <td style={{ textAlign: "left", padding: "6px 8px" }}>{open ? "▾" : "▸"} {sec.sector}</td>
                  <td style={RIGHT}>{cr(sec.value)}</td>
                  <td style={RIGHT}>{sec.weightPct.toFixed(1)}%</td>
                  <td style={RIGHT}>{cr(sec.invested)}</td>
                  <td style={{ ...RIGHT, color: ud(sec.gain) }}>{cr(sec.gain)} ({pctTxt(sec.gainPct)})</td>
                </tr>
                {open &&
                  sec.subsectors.map((sub) => (
                    <Fragment key={sec.sector + "|" + sub.subsector}>
                      <tr style={{ color: "var(--color-text-secondary)" }}>
                        <td style={{ textAlign: "left", padding: "4px 8px 4px 24px", fontWeight: 500 }}>{sub.subsector || "Other"}</td>
                        <td style={RIGHT}>{cr(sub.value)}</td>
                        <td style={RIGHT}>{sub.weightPct.toFixed(1)}%</td>
                        <td style={RIGHT}>{cr(sub.invested)}</td>
                        <td style={{ ...RIGHT, color: ud(sub.gain) }}>{cr(sub.gain)} ({pctTxt(sub.gainPct)})</td>
                      </tr>
                      {sub.lines.map((ln) => (
                        <tr key={sec.sector + "|" + sub.subsector + "|" + ln.assetName} style={{ fontSize: "var(--text-xs)" }}>
                          <td style={{ textAlign: "left", padding: "3px 8px 3px 40px", color: "var(--color-text-primary)" }}>{ln.assetName}</td>
                          <td style={RIGHT}>{cr(ln.value)}</td>
                          <td style={{ ...RIGHT, color: "var(--color-text-muted)" }}>{ln.weightPct.toFixed(1)}%</td>
                          <td style={RIGHT}>{cr(ln.invested)}</td>
                          <td style={{ ...RIGHT, color: ud(ln.gain) }}>{cr(ln.gain)} ({pctTxt(ln.gainPct)})</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
              </Fragment>
            );
          })}
          <tr style={{ borderTop: "2px solid var(--color-border)", fontWeight: 700 }}>
            <td style={{ textAlign: "left", padding: "8px" }}>Total</td>
            <td style={{ ...RIGHT, padding: "8px" }}>{cr(result.total.value)}</td>
            <td style={{ ...RIGHT, padding: "8px" }}>100.0%</td>
            <td style={{ ...RIGHT, padding: "8px" }}>{cr(result.total.invested)}</td>
            <td style={{ ...RIGHT, padding: "8px", color: ud(result.total.gain) }}>{cr(result.total.gain)} ({pctTxt(result.total.gainPct)})</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
