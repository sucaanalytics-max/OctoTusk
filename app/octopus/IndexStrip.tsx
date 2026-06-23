"use client";

import type { CSSProperties } from "react";
import {
  OCTOPUS_STRIP_GROUPS,
  type IndexSymbol,
  type CommoditySymbol,
} from "@/lib/indices";

export interface IndexTick {
  label: string;
  value: number | null; // index value, or commodity USD price
  dayPct: number | null; // index / commodity-USD day %
  // Commodity-only (omitted for plain indices):
  inr?: number | null;
  inrPct?: number | null;
  usdUnit?: string;
  inrUnit?: string | null;
}

function fmtValue(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtInr(v: number | null): string {
  if (v == null) return "—";
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtPct(p: number | null): string {
  if (p == null) return "—";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(2)}%`;
}

function pctClass(p: number | null): string {
  if (p == null) return "ox-flat";
  if (p > 0) return "ox-pos";
  if (p < 0) return "ox-neg";
  return "ox-flat";
}

function arrow(p: number | null): string {
  if (p == null) return "·";
  if (p > 0) return "▲";
  if (p < 0) return "▼";
  return "·";
}

function dirOf(p: number | null): "up" | "down" | "flat" {
  return p == null ? "flat" : p > 0 ? "up" : p < 0 ? "down" : "flat";
}

// Inline styles — app/globals.css (where .ox-* lives) is a frozen file, so the new
// commodity/caption styling is expressed here, consuming the octopus CSS tokens.
const GROUP_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "clamp(2px, 0.2vh, 4px)",
};
const CAPTION_STYLE: CSSProperties = {
  fontSize: "clamp(8px, 0.6vw, 10px)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  fontWeight: 700,
  color: "var(--ox-ink-soft)",
  opacity: 0.6,
  paddingLeft: 2,
};
const UNIT_STYLE: CSSProperties = { fontSize: "0.6em", opacity: 0.55, marginLeft: 1, fontWeight: 500 };
const INR_STYLE: CSSProperties = {
  fontSize: "clamp(11px, 0.9vw, 15px)",
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  color: "var(--ox-ink-soft)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  lineHeight: 1.1,
};

function IndexRow({
  indices,
  lookup,
  variant,
}: {
  indices: IndexSymbol[];
  lookup: Map<string, IndexTick>;
  variant: "broad" | "sector";
}) {
  return (
    <div
      className={`ox-index-row ox-index-row-${variant}`}
      style={{ gridTemplateColumns: `repeat(${indices.length}, 1fr)` }}
    >
      {indices.map((cfg, i) => {
        const t = lookup.get(cfg.label);
        const dayPct = t?.dayPct ?? null;
        return (
          <div
            key={cfg.label}
            className="ox-index-cell"
            data-leading={i === 0 || undefined}
            data-dir={dirOf(dayPct)}
          >
            <div className="ox-index-label">{cfg.label}</div>
            <div className="ox-index-value">{fmtValue(t?.value ?? null)}</div>
            <div className={`ox-index-pct ${pctClass(dayPct)}`}>
              <span className="ox-index-arrow">{arrow(dayPct)}</span>
              {fmtPct(dayPct)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommodityRow({
  commodities,
  lookup,
}: {
  commodities: CommoditySymbol[];
  lookup: Map<string, IndexTick>;
}) {
  return (
    <div
      className="ox-index-row ox-index-row-sector"
      style={{ gridTemplateColumns: `repeat(${commodities.length}, 1fr)` }}
    >
      {commodities.map((cfg, i) => {
        const t = lookup.get(cfg.label);
        const usd = t?.value ?? null;
        const inr = t?.inr ?? null;
        const dayPct = t?.dayPct ?? null;
        return (
          <div
            key={cfg.label}
            className="ox-index-cell"
            data-leading={i === 0 || undefined}
            data-dir={dirOf(dayPct)}
          >
            <div className="ox-index-label">{cfg.label}</div>
            <div className="ox-index-value">
              {fmtUsd(usd)}
              {usd != null ? <span style={UNIT_STYLE}>{cfg.usdUnit}</span> : null}
            </div>
            <div style={INR_STYLE}>
              {fmtInr(inr)}
              {inr != null && cfg.inrUnit ? <span style={UNIT_STYLE}>{cfg.inrUnit}</span> : null}
            </div>
            <div className={`ox-index-pct ${pctClass(dayPct)}`}>
              <span className="ox-index-arrow">{arrow(dayPct)}</span>
              {fmtPct(dayPct)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function IndexStrip({ ticks }: { ticks: IndexTick[] | null }) {
  const lookup = new Map<string, IndexTick>();
  for (const t of ticks ?? []) lookup.set(t.label, t);

  return (
    <section className="ox-index-strip" aria-label="NSE indices, macro & commodities">
      {OCTOPUS_STRIP_GROUPS.map((g) => (
        <div key={g.label} style={GROUP_STYLE}>
          <div style={CAPTION_STYLE}>{g.label}</div>
          {g.kind === "index" ? (
            <IndexRow indices={g.indices} lookup={lookup} variant={g.variant} />
          ) : (
            <CommodityRow commodities={g.commodities} lookup={lookup} />
          )}
        </div>
      ))}
    </section>
  );
}
