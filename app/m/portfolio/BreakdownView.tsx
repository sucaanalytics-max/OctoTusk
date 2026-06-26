"use client";
import { useMemo, useState } from "react";
import { buildHoldingsBreakdown, type BreakdownInput } from "@/lib/holdingsBreakdown";
import { fmtMoney, fmtPctRaw } from "@/lib/format";

export default function BreakdownView({ items }: { items: BreakdownInput[] }) {
  const result = useMemo(() => buildHoldingsBreakdown(items), [items]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  if (!items.length) return <div className="m-empty">No holdings to break down.</div>;

  return (
    <div className="m-bd">
      {result.unclassifiedCount > 0 && (
        <p className="m-count" style={{ textAlign: "left" }}>
          {result.unclassifiedCount} holding(s) unmatched — under "Unclassified".
        </p>
      )}
      {result.sectors.map((sec) => {
        const isOpen = !!open[sec.sector];
        return (
          <div key={sec.sector} className="m-bd-sector">
            <button className="m-bd-head" onClick={() => toggle(sec.sector)} aria-expanded={isOpen}>
              <span className="m-bd-caret" aria-hidden>{isOpen ? "▾" : "▸"}</span>
              <span className="m-bd-name">{sec.sector}</span>
              <span className="m-bd-wt">{sec.weightPct.toFixed(1)}%</span>
              <span className="m-bd-val">{fmtMoney(sec.value)}</span>
            </button>
            <div className={`m-bd-pnl ${sec.gain >= 0 ? "is-up" : "is-down"}`}>
              {fmtMoney(sec.gain)} ({fmtPctRaw(sec.gainPct ?? null)}) · inv {fmtMoney(sec.invested)}
            </div>
            {isOpen &&
              sec.subsectors.map((sub) => (
                <div key={sub.subsector} className="m-bd-subwrap">
                  <div className="m-bd-sub">
                    <span className="m-bd-sub-name">{sub.subsector || "Other"}</span>
                    <span className="m-bd-sub-val">{fmtMoney(sub.value)} · {sub.weightPct.toFixed(1)}%</span>
                  </div>
                  {sub.lines.map((ln, i) => (
                    <div key={(ln.tikr ?? ln.assetName) + "|" + i} className="m-bd-line">
                      <span className="m-bd-line-name">{ln.assetName}</span>
                      <span className="m-bd-line-val">{fmtMoney(ln.value)}</span>
                      <span className={`m-bd-line-pnl ${ln.gain >= 0 ? "is-up" : "is-down"}`}>{fmtPctRaw(ln.gainPct ?? null)}</span>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        );
      })}
      <div className="m-bd-total">
        <span>Total</span>
        <span>{fmtMoney(result.total.value)}</span>
      </div>
    </div>
  );
}
