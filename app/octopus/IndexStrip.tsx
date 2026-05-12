"use client";

import { OCTOPUS_INDICES } from "@/lib/indices";

export interface IndexTick {
  label: string;
  value: number | null;
  dayPct: number | null;
}

function fmtValue(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtPct(p: number | null): string {
  if (p == null) return "—";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(2)}%`;
}

function pctClass(p: number | null): string {
  if (p == null) return "octopus-pct-flat";
  if (p > 0) return "octopus-pct-pos";
  if (p < 0) return "octopus-pct-neg";
  return "octopus-pct-flat";
}

export function IndexStrip({ ticks }: { ticks: IndexTick[] | null }) {
  // If feed hasn't loaded yet, render label-only skeleton tiles so the layout doesn't reflow.
  const lookup = new Map<string, IndexTick>();
  for (const t of ticks ?? []) lookup.set(t.label, t);

  return (
    <div className="octopus-index-strip">
      {OCTOPUS_INDICES.map((cfg) => {
        const t = lookup.get(cfg.label);
        return (
          <div key={cfg.label} className="octopus-index-tile">
            <span className="octopus-index-label">{cfg.label}</span>
            <div className="octopus-index-row">
              <span className="octopus-index-value">{fmtValue(t?.value ?? null)}</span>
              <span className={`octopus-index-pct ${pctClass(t?.dayPct ?? null)}`}>
                {fmtPct(t?.dayPct ?? null)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
