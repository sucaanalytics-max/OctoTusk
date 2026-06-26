// Scorecard grid: one card per stock, sorted by rankScore DESC (nulls last).
// isLeader card gets accent border + "★ Best risk-adj" badge. Each quantitative metric carries an
// inline micro-bar scaled across the compared set, so the head-to-head reads at a glance.
// Renders 0 values explicitly — only null → "—". No `value && fmt()` truthiness.

import { fmtRupee, fmtPct } from "@/lib/format";
import { getCompanyShort } from "@/lib/companyName";
import type { ScorecardRow, UpDownNote, CompareStock } from "@/lib/compare/types";

interface Props {
  rows: ScorecardRow[];
  stocks: CompareStock[];
}

/** Cross-set maxima used to scale the micro-bars. */
interface Scale { maxUD: number; maxER: number; maxDown: number; showConviction: boolean; }

function Bar({ frac, color }: { frac: number | null; color: string }) {
  if (frac == null) return null;
  const w = Math.max(0, Math.min(1, frac)) * 100;
  return (
    <div className="cmp-sc-bar" aria-hidden="true">
      <div className="cmp-sc-bar-fill" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/** Up/down ratio cell — all four note states handled explicitly. */
function UpDownCell({ value, note }: { value: number | null; note: UpDownNote }) {
  if (note === "below-bear") {
    return (
      <span className="cmp-sc-below-bear" title="CMP is below bear case — entire band is upside">
        &#x25B2; below bear
      </span>
    );
  }
  if (note === "missing") return <span className="cmp-sc-metric-value is-muted">&#x2014;</span>;
  // "normal" or "no-base-upside" — value is a number (0 for no-base-upside). 0 renders explicitly.
  const display = value != null ? value.toFixed(1) + "×" : "—";
  const cls = value != null && value > 0 ? "cmp-sc-metric-value is-pos" : "cmp-sc-metric-value is-muted";
  return <span className={cls}>{display}</span>;
}

function fracClass(v: number | null): string {
  if (v == null) return "cmp-sc-metric-value is-muted";
  if (v > 0) return "cmp-sc-metric-value is-pos";
  if (v < 0) return "cmp-sc-metric-value is-neg";
  return "cmp-sc-metric-value";
}

/** Downside-to-bear: the loss to the bear case (risk; lower is safer). Aligns label, colour, and the
 *  rank direction (which rewards low downside). >0 cushion → a potential loss; ≤0 → at/below bear. */
function downsideCell(cushion: number | null): { text: string; cls: string } {
  if (cushion == null) return { text: "—", cls: "cmp-sc-metric-value is-muted" };
  if (cushion <= 0) return { text: "below bear", cls: "cmp-sc-metric-value is-pos" };
  return { text: fmtPct(-cushion), cls: "cmp-sc-metric-value is-warn" };
}

interface CardProps { row: ScorecardRow; stock: CompareStock | undefined; scale: Scale; }

function ScorecardCard({ row, stock, scale }: CardProps) {
  const displayName = stock ? getCompanyShort({ official_name: stock.name, tikr: stock.tikr }) : row.tikr;
  const conviction = stock?.conviction;
  const convictionDisplay = conviction != null && Number.isFinite(conviction) ? String(Math.round(conviction)) : "—";
  const cmpDisplay = row.cmp != null ? fmtRupee(row.cmp) : "—";

  // Micro-bar fractions.
  const udFrac =
    row.upDownNote === "below-bear" ? 1
    : row.upDownNote === "normal" && row.upDownRatio != null ? row.upDownRatio / scale.maxUD
    : row.upDownNote === "no-base-upside" ? 0
    : null;
  // Bar LENGTH encodes |magnitude| across the set; the colour (green/red) carries the sign.
  const erFrac = row.expectedReturn != null ? Math.abs(row.expectedReturn) / scale.maxER : null;
  const erColor = row.expectedReturn != null && row.expectedReturn < 0 ? "var(--color-negative)" : "var(--color-positive)";
  const downFrac = row.cushionToBear != null ? Math.max(0, row.cushionToBear) / scale.maxDown : null;
  const down = downsideCell(row.cushionToBear);

  return (
    <article
      className={`cmp-sc-card${row.isLeader ? " is-leader" : ""}`}
      aria-label={`${displayName}${row.isLeader ? " — best risk-adjusted" : ""}`}
    >
      <div className="cmp-sc-card-header">
        <div>
          <div className="cmp-sc-card-name">{displayName}</div>
          <div className="cmp-sc-card-tikr">{row.tikr}</div>
        </div>
        {row.isLeader && (
          <span className="cmp-sc-leader-badge" aria-label="Best risk-adjusted">&#x2605; Best risk-adj</span>
        )}
      </div>

      <div className="cmp-sc-cmp-row">
        <span className="cmp-sc-cmp-value">{cmpDisplay}</span>
        {row.cmpIsLive ? <span className="cmp-sc-cmp-live">live</span> : <span className="cmp-sc-cmp-snapshot">snapshot</span>}
      </div>

      <dl className="cmp-sc-metrics">
        <div className="cmp-sc-metric">
          <div className="cmp-sc-metric-head">
            <dt className="cmp-sc-metric-label">Up / Down</dt>
            <dd><UpDownCell value={row.upDownRatio} note={row.upDownNote} /></dd>
          </div>
          <Bar frac={udFrac} color="var(--color-accent-blue)" />
        </div>

        <div className="cmp-sc-metric">
          <div className="cmp-sc-metric-head">
            <dt className="cmp-sc-metric-label">Exp. return (model)</dt>
            <dd><span className={fracClass(row.expectedReturn)}>{row.expectedReturn != null ? fmtPct(row.expectedReturn) : "—"}</span></dd>
          </div>
          <Bar frac={erFrac} color={erColor} />
        </div>

        <div className="cmp-sc-metric">
          <div className="cmp-sc-metric-head">
            <dt className="cmp-sc-metric-label">Downside to bear</dt>
            <dd><span className={down.cls}>{down.text}</span></dd>
          </div>
          <Bar frac={downFrac} color="var(--color-warning)" />
        </div>

        {scale.showConviction && (
          <div className="cmp-sc-metric">
            <div className="cmp-sc-metric-head">
              <dt className="cmp-sc-metric-label">Conviction</dt>
              <dd><span className="cmp-sc-metric-value">{convictionDisplay}</span></dd>
            </div>
          </div>
        )}
      </dl>
    </article>
  );
}

export default function ScorecardGrid({ rows, stocks }: Props) {
  if (rows.length === 0) return null;

  const normalRatios = rows
    .filter((r) => r.upDownNote === "normal" && r.upDownRatio != null)
    .map((r) => r.upDownRatio as number);
  const scale: Scale = {
    maxUD: normalRatios.length ? Math.max(...normalRatios) : 1,
    maxER: Math.max(1e-9, ...rows.map((r) => Math.abs(r.expectedReturn ?? 0))),
    maxDown: Math.max(1e-9, ...rows.map((r) => Math.max(0, r.cushionToBear ?? 0))),
    // Only show conviction when it actually varies across the set (otherwise it's noise in a tie).
    showConviction: new Set(stocks.map((s) => s.conviction ?? null)).size > 1,
  };

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
        {sorted.map((row) => (
          <ScorecardCard key={row.tikr} row={row} stock={stocks.find((s) => s.tikr === row.tikr)} scale={scale} />
        ))}
      </div>
    </section>
  );
}
