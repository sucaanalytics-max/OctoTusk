"use client";

import { displayName } from "@/lib/displayName";

export interface MoverStock {
  tikr: string;
  name?: string;
  dayPct: number | null;
}

const ROWS_PER_SIDE = 5;

function fmtPctSigned(p: number): string {
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
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
  }>;

  const winners = [...live].sort((a, b) => b.dayPct - a.dayPct).slice(0, ROWS_PER_SIDE);
  const losers = [...live].sort((a, b) => a.dayPct - b.dayPct).slice(0, ROWS_PER_SIDE);

  const padded = (
    rows: Array<{ tikr: string; name?: string; dayPct: number }>,
    n: number
  ) => {
    if (rows.length >= n) return rows;
    return [
      ...rows,
      ...Array(n - rows.length).fill({ tikr: "", name: "", dayPct: NaN }),
    ];
  };

  const winRows = padded(winners, ROWS_PER_SIDE);
  const loseRows = padded(losers, ROWS_PER_SIDE);

  const renderRow = (
    r: { tikr: string; name?: string; dayPct: number },
    dir: "up" | "down",
    key: string
  ) => {
    if (!r.tikr) {
      return (
        <div key={key} className="octopus-mover-row">
          <span className="octopus-mover-empty" style={{ gridColumn: "1 / -1" }}>
            · · · · ·
          </span>
        </div>
      );
    }
    const isFocused = focusedTikr === r.tikr || pinnedTikr === r.tikr;
    const isPinned = pinnedTikr === r.tikr;
    const cls = dir === "up" ? "octopus-pct-pos" : "octopus-pct-neg";
    const arrow = dir === "up" ? "▲" : "▼";
    return (
      <div
        key={key}
        className="octopus-mover-row octopus-mover-row-interactive"
        data-focused={isFocused || undefined}
        data-pinned={isPinned || undefined}
        onMouseEnter={() => onRowHover(r.tikr)}
        onMouseLeave={() => onRowHover(null)}
        onClick={() => onRowClick(r.tikr)}
      >
        <span className={`octopus-mover-arrow ${cls}`}>{arrow}</span>
        <span className={`octopus-mover-pct ${cls}`}>{fmtPctSigned(r.dayPct)}</span>
        <span className="octopus-mover-tikr">{displayName(r.tikr, r.name)}</span>
      </div>
    );
  };

  return (
    <div className="octopus-panel">
      <div className="octopus-panel-title">Top movers</div>
      <div className="octopus-mover-list">
        {winRows.map((r, i) => renderRow(r, "up", `w-${i}`))}
        <div className="octopus-mover-divider" />
        {loseRows.map((r, i) => renderRow(r, "down", `l-${i}`))}
      </div>
    </div>
  );
}
