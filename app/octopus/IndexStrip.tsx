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

// COMPACT density. app/globals.css (.ox-* classes) is frozen, so we keep the classes
// (for the data-dir green/red wash, ox-pos/ox-neg colors, and mono/tabular numerals)
// and override only sizing/spacing via inline styles — inline beats the class. The goal
// is a ~1/3-screen strip so the 100vh grid's `1fr` body (the stock table) fills the rest.
const STRIP: CSSProperties = { gap: 5, paddingBottom: 5 };
const GROUP: CSSProperties = { display: "flex", flexDirection: "column", gap: 1 };
const CAPTION: CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  fontWeight: 700,
  color: "var(--ox-ink-soft)",
  opacity: 0.5,
  lineHeight: 1.3,
  paddingLeft: 2,
};
const ROW_GAP = 4;
const CELL: CSSProperties = { padding: "2px 8px", gap: 0 };
const LABEL: CSSProperties = { fontSize: 9, letterSpacing: "0.06em", lineHeight: 1.3 };
const VALROW: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 4,
};
const VALUE: CSSProperties = { fontSize: 15, fontWeight: 600, lineHeight: 1.2, flex: 1, minWidth: 0 };
const PCT: CSSProperties = { fontSize: 11, fontWeight: 700, lineHeight: 1, flexShrink: 0 };
const ARROW: CSSProperties = { marginRight: 1, fontSize: "0.9em" };
const UNIT: CSSProperties = { fontSize: "0.62em", opacity: 0.55, marginLeft: 1, fontWeight: 500 };
const INR: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--ox-ink-soft)",
  lineHeight: 1.25,
};

function Pct({ dayPct }: { dayPct: number | null }) {
  return (
    <span className={`ox-index-pct ${pctClass(dayPct)}`} style={PCT}>
      <span style={ARROW}>{arrow(dayPct)}</span>
      {fmtPct(dayPct)}
    </span>
  );
}

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
      style={{ gridTemplateColumns: `repeat(${indices.length}, 1fr)`, gap: ROW_GAP }}
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
            style={CELL}
          >
            <div className="ox-index-label" style={LABEL}>{cfg.label}</div>
            <div style={VALROW}>
              <span className="ox-index-value" style={VALUE}>{fmtValue(t?.value ?? null)}</span>
              <Pct dayPct={dayPct} />
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
      style={{ gridTemplateColumns: `repeat(${commodities.length}, 1fr)`, gap: ROW_GAP }}
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
            style={CELL}
          >
            <div className="ox-index-label" style={LABEL}>{cfg.label}</div>
            <div style={VALROW}>
              <span className="ox-index-value" style={VALUE}>
                {fmtUsd(usd)}
                {usd != null ? <span style={UNIT}>{cfg.usdUnit}</span> : null}
              </span>
              <Pct dayPct={dayPct} />
            </div>
            <div className="ox-index-value" style={INR}>
              {fmtInr(inr)}
              {inr != null && cfg.inrUnit ? <span style={UNIT}>{cfg.inrUnit}</span> : null}
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
    <section className="ox-index-strip" style={STRIP} aria-label="NSE indices, macro & commodities">
      {OCTOPUS_STRIP_GROUPS.map((g) => (
        <div key={g.label} style={GROUP}>
          <div style={CAPTION}>{g.label}</div>
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
