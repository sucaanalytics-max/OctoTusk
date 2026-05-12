"use client";

import { useEffect, useMemo } from "react";
import { displayName } from "@/lib/displayName";
import type { PreviewStock } from "./GridView";

interface Props {
  open: boolean;
  cluster: string | null;
  stocks: PreviewStock[];
  onClose: () => void;
}

type SortKey = "dayPct" | "name";

function fmtPct(p: number | null, asFraction: boolean): string {
  if (p == null || !isFinite(p)) return "—";
  const v = asFraction ? p * 100 : p;
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
}

function fmtCmp(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctClass(p: number | null): string {
  if (p == null) return "ox-flat";
  if (p > 0) return "ox-pos";
  if (p < 0) return "ox-neg";
  return "ox-flat";
}

export function SectorDrawer({ open, cluster, stocks, onClose }: Props) {
  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rows = useMemo(() => {
    // Sort by day% descending — winners on top, then losers, then null (greyed).
    return [...stocks].sort((a, b) => {
      const ap = a.dayPct;
      const bp = b.dayPct;
      if (ap == null && bp == null) return a.tikr.localeCompare(b.tikr);
      if (ap == null) return 1;
      if (bp == null) return -1;
      return bp - ap;
    });
  }, [stocks]);

  const live = stocks.filter((s) => typeof s.dayPct === "number") as Array<PreviewStock & { dayPct: number }>;
  const mean = live.length ? live.reduce((s, x) => s + x.dayPct, 0) / live.length : null;
  const upCount = live.filter((s) => s.dayPct > 0).length;
  const downCount = live.filter((s) => s.dayPct < 0).length;

  if (!open || !cluster) return null;

  return (
    <div className="ox-drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="ox-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="ox-drawer-head">
          <div>
            <h2 className="ox-drawer-title">{cluster}</h2>
            <p className="ox-drawer-sub">
              {stocks.length} {stocks.length === 1 ? "stock" : "stocks"}
              {mean != null && (
                <>
                  {" · mean "}
                  <span className={pctClass(mean)}>{fmtPct(mean, false)}</span>
                </>
              )}
              {live.length > 0 && (
                <>
                  {" · "}
                  <span className="ox-pos">{upCount} up</span>
                  {" / "}
                  <span className="ox-neg">{downCount} down</span>
                </>
              )}
            </p>
          </div>
          <button type="button" className="ox-drawer-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="ox-drawer-table-wrap">
          <table className="ox-drawer-table">
            <thead>
              <tr>
                <th className="ox-drawer-th-name">Name</th>
                <th className="ox-drawer-th-num">CMP</th>
                <th className="ox-drawer-th-num">Day</th>
                <th className="ox-drawer-th-num">Bear</th>
                <th className="ox-drawer-th-num">Base</th>
                <th className="ox-drawer-th-num">Bull</th>
                <th className="ox-drawer-th-num">1Y</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.tikr}>
                  <td className="ox-drawer-name">
                    <span className="ox-drawer-name-display">{displayName(s.tikr, s.name)}</span>
                    <span className="ox-drawer-name-tikr">{s.tikr}</span>
                  </td>
                  <td className="ox-drawer-num">
                    <span className="ox-rupee">₹</span>
                    {fmtCmp(s.cmp)}
                  </td>
                  <td className={`ox-drawer-num ${pctClass(s.dayPct)}`}>
                    {fmtPct(s.dayPct, false)}
                  </td>
                  <td className={`ox-drawer-num ${pctClass(s.bearUpside)}`}>
                    {fmtPct(s.bearUpside, true)}
                  </td>
                  <td className={`ox-drawer-num ${pctClass(s.baseUpside)}`}>
                    {fmtPct(s.baseUpside, true)}
                  </td>
                  <td className={`ox-drawer-num ${pctClass(s.bullUpside)}`}>
                    {fmtPct(s.bullUpside, true)}
                  </td>
                  <td className={`ox-drawer-num ${pctClass(s.oneYearUpside)}`}>
                    {fmtPct(s.oneYearUpside, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="ox-drawer-foot">
          <kbd>esc</kbd> close
        </footer>
      </div>
    </div>
  );
}
