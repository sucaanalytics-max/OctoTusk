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

// |day %| >= this => flagged as a big mover (mirrors the dashboard's +/-2% band toggle).
const MOVER_BAND = 2;

function isMover(p: number | null): boolean {
  return p != null && Math.abs(p) >= MOVER_BAND;
}

// Heatmap tint: hue fixed by direction, saturation + lightness scaled by |day %|
// (capped at the mover band). Null renders as neutral paper, zero as canvas, so a
// "no signal" cell reads quiet against the brutalist black grid.
function heat(p: number | null): string {
  if (p == null) return "var(--ox-paper)";
  if (p === 0) return "#FAF8F4";
  const t = Math.min(1, Math.abs(p) / MOVER_BAND);
  const hue = p > 0 ? 147 : 6;
  const sat = Math.round(26 + t * 46);
  const light = Math.round(96 - t * 30);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

// ── "Heatmap Brutalism" skin ───────────────────────────────────────────────
// app/globals.css (.ox-* classes) is frozen, so we keep the classes (mono tabular
// numerals, ox-pos/ox-neg colors) and override only structure/skin via inline styles
// — inline beats the class. The board is a hard black grid: every gap is a 1px black
// hairline, cells carry a magnitude-scaled heatmap tint, section labels live in a left
// spine, and movers (+/-2%) get a brutalist black outline.
const INK = "#1B2434";

const STRIP: CSSProperties = {
  background: INK,
  gap: 1,
  padding: 0,
  border: `2px solid ${INK}`,
  borderRadius: 0,
};

const GROUP: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "clamp(82px, 8vw, 120px) 1fr",
  columnGap: 1,
  background: INK,
  alignItems: "stretch",
};

const SPINE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  textAlign: "right",
  padding: "0 clamp(6px, 0.6vw, 12px)",
  background: INK,
  color: "#FFFFFF",
  opacity: 0.85,
  fontFamily: "var(--ox-font-mono)",
  fontSize: "clamp(8px, 0.68vw, 10px)",
  letterSpacing: "0.1em",
  lineHeight: 1.2,
  textTransform: "uppercase",
  fontWeight: 600,
};

const ROW: CSSProperties = { gap: 1, background: INK };

const CELL: CSSProperties = {
  border: "none",
  borderRadius: 0,
  gap: 2,
  padding: "clamp(4px, 0.45vh, 7px) clamp(8px, 0.7vw, 12px)",
  overflow: "hidden",
};

const LABEL: CSSProperties = {
  fontFamily: "var(--ox-font-mono)",
  fontSize: "clamp(8px, 0.62vw, 10px)",
  letterSpacing: "0.06em",
  color: "rgba(27, 36, 52, 0.62)",
  lineHeight: 1.2,
};

const VALUE: CSSProperties = {
  fontSize: "clamp(14px, 1.2vw, 20px)",
  fontWeight: 700,
  lineHeight: 1.1,
};

const PCT: CSSProperties = {
  fontSize: "clamp(10px, 0.85vw, 13px)",
  fontWeight: 700,
  lineHeight: 1,
};

const ARROW: CSSProperties = { marginRight: 1, fontSize: "0.85em" };

const UNIT: CSSProperties = { fontSize: "0.62em", opacity: 0.55, marginLeft: 1, fontWeight: 500 };

const INR: CSSProperties = {
  fontFamily: "var(--ox-font-mono)",
  fontSize: "clamp(9px, 0.7vw, 11px)",
  fontWeight: 600,
  color: "rgba(27, 36, 52, 0.6)",
  lineHeight: 1.25,
};

function cellStyle(dayPct: number | null): CSSProperties {
  return {
    ...CELL,
    background: heat(dayPct),
    ...(isMover(dayPct) ? { boxShadow: `inset 0 0 0 2px ${INK}` } : null),
  };
}

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
}: {
  indices: IndexSymbol[];
  lookup: Map<string, IndexTick>;
}) {
  return (
    <div
      className="ox-index-row"
      style={{ ...ROW, gridTemplateColumns: `repeat(${indices.length}, 1fr)` }}
    >
      {indices.map((cfg) => {
        const t = lookup.get(cfg.label);
        const dayPct = t?.dayPct ?? null;
        return (
          <div key={cfg.label} className="ox-index-cell" style={cellStyle(dayPct)}>
            <div className="ox-index-label" style={LABEL}>{cfg.label}</div>
            <span className="ox-index-value" style={VALUE}>{fmtValue(t?.value ?? null)}</span>
            <Pct dayPct={dayPct} />
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
      className="ox-index-row"
      style={{ ...ROW, gridTemplateColumns: `repeat(${commodities.length}, 1fr)` }}
    >
      {commodities.map((cfg) => {
        const t = lookup.get(cfg.label);
        const usd = t?.value ?? null;
        const inr = t?.inr ?? null;
        const dayPct = t?.dayPct ?? null;
        return (
          <div key={cfg.label} className="ox-index-cell" style={cellStyle(dayPct)}>
            <div className="ox-index-label" style={LABEL}>{cfg.label}</div>
            <span className="ox-index-value" style={VALUE}>
              {fmtUsd(usd)}
              {usd != null ? <span style={UNIT}>{cfg.usdUnit}</span> : null}
            </span>
            <Pct dayPct={dayPct} />
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
          <div style={SPINE}>{g.label}</div>
          {g.kind === "index" ? (
            <IndexRow indices={g.indices} lookup={lookup} />
          ) : (
            <CommodityRow commodities={g.commodities} lookup={lookup} />
          )}
        </div>
      ))}
    </section>
  );
}
