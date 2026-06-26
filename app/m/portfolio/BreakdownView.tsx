"use client";
import { useMemo, useState } from "react";
import {
  buildHoldingsBreakdown,
  topSectorsWithOther,
  SECTOR_CONCENTRATED_PCT,
  type BreakdownInput,
} from "@/lib/holdingsBreakdown";
import { UNCLASSIFIED } from "@/lib/sectors";
import { fmtMoney, fmtPctRaw } from "@/lib/format";

const GREY = "var(--color-segment-unclassified)";

export default function BreakdownView({ items }: { items: BreakdownInput[] }) {
  const result = useMemo(() => buildHoldingsBreakdown(items), [items]);
  // Composition slices (top-6 + grey "Other"), each pre-coloured by rank.
  const colored = useMemo(
    () =>
      topSectorsWithOther(result.sectors, 6).map((s, i) => ({
        ...s,
        color: s.isOther || s.key === UNCLASSIFIED ? GREY : `var(--color-chart-${i + 1})`,
      })),
    [result],
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  if (!items.length) return <div className="m-empty">No holdings to break down.</div>;

  const { summary, total } = result;
  // Sector → composition colour (head sectors keep their chart colour; tail/Unclassified are grey).
  const colorBySector = new Map(colored.filter((s) => !s.isOther).map((s) => [s.key, s.color]));
  const dotColor = (name: string) => colorBySector.get(name) ?? GREY;
  const other = colored.find((s) => s.isOther);
  const legend = other ? [...colored.slice(0, 3), other] : colored.slice(0, 3);
  const a11yLabel =
    "Sector allocation: " +
    legend.map((s) => `${s.key} ${s.weightPct.toFixed(0)}%`).join(", ");

  return (
    <div className="m-bd">
      {/* Summary header */}
      <div className="m-summary">
        <div className="m-sum-main">
          <span className="m-sum-label">Total value</span>
          <span className="m-sum-value">{fmtMoney(total.value)}</span>
          <span className={`m-delta ${total.gain >= 0 ? "is-up" : "is-down"}`}>
            {fmtMoney(total.gain)} ({fmtPctRaw(total.gainPct ?? null)})
          </span>
        </div>
        <div className="m-bd-sumgrid">
          <div className="m-metric">
            <span className="m-metric-label">Largest</span>
            <span
              className="m-metric-val"
              style={{ fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {summary.largestSector?.name ?? "—"}
            </span>
            <span className="m-metric-label">
              {summary.largestSector ? fmtPctRaw(summary.maxSectorPct) : ""}
            </span>
          </div>
          <div className="m-metric">
            <span className="m-metric-label">Sectors</span>
            <span className="m-metric-val">{summary.sectorCount}</span>
          </div>
          <div className="m-metric">
            <span className="m-metric-label">Top 3</span>
            <span className="m-metric-val">{fmtPctRaw(summary.top3WeightPct)}</span>
          </div>
        </div>
      </div>

      {/* Composition: stacked allocation bar + legend */}
      <div className="m-bd-stack" role="img" aria-label={a11yLabel}>
        {colored.map((s) => (
          <div
            key={s.key}
            className="m-bd-stack-seg"
            style={{ width: `${s.weightPct}%`, background: s.color }}
            title={`${s.key} ${s.weightPct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="m-bd-legend">
        {legend.map((s) => (
          <span key={s.key} className="m-bd-legend-item">
            <span className="m-bd-dot" style={{ background: s.color }} aria-hidden />
            {s.key}
            <span className="m-bd-legend-wt">{s.weightPct.toFixed(1)}%</span>
          </span>
        ))}
      </div>

      {result.unclassifiedCount > 0 && (
        <p className="m-count" style={{ textAlign: "left" }}>
          {result.unclassifiedCount} holding(s) unmatched — under &ldquo;Unclassified&rdquo;.
        </p>
      )}

      {/* Per-sector accordion */}
      {result.sectors.map((sec) => {
        const isOpen = !!open[sec.sector];
        const conc = sec.weightPct >= SECTOR_CONCENTRATED_PCT;
        const panelId = `m-bd-panel-${sec.sector.replace(/\W+/g, "-")}`;
        return (
          <div key={sec.sector} className="m-bd-sector">
            <button
              className="m-bd-headwrap"
              onClick={() => toggle(sec.sector)}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <div className="m-bd-toprow">
                <span className="m-bd-caret" aria-hidden>{isOpen ? "▾" : "▸"}</span>
                <span className="m-bd-dot" style={{ background: dotColor(sec.sector) }} aria-hidden />
                <span className="m-bd-name">{sec.sector}</span>
                <span className="m-bd-val">{fmtMoney(sec.value)}</span>
              </div>
              <div className="m-bd-bar">
                <span
                  className={`m-bd-bar-fill${conc ? " is-concentrated" : ""}`}
                  style={{ width: `${Math.min(sec.weightPct, 100)}%` }}
                />
              </div>
              <div className="m-bd-row2">
                <span className="m-bd-wt">{sec.weightPct.toFixed(1)}% weight</span>
                <span className={`m-bd-pnl ${sec.gain >= 0 ? "is-up" : "is-down"}`}>
                  {fmtMoney(sec.gain)} ({fmtPctRaw(sec.gainPct ?? null)})
                </span>
                {conc && <span className="m-bd-conc">⚠ concentrated</span>}
              </div>
            </button>
            {isOpen && (
              <div id={panelId} className="m-bd-panel">
                {sec.subsectors.map((sub) => (
                  <div key={sub.subsector} className="m-bd-subwrap">
                    <div className="m-bd-sub">
                      <span className="m-bd-sub-name">{sub.subsector || "Other"}</span>
                      <span className="m-bd-sub-val">
                        {fmtMoney(sub.value)} · {sub.weightPct.toFixed(1)}%
                      </span>
                    </div>
                    {sub.lines.map((ln, i) => (
                      <div key={(ln.tikr ?? ln.assetName) + "|" + i} className="m-bd-line">
                        <span className="m-bd-line-name">{ln.assetName}</span>
                        <span className="m-bd-line-val">{fmtMoney(ln.value)}</span>
                        <span className={`m-bd-line-pnl ${ln.gain >= 0 ? "is-up" : "is-down"}`}>
                          {fmtPctRaw(ln.gainPct ?? null)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Elevated total */}
      <div className="m-bd-total">
        <span>Total · {summary.sectorCount} sectors</span>
        <span>{fmtMoney(total.value)}</span>
        <span className={`m-bd-total-pnl ${total.gain >= 0 ? "is-up" : "is-down"}`}>
          {fmtMoney(total.gain)} ({fmtPctRaw(total.gainPct ?? null)}) · inv {fmtMoney(total.invested)}
        </span>
      </div>
    </div>
  );
}
