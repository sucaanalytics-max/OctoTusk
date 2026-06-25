// Scorecard grid: one card per stock, sorted by rankScore DESC (nulls last).
// isLeader card gets accent border + "★ Best risk-adj" badge.
// Renders 0 values explicitly — only null → "—". No `value && fmt()` truthiness.

import { fmtRupee, fmtPct } from "@/lib/format";
import { getCompanyShort } from "@/lib/companyName";
import type { ScorecardRow, UpDownNote } from "@/lib/compare/types";
import type { CompareStock } from "@/lib/compare/types";

interface Props {
  rows: ScorecardRow[];
  stocks: CompareStock[];
}

/** Render the up/down ratio cell — all four note states handled explicitly. */
function UpDownCell({ value, note }: { value: number | null; note: UpDownNote }) {
  if (note === "below-bear") {
    return (
      <span className="cmp-sc-below-bear" title="CMP is below bear case — entire band is upside">
        &#x25B2; below bear
      </span>
    );
  }
  if (note === "missing") {
    return <span className="cmp-sc-metric-value is-muted">&#x2014;</span>;
  }
  // "normal" or "no-base-upside" — value is a number (0 for no-base-upside).
  // Render 0 explicitly; guard only null above.
  const display = value != null ? value.toFixed(1) + "×" : "—";
  const cls =
    value != null && value > 0
      ? "cmp-sc-metric-value is-pos"
      : "cmp-sc-metric-value is-muted";
  return <span className={cls}>{display}</span>;
}

/** Color class for a fraction (expected return, cushion). null → muted. */
function fracClass(v: number | null): string {
  if (v == null) return "cmp-sc-metric-value is-muted";
  if (v > 0) return "cmp-sc-metric-value is-pos";
  if (v < 0) return "cmp-sc-metric-value is-neg";
  return "cmp-sc-metric-value";
}

interface CardProps {
  row: ScorecardRow;
  stock: CompareStock | undefined;
}

function ScorecardCard({ row, stock }: CardProps) {
  const displayName = stock
    ? getCompanyShort({ official_name: stock.name, tikr: stock.tikr })
    : row.tikr;

  const conviction = stock?.conviction;
  const convictionDisplay =
    conviction != null && Number.isFinite(conviction)
      ? String(Math.round(conviction))
      : "—";

  const cmpDisplay = row.cmp != null ? fmtRupee(row.cmp) : "—";

  return (
    <article
      className={`cmp-sc-card${row.isLeader ? " is-leader" : ""}`}
      aria-label={`${displayName}${row.isLeader ? " — best risk-adjusted" : ""}`}
    >
      {/* Header: name + leader badge */}
      <div className="cmp-sc-card-header">
        <div>
          <div className="cmp-sc-card-name">{displayName}</div>
          <div className="cmp-sc-card-tikr">{row.tikr}</div>
        </div>
        {row.isLeader && (
          <span className="cmp-sc-leader-badge" aria-label="Best risk-adjusted">
            &#x2605; Best risk-adj
          </span>
        )}
      </div>

      {/* CMP */}
      <div className="cmp-sc-cmp-row">
        <span className="cmp-sc-cmp-value">{cmpDisplay}</span>
        {row.cmpIsLive ? (
          <span className="cmp-sc-cmp-live">live</span>
        ) : (
          <span className="cmp-sc-cmp-snapshot">snapshot</span>
        )}
      </div>

      {/* Metrics */}
      <dl className="cmp-sc-metrics">
        <div className="cmp-sc-metric">
          <dt className="cmp-sc-metric-label">Up/Down</dt>
          <dd>
            <UpDownCell value={row.upDownRatio} note={row.upDownNote} />
          </dd>
        </div>

        <div className="cmp-sc-metric">
          <dt className="cmp-sc-metric-label">Exp. return (model)</dt>
          <dd>
            <span className={fracClass(row.expectedReturn)}>
              {row.expectedReturn != null ? fmtPct(row.expectedReturn) : "—"}
            </span>
          </dd>
        </div>

        <div className="cmp-sc-metric">
          <dt className="cmp-sc-metric-label">Cushion to bear</dt>
          <dd>
            <span className={fracClass(row.cushionToBear)}>
              {row.cushionToBear != null ? fmtPct(row.cushionToBear) : "—"}
            </span>
          </dd>
        </div>

        <div className="cmp-sc-metric">
          <dt className="cmp-sc-metric-label">Conviction</dt>
          <dd>
            <span className="cmp-sc-metric-value">{convictionDisplay}</span>
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function ScorecardGrid({ rows, stocks }: Props) {
  if (rows.length === 0) return null;

  // Sort by rankScore DESC, nulls last.
  const sorted = [...rows].sort((a, b) => {
    if (a.rankScore == null && b.rankScore == null) return 0;
    if (a.rankScore == null) return 1;
    if (b.rankScore == null) return -1;
    return b.rankScore - a.rankScore;
  });

  return (
    <section className="cmp-scorecard-section" aria-label="Risk-adjusted scorecard">
      <h3 className="cmp-scorecard-heading">Risk-adjusted scorecard</h3>
      <div className="cmp-scorecard-grid">
        {sorted.map((row) => {
          const stock = stocks.find((s) => s.tikr === row.tikr);
          return <ScorecardCard key={row.tikr} row={row} stock={stock} />;
        })}
      </div>
    </section>
  );
}
