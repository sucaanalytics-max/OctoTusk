"use client";

import { displayName } from "@/lib/displayName";

export interface MoverStock {
  tikr: string;
  name?: string;
  dayPct: number | null;
  cmp: number | null;
}

const ROWS_PER_SIDE = 5;

function fmtPctSigned(p: number): string {
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

function fmtCmp(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  stocks: MoverStock[];
  focusedTikr: string | null;
  pinnedTikr: string | null;
  onRowHover: (tikr: string | null) => void;
  onRowClick: (tikr: string) => void;
}

export function TopMovers({ stocks, focusedTikr, pinnedTikr, onRowHover, onRowClick }: Props) {
  const live = stocks.filter((s) => typeof s.dayPct === "number") as Array<{
    tikr: string;
    name?: string;
    dayPct: number;
    cmp: number | null;
  }>;

  const winners = [...live].sort((a, b) => b.dayPct - a.dayPct).slice(0, ROWS_PER_SIDE);
  const losers = [...live].sort((a, b) => a.dayPct - b.dayPct).slice(0, ROWS_PER_SIDE);

  const padded = (
    rows: Array<{ tikr: string; name?: string; dayPct: number; cmp: number | null }>,
    n: number
  ) => {
    if (rows.length >= n) return rows;
    return [
      ...rows,
      ...Array(n - rows.length).fill({ tikr: "", name: "", dayPct: NaN, cmp: null }),
    ];
  };

  const winRows = padded(winners, ROWS_PER_SIDE);
  const loseRows = padded(losers, ROWS_PER_SIDE);

  const renderRow = (
    r: { tikr: string; name?: string; dayPct: number; cmp: number | null },
    dir: "up" | "down",
    key: string
  ) => {
    if (!r.tikr) {
      return (
        <div key={key} className="ox-mover-row ox-mover-row-empty">
          <span className="ox-mover-placeholder">·</span>
        </div>
      );
    }
    const isFocused = focusedTikr === r.tikr || pinnedTikr === r.tikr;
    const isPinned = pinnedTikr === r.tikr;
    const cls = dir === "up" ? "ox-pos" : "ox-neg";
    const arrow = dir === "up" ? "▲" : "▼";
    return (
      <div
        key={key}
        className="ox-mover-row"
        data-focused={isFocused || undefined}
        data-pinned={isPinned || undefined}
        onMouseEnter={() => onRowHover(r.tikr)}
        onMouseLeave={() => onRowHover(null)}
        onClick={() => onRowClick(r.tikr)}
      >
        <span className="ox-mover-name">{displayName(r.tikr, r.name)}</span>
        <span className="ox-mover-cmp">
          <span className="ox-rupee">₹</span>
          {fmtCmp(r.cmp)}
        </span>
        <span className={`ox-mover-pct ${cls}`}>
          {fmtPctSigned(r.dayPct)} <span className="ox-mover-arrow">{arrow}</span>
        </span>
      </div>
    );
  };

  return (
    <section className="ox-panel ox-panel-movers">
      <header className="ox-section-head">
        <span className="ox-section-label">Gainers</span>
        <span className="ox-section-trail" aria-hidden />
      </header>
      <div className="ox-mover-group">{winRows.map((r, i) => renderRow(r, "up", `w-${i}`))}</div>

      <header className="ox-section-head">
        <span className="ox-section-label">Losers</span>
        <span className="ox-section-trail" aria-hidden />
      </header>
      <div className="ox-mover-group">{loseRows.map((r, i) => renderRow(r, "down", `l-${i}`))}</div>
    </section>
  );
}
