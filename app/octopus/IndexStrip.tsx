"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  OCTOPUS_STRIP_GROUPS,
  type IndexSymbol,
  type CommoditySymbol,
} from "@/lib/indices";
import type { StripDensity } from "./Header";

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
// spine, and movers (+/-2%) get a brutalist black outline. The `density` prop swaps the
// cell between a comfortable 3-line stack and a compact 2-line (value + change inline).
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
const ARROW: CSSProperties = { marginRight: 1, fontSize: "0.85em" };
const UNIT: CSSProperties = { fontSize: "0.62em", opacity: 0.55, marginLeft: 1, fontWeight: 500 };

interface CellStyles {
  cellBase: CSSProperties;
  label: CSSProperties;
  value: CSSProperties;
  pct: CSSProperties;
  inr: CSSProperties;
  line: CSSProperties;
}

function styles(density: StripDensity): CellStyles {
  const compact = density === "compact";
  return {
    cellBase: {
      border: "none",
      borderRadius: 0,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      gap: compact ? 1 : 2,
      padding: compact
        ? "2px clamp(8px, 0.7vw, 12px) 3px"
        : "clamp(4px, 0.45vh, 7px) clamp(8px, 0.7vw, 12px)",
    },
    label: {
      fontFamily: "var(--ox-font-mono)",
      letterSpacing: "0.06em",
      color: "rgba(27, 36, 52, 0.62)",
      lineHeight: 1.2,
      fontSize: compact ? "clamp(7.5px, 0.58vw, 9px)" : "clamp(8px, 0.62vw, 10px)",
    },
    value: {
      fontWeight: 700,
      letterSpacing: "-0.01em",
      lineHeight: compact ? 1.15 : 1.1,
      fontSize: compact ? "clamp(12px, 0.95vw, 15px)" : "clamp(14px, 1.2vw, 20px)",
    },
    pct: {
      fontWeight: 700,
      lineHeight: compact ? 1.15 : 1,
      fontSize: compact ? "clamp(9px, 0.8vw, 12px)" : "clamp(10px, 0.85vw, 13px)",
    },
    inr: {
      fontFamily: "var(--ox-font-mono)",
      fontWeight: 600,
      color: "rgba(27, 36, 52, 0.6)",
      lineHeight: 1.25,
      fontSize: compact ? "clamp(8px, 0.62vw, 10px)" : "clamp(9px, 0.7vw, 11px)",
    },
    line: { display: "flex", alignItems: "baseline", gap: 6 },
  };
}

function cellStyle(base: CSSProperties, dayPct: number | null): CSSProperties {
  return {
    ...base,
    background: heat(dayPct),
    ...(isMover(dayPct) ? { boxShadow: `inset 0 0 0 2px ${INK}` } : null),
  };
}

function Pct({ dayPct, style }: { dayPct: number | null; style: CSSProperties }) {
  return (
    <span className={`ox-index-pct ${pctClass(dayPct)}`} style={style}>
      <span style={ARROW}>{arrow(dayPct)}</span>
      {fmtPct(dayPct)}
    </span>
  );
}

function Cell({
  label,
  value,
  dayPct,
  inr,
  density,
  st,
}: {
  label: string;
  value: ReactNode;
  dayPct: number | null;
  inr: ReactNode | null;
  density: StripDensity;
  st: CellStyles;
}) {
  const valEl = <span className="ox-index-value" style={st.value}>{value}</span>;
  const pctEl = <Pct dayPct={dayPct} style={st.pct} />;
  return (
    <div className="ox-index-cell" style={cellStyle(st.cellBase, dayPct)}>
      <div className="ox-index-label" style={st.label}>{label}</div>
      {density === "compact" ? (
        <div style={st.line}>{valEl}{pctEl}</div>
      ) : (
        <>{valEl}{pctEl}</>
      )}
      {inr != null ? <div className="ox-index-value" style={st.inr}>{inr}</div> : null}
    </div>
  );
}

function IndexRow({
  indices,
  lookup,
  density,
  st,
}: {
  indices: IndexSymbol[];
  lookup: Map<string, IndexTick>;
  density: StripDensity;
  st: CellStyles;
}) {
  return (
    <div className="ox-index-row" style={{ ...ROW, gridTemplateColumns: `repeat(${indices.length}, 1fr)` }}>
      {indices.map((cfg) => {
        const t = lookup.get(cfg.label);
        return (
          <Cell
            key={cfg.label}
            label={cfg.label}
            value={fmtValue(t?.value ?? null)}
            dayPct={t?.dayPct ?? null}
            inr={null}
            density={density}
            st={st}
          />
        );
      })}
    </div>
  );
}

function CommodityRow({
  commodities,
  lookup,
  density,
  st,
}: {
  commodities: CommoditySymbol[];
  lookup: Map<string, IndexTick>;
  density: StripDensity;
  st: CellStyles;
}) {
  return (
    <div className="ox-index-row" style={{ ...ROW, gridTemplateColumns: `repeat(${commodities.length}, 1fr)` }}>
      {commodities.map((cfg) => {
        const t = lookup.get(cfg.label);
        const usd = t?.value ?? null;
        const inrVal = t?.inr ?? null;
        const value = (
          <>
            {fmtUsd(usd)}
            {usd != null ? <span style={UNIT}>{cfg.usdUnit}</span> : null}
          </>
        );
        const inr =
          inrVal != null ? (
            <>
              {fmtInr(inrVal)}
              {cfg.inrUnit ? <span style={UNIT}>{cfg.inrUnit}</span> : null}
            </>
          ) : null;
        return (
          <Cell
            key={cfg.label}
            label={cfg.label}
            value={value}
            dayPct={t?.dayPct ?? null}
            inr={inr}
            density={density}
            st={st}
          />
        );
      })}
    </div>
  );
}

export function IndexStrip({
  ticks,
  density = "comfortable",
}: {
  ticks: IndexTick[] | null;
  density?: StripDensity;
}) {
  const lookup = new Map<string, IndexTick>();
  for (const t of ticks ?? []) lookup.set(t.label, t);
  const st = styles(density);

  return (
    <section className="ox-index-strip" style={STRIP} aria-label="NSE indices, macro & commodities">
      {OCTOPUS_STRIP_GROUPS.map((g) => (
        <div key={g.label} style={GROUP}>
          <div style={SPINE}>{g.label}</div>
          {g.kind === "index" ? (
            <IndexRow indices={g.indices} lookup={lookup} density={density} st={st} />
          ) : (
            <CommodityRow commodities={g.commodities} lookup={lookup} density={density} st={st} />
          )}
        </div>
      ))}
    </section>
  );
}
