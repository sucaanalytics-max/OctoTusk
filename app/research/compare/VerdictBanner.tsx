// Verdict banner: names the risk-adjusted leader and explains WHY honestly.
// v2 (2026-06-30): rationale rebuilt from annualized return + positioning + downside signals.
// Comparative claims are made only when the arithmetic strictly supports them (no null/equal).
// Collapsible "How it's calculated" shows the 4-dim rank matrix (Return p.a. 35% · Margin 30%
// · Safety 20% · Conviction 15%) with one-line defs; explicit note rank ≠ analyst Score.

import { fmtRupee, fmtPct } from "@/lib/format";
import { scenarioWeights } from "@/lib/compare/riskAdjusted";
import { getCompanyShort } from "@/lib/companyName";
import type { ScorecardRow, CompareStock } from "@/lib/compare/types";

interface Props {
  rows: ScorecardRow[];
  stocks: CompareStock[];
}

function shortName(stock: CompareStock | undefined, tikr: string): string {
  return stock ? getCompanyShort({ official_name: stock.name, tikr: stock.tikr }) : tikr;
}

/** Bar fill for the rank matrix. Width = value×100%; "—" when null (never coerce null→0). */
function RankBar({ value, color }: { value: number | null; color: string }) {
  if (value == null) {
    return <span className="cmp-rank-bar-null">&#x2014;</span>;
  }
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="cmp-rank-bar" aria-label={`${w.toFixed(0)}%`}>
      <div
        className="cmp-rank-bar-fill"
        style={{ width: `${w}%`, background: color }}
      />
    </div>
  );
}

export default function VerdictBanner({ rows, stocks }: Props) {
  const leader = rows.find((r) => r.isLeader);

  if (!leader) {
    return (
      <div className="cmp-verdict" role="status">
        <span className="cmp-verdict-icon" aria-hidden="true">&#x2696;&#xFE0F;</span>
        <div className="cmp-verdict-body">
          <p className="cmp-verdict-label">Risk-adjusted verdict</p>
          <p className="cmp-verdict-neutral">
            {rows.length < 2
              ? "Add at least 2 stocks to see a verdict."
              : "No clear leader — stocks are closely matched."}
          </p>
        </div>
      </div>
    );
  }

  const stockOf = (tikr: string) => stocks.find((s) => s.tikr === tikr);
  const leaderStock = stockOf(leader.tikr);
  const displayName = shortName(leaderStock, leader.tikr);

  // Runner-up = highest rankScore among the rest.
  const runnerUp = rows
    .filter((r) => r.tikr !== leader.tikr && r.rankScore != null)
    .sort((a, b) => (b.rankScore as number) - (a.rankScore as number))[0];
  const runnerUpStock = runnerUp ? stockOf(runnerUp.tikr) : undefined;
  const runnerUpName = runnerUp ? shortName(runnerUpStock, runnerUp.tikr) : "";

  // ── Rationale from new signals ──────────────────────────────────────────────
  const parts: string[] = [];

  // 1. Annualized return — always the first phrase when non-null.
  if (leader.expReturnAnn != null) {
    parts.push(`~${fmtPct(leader.expReturnAnn)} p.a. to its 1–2Y targets`);
  }

  // 2. Zone phrase (cheap/fair/rich).
  if (leader.scenarioZone != null) {
    const zoneLabel =
      leader.scenarioZone === "cheap"
        ? "cheap"
        : leader.scenarioZone === "rich"
        ? "rich"
        : "fair";
    parts.push(`${zoneLabel} in its bear–bull range`);
  }

  // 3. Downside phrase.
  if (leader.cushionToBear != null) {
    const downside = Math.max(0, leader.cushionToBear);
    parts.push(`${fmtPct(-downside)} downside to bear`);
  }

  const rationale = parts.length > 0 ? parts.join(" · ") : "best overall risk-adjusted profile";

  // ── vs-runner-up delta — ONLY when both expReturnAnn non-null and they differ ──
  let deltaLine: string | null = null;
  if (
    runnerUp != null &&
    leader.expReturnAnn != null &&
    runnerUp.expReturnAnn != null &&
    leader.expReturnAnn !== runnerUp.expReturnAnn
  ) {
    const delta = leader.expReturnAnn - runnerUp.expReturnAnn;
    deltaLine = `${fmtPct(delta)} higher annualized return than ${runnerUpName} (${fmtPct(leader.expReturnAnn)} vs ${fmtPct(runnerUp.expReturnAnn)})`;
  }

  // ── "cheaper than runner-up" — ONLY when both bandPos non-null and leader is strictly cheaper ──
  let cheaperLine: string | null = null;
  if (
    runnerUp != null &&
    leader.bandPos != null &&
    runnerUp.bandPos != null &&
    leader.bandPos < runnerUp.bandPos
  ) {
    cheaperLine = `cheaper than ${runnerUpName} in its bear–bull range`;
  }

  const cmpStr = leader.cmp != null ? fmtRupee(leader.cmp) : "—";
  const headline = `${displayName} — best risk-adjusted`;

  // ── Disclosure: worked example for the leader ──────────────────────────────
  const lWeights = scenarioWeights(leaderStock?.conviction ?? null);
  const pBear = Math.round(lWeights.pBear * 100);
  const pBull = Math.round(lWeights.pBull * 100);
  const convN =
    leaderStock?.conviction != null && Number.isFinite(leaderStock.conviction)
      ? Math.round(leaderStock.conviction)
      : "?";
  const ann1Str = leader.ann1 != null ? fmtPct(leader.ann1) : "—";
  const ann2Str = leader.ann2 != null ? fmtPct(leader.ann2) : "—";
  const erStr = leader.expReturnAnn != null ? fmtPct(leader.expReturnAnn) : "—";

  return (
    <div className="cmp-verdict" role="status" aria-label={`Verdict: ${headline}`}>
      <span className="cmp-verdict-icon" aria-hidden="true">&#x2605;</span>
      <div className="cmp-verdict-body">
        <p className="cmp-verdict-label">Risk-adjusted verdict</p>
        <h2 className="cmp-verdict-headline is-leader">{headline}</h2>
        <p className="cmp-verdict-rationale">
          {rationale}
          {leader.cmpIsLive && leader.cmp != null && (
            <> &nbsp;&middot;&nbsp; CMP {cmpStr} (live)</>
          )}
        </p>
        {(deltaLine || cheaperLine) && (
          <p className="cmp-verdict-tradeoff">
            {[deltaLine, cheaperLine].filter(Boolean).join(" · ")}.
          </p>
        )}

        {/* Collapsible methodology disclosure */}
        <details className="cmp-verdict-how">
          <summary className="cmp-verdict-how-summary">
            How &ldquo;best risk-adjusted&rdquo; is calculated
          </summary>

          <div className="cmp-verdict-how-body">
            {/* 1. Exp. return p.a. formula + leader worked example */}
            <p className="cmp-verdict-how-section-label">Exp. return p.a.</p>
            <p className="cmp-verdict-how-text">
              Annualized blend of the 1Y target, 2Y target (annualized), and the
              conviction-weighted scenario EV (annualized over 2Y). Conviction {convN}/5
              tilts scenario weights:{" "}
              <strong>{pBear}% bear &middot; 50% base &middot; {pBull}% bull</strong>.
            </p>
            <p className="cmp-verdict-how-text">
              {displayName}&rsquo;s blend:{" "}
              <span className="cmp-verdict-how-formula">
                1Y {ann1Str} &middot; 2Y {ann2Str} &middot; avg = {erStr} p.a.
              </span>
            </p>

            {/* 2. Rank formula */}
            <p className="cmp-verdict-how-section-label">&#x2605; Rank</p>
            <p className="cmp-verdict-how-text">
              Each stock is scored across four dimensions, all min-max normalised
              to [0,1] across the compared set, then blended:{" "}
              <strong>
                Return p.a. 35% &middot; Margin 30% &middot; Safety 20% &middot; Conviction 15%
              </strong>.
              The composite score is never shown as a number — it is used only to
              identify a single leader (no rank when tied).
            </p>

            {/* 3. Per-stock breakdown matrix — 4 columns */}
            <p className="cmp-verdict-how-section-label">Score breakdown</p>
            <div className="cmp-rank-matrix" role="table" aria-label="Rank dimension breakdown">
              <div className="cmp-rank-matrix-head" role="row">
                <span role="columnheader">Stock</span>
                <span role="columnheader">Return p.a. (35%)</span>
                <span role="columnheader">Margin (30%)</span>
                <span role="columnheader">Safety (20%)</span>
                <span role="columnheader">Conviction (15%)</span>
              </div>
              {rows.map((r) => {
                const s = stockOf(r.tikr);
                const name = shortName(s, r.tikr);
                return (
                  <div
                    key={r.tikr}
                    className={`cmp-rank-matrix-row${r.isLeader ? " is-leader" : ""}`}
                    role="row"
                  >
                    <span role="cell" className="cmp-rank-matrix-name">
                      {name}
                    </span>
                    <span role="cell">
                      <RankBar value={r.rankParts.ret} color="var(--color-chart-2)" />
                    </span>
                    <span role="cell">
                      <RankBar value={r.rankParts.margin} color="var(--color-chart-1)" />
                    </span>
                    <span role="cell">
                      <RankBar value={r.rankParts.safety} color="var(--color-chart-3)" />
                    </span>
                    <span role="cell">
                      <RankBar value={r.rankParts.conviction} color="var(--color-chart-5)" />
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 4. What each metric means */}
            <p className="cmp-verdict-how-section-label">What each metric means</p>
            <dl className="cmp-verdict-how-defs">
              <div className="cmp-verdict-how-def">
                <dt className="cmp-verdict-how-def-term">Return p.a.</dt>
                <dd className="cmp-verdict-how-text">
                  Annualized blend of 1Y target, 2Y target, and conviction-weighted
                  scenario EV — the headline performance driver.
                </dd>
              </div>
              <div className="cmp-verdict-how-def">
                <dt className="cmp-verdict-how-def-term">Margin</dt>
                <dd className="cmp-verdict-how-text">
                  Position within the bear&rarr;bull band (1 &minus; bandPos).
                  Cheaper is better — a stock near or below its bear case scores highest.
                </dd>
              </div>
              <div className="cmp-verdict-how-def">
                <dt className="cmp-verdict-how-def-term">Safety</dt>
                <dd className="cmp-verdict-how-text">
                  Low downside-to-bear combined with low bear&ndash;bull dispersion
                  (band width). Lower risk = higher safety score.
                </dd>
              </div>
              <div className="cmp-verdict-how-def">
                <dt className="cmp-verdict-how-def-term">Conviction</dt>
                <dd className="cmp-verdict-how-text">
                  Analyst conviction on a 1&ndash;5 scale; tilts the scenario
                  probability weights and ranks directly here.
                </dd>
              </div>
            </dl>

            {/* 5. Score ≠ rank note */}
            <p className="cmp-verdict-how-note">
              The &#x2605; rank is <strong>not</strong> the analyst{" "}
              <strong>Score (1&ndash;5)</strong> shown in the comparison table.
              The Score reflects analyst conviction and understanding; it does{" "}
              <strong>not</strong> feed the rank calculation above.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
