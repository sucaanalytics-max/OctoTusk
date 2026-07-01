// Scorecard grid: one card per stock, sorted by rankScore DESC (nulls last).
// v2 (2026-06-30): headline metric → Exp. return p.a. (expReturnAnn); adds "Position in
// range" element (scenarioZone label + bandPos dot track); drops standalone Up/Down ratio
// tile (positioning subsumes it); keeps Bear/Base/Bull/1Y/2Y upside strip, Downside to bear,
// and Conviction. isLeader card gets accent border + "★ Best risk-adj" badge.
// Renders 0 values explicitly — only null → "—". No `value && fmt()` truthiness.

import { fmtRupee, fmtPct } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";
import { getCompanyShort } from "@/lib/companyName";
import type { ScorecardRow, CompareStock } from "@/lib/compare/types";

interface Props {
  rows: ScorecardRow[];
  stocks: CompareStock[];
}

/** Cross-set maxima used to scale the micro-bars. */
interface Scale {
  maxER: number;   // max |expReturnAnn| across the set
  maxDown: number; // max cushionToBear (downside) across the set
  showConviction: boolean;
}

const EM_DASH = "—";

function Bar({ frac, color }: { frac: number | null; color: string }) {
  if (frac == null) return null;
  const w = Math.max(0, Math.min(1, frac)) * 100;
  return (
    <div className="cmp-sc-bar" aria-hidden="true">
      <div className="cmp-sc-bar-fill" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

function fracClass(v: number | null): string {
  if (v == null) return "cmp-sc-metric-value is-muted";
  if (v > 0) return "cmp-sc-metric-value is-pos";
  if (v < 0) return "cmp-sc-metric-value is-neg";
  return "cmp-sc-metric-value";
}

function downsideCell(cushion: number | null): { text: string; cls: string } {
  if (cushion == null) return { text: EM_DASH, cls: "cmp-sc-metric-value is-muted" };
  if (cushion <= 0) return { text: "below bear", cls: "cmp-sc-metric-value is-pos" };
  return { text: fmtPct(-cushion), cls: "cmp-sc-metric-value is-warn" };
}

/** Single upside-vs-CMP cell for the strip: Bear/Base/Bull/1Y/2Y */
function UpsideCell({
  price,
  cmp,
  label,
}: {
  price: number | null;
  cmp: number | null;
  label: string;
}) {
  const up = scenarioUpside(price, cmp);
  const text = up != null ? fmtPct(up) : EM_DASH;
  const cls =
    up == null
      ? "cmp-sc-upside-cell is-muted"
      : up > 0
      ? "cmp-sc-upside-cell is-pos"
      : "cmp-sc-upside-cell is-neg";
  return (
    <div className={cls} title={`${label}: ${text}`}>
      <span className="cmp-sc-upside-label">{label}</span>
      <span>{text}</span>
    </div>
  );
}

/** Thin range track with a dot at bandPos position. */
function RangeTrack({ bandPos }: { bandPos: number | null }) {
  if (bandPos == null) return null;
  const pct = Math.max(0, Math.min(1, bandPos)) * 100;
  return (
    <div className="cmp-sc-range-track" aria-hidden="true">
      <div className="cmp-sc-range-dot" style={{ left: `${pct}%` }} />
    </div>
  );
}

interface CardProps {
  row: ScorecardRow;
  stock: CompareStock | undefined;
  scale: Scale;
}

function ScorecardCard({ row, stock, scale }: CardProps) {
  const displayName = stock
    ? getCompanyShort({ official_name: stock.name, tikr: stock.tikr })
    : row.tikr;
  const conviction = stock?.conviction;
  const convictionDisplay =
    conviction != null && Number.isFinite(conviction)
      ? String(Math.round(conviction))
      : EM_DASH;
  const cmpDisplay = row.cmp != null ? fmtRupee(row.cmp) : EM_DASH;

  // Exp. return p.a. bar fraction.
  const erFrac =
    row.expReturnAnn != null
      ? Math.abs(row.expReturnAnn) / scale.maxER
      : null;
  const erColor =
    row.expReturnAnn != null && row.expReturnAnn < 0
      ? "var(--color-negative)"
      : "var(--color-positive)";

  // Downside bar fraction.
  const downFrac =
    row.cushionToBear != null
      ? Math.max(0, row.cushionToBear) / scale.maxDown
      : null;
  const down = downsideCell(row.cushionToBear);

  // Zone label + class.
  const zone = row.scenarioZone;
  const zoneLabel =
    zone === "cheap" ? "Cheap" : zone === "rich" ? "Rich" : zone === "fair" ? "Fair" : null;
  const zoneCls =
    zone === "cheap"
      ? "cmp-sc-zone-label is-pos"
      : zone === "rich"
      ? "cmp-sc-zone-label is-neg"
      : "cmp-sc-zone-label is-muted";
  const bpText =
    row.bandPos != null ? ` ${Math.round(row.bandPos * 100)}%` : "";

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
          <span className="cmp-sc-leader-badge" aria-label="Best risk-adjusted">
            &#x2605; Best risk-adj
          </span>
        )}
      </div>

      <div className="cmp-sc-cmp-row">
        <span className="cmp-sc-cmp-value">{cmpDisplay}</span>
        {row.cmpIsLive ? (
          <span className="cmp-sc-cmp-live">live</span>
        ) : (
          <span className="cmp-sc-cmp-snapshot">snapshot</span>
        )}
      </div>

      {/* Upside-vs-CMP strip: Bear / Base / Bull / 1Y / 2Y */}
      <div className="cmp-sc-upside-strip" aria-label="Upside vs CMP">
        <UpsideCell price={stock?.bear ?? null} cmp={row.cmp} label="Bear" />
        <UpsideCell price={stock?.base ?? null} cmp={row.cmp} label="Base" />
        <UpsideCell price={stock?.bull ?? null} cmp={row.cmp} label="Bull" />
        <UpsideCell price={stock?.target1y ?? null} cmp={row.cmp} label="1Y" />
        <UpsideCell price={stock?.target2y ?? null} cmp={row.cmp} label="2Y" />
      </div>

      <dl className="cmp-sc-metrics">
        {/* Headline: Exp. return p.a. */}
        <div className="cmp-sc-metric">
          <div className="cmp-sc-metric-head">
            <dt
              className="cmp-sc-metric-label"
              title="Annualized blend of 1Y/2Y targets + conviction-weighted scenario EV."
            >
              Exp. return p.a.
            </dt>
            <dd>
              <span className={fracClass(row.expReturnAnn)}>
                {row.expReturnAnn != null ? fmtPct(row.expReturnAnn) : EM_DASH}
              </span>
            </dd>
          </div>
          <Bar frac={erFrac} color={erColor} />
        </div>

        {/* Position in range */}
        <div className="cmp-sc-metric">
          <div className="cmp-sc-metric-head">
            <dt
              className="cmp-sc-metric-label"
              title="Where CMP sits in the bear–bull range. Cheap = at or below bear; Rich = at or above bull."
            >
              Position in range
            </dt>
            <dd>
              {zoneLabel != null ? (
                <span className={zoneCls}>
                  {zoneLabel}{bpText}
                </span>
              ) : (
                <span className="cmp-sc-metric-value is-muted">{EM_DASH}</span>
              )}
            </dd>
          </div>
          <RangeTrack bandPos={row.bandPos} />
        </div>

        {/* Downside to bear */}
        <div className="cmp-sc-metric">
          <div className="cmp-sc-metric-head">
            <dt
              className="cmp-sc-metric-label"
              title="How far CMP can fall before hitting the bear-case target. Lower is safer."
            >
              Downside to bear
            </dt>
            <dd>
              <span className={down.cls}>{down.text}</span>
            </dd>
          </div>
          <Bar frac={downFrac} color="var(--color-warning)" />
        </div>

        {scale.showConviction && (
          <div className="cmp-sc-metric">
            <div className="cmp-sc-metric-head">
              <dt
                className="cmp-sc-metric-label"
                title="Analyst conviction on a 1–5 scale; tilts the scenario probability weights."
              >
                Conviction
              </dt>
              <dd>
                <span className="cmp-sc-metric-value">{convictionDisplay}</span>
              </dd>
            </div>
          </div>
        )}
      </dl>
    </article>
  );
}

export default function ScorecardGrid({ rows, stocks }: Props) {
  if (rows.length === 0) return null;

  const scale: Scale = {
    maxER: Math.max(1e-9, ...rows.map((r) => Math.abs(r.expReturnAnn ?? 0))),
    maxDown: Math.max(
      1e-9,
      ...rows.map((r) => Math.max(0, r.cushionToBear ?? 0))
    ),
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
          <ScorecardCard
            key={row.tikr}
            row={row}
            stock={stocks.find((s) => s.tikr === row.tikr)}
            scale={scale}
          />
        ))}
      </div>
    </section>
  );
}
