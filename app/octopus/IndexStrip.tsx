"use client";

import { OCTOPUS_INDICES_BROAD, OCTOPUS_INDICES_SECTOR, type IndexSymbol } from "@/lib/indices";

export interface IndexTick {
  label: string;
  value: number | null;
  dayPct: number | null;
}

function fmtValue(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
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

function Row({
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
        const dir = dayPct == null ? "flat" : dayPct > 0 ? "up" : dayPct < 0 ? "down" : "flat";
        return (
          <div
            key={cfg.label}
            className="ox-index-cell"
            data-leading={i === 0 || undefined}
            data-dir={dir}
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

export function IndexStrip({ ticks }: { ticks: IndexTick[] | null }) {
  const lookup = new Map<string, IndexTick>();
  for (const t of ticks ?? []) lookup.set(t.label, t);

  return (
    <section className="ox-index-strip" aria-label="NSE indices and macro">
      <Row indices={OCTOPUS_INDICES_BROAD} lookup={lookup} variant="broad" />
      <Row indices={OCTOPUS_INDICES_SECTOR} lookup={lookup} variant="sector" />
    </section>
  );
}
