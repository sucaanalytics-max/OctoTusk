"use client";

export interface MoverStock {
  tikr: string;
  dayPct: number | null;
}

const ROWS_PER_SIDE = 5;

function fmtPctSigned(p: number): string {
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

export function TopMovers({ stocks }: { stocks: MoverStock[] }) {
  const live = stocks.filter((s) => typeof s.dayPct === "number") as { tikr: string; dayPct: number }[];

  const winners = [...live].sort((a, b) => b.dayPct - a.dayPct).slice(0, ROWS_PER_SIDE);
  const losers = [...live].sort((a, b) => a.dayPct - b.dayPct).slice(0, ROWS_PER_SIDE);

  const padded = (rows: { tikr: string; dayPct: number }[], n: number) => {
    if (rows.length >= n) return rows;
    return [...rows, ...Array(n - rows.length).fill({ tikr: "", dayPct: NaN })];
  };

  const winRows = padded(winners, ROWS_PER_SIDE);
  const loseRows = padded(losers, ROWS_PER_SIDE);

  return (
    <div className="octopus-panel">
      <div className="octopus-panel-title">Top movers</div>
      <div className="octopus-mover-list">
        {winRows.map((r, i) => (
          <div key={`w-${i}`} className="octopus-mover-row">
            {r.tikr ? (
              <>
                <span className="octopus-mover-arrow octopus-pct-pos">▲</span>
                <span className="octopus-mover-pct octopus-pct-pos">{fmtPctSigned(r.dayPct)}</span>
                <span className="octopus-mover-tikr">{r.tikr}</span>
              </>
            ) : (
              <span className="octopus-mover-empty" style={{ gridColumn: "1 / -1" }}>· · · · ·</span>
            )}
          </div>
        ))}
        <div className="octopus-mover-divider" />
        {loseRows.map((r, i) => (
          <div key={`l-${i}`} className="octopus-mover-row">
            {r.tikr ? (
              <>
                <span className="octopus-mover-arrow octopus-pct-neg">▼</span>
                <span className="octopus-mover-pct octopus-pct-neg">{fmtPctSigned(r.dayPct)}</span>
                <span className="octopus-mover-tikr">{r.tikr}</span>
              </>
            ) : (
              <span className="octopus-mover-empty" style={{ gridColumn: "1 / -1" }}>· · · · ·</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
