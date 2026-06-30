// Verdict banner: names the risk-adjusted leader and explains WHY honestly.
// Appends a collapsible "How 'best risk-adjusted' is calculated" with:
//   - the Exp. return formula + the leader's worked example
//   - the ★ rank formula (weights + min-max, never shown as a number)
//   - a per-stock breakdown matrix (bar per dimension)
//   - explicit note: rank ≠ analyst Score (1–5)

import { fmtRupee, fmtPct } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";
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
    return <span className="cmp-rank-bar-null">—</span>;
  }
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="cmp-rank-bar" aria-label={`${(w).toFixed(0)}%`}>
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

  // Discriminator-first headline rationale.
  const parts: string[] = [];
  if (leader.expectedReturn != null) {
    parts.push(
      runnerUp && runnerUp.expectedReturn != null
        ? `model return ${fmtPct(leader.expectedReturn)} vs ${runnerUpName} ${fmtPct(runnerUp.expectedReturn)}`
        : `model return ${fmtPct(leader.expectedReturn)}`
    );
  }
  const lBase = leaderStock ? scenarioUpside(leaderStock.base, leader.cmp) : null;
  const rBase =
    runnerUpStock && runnerUp
      ? scenarioUpside(runnerUpStock.base, runnerUp.cmp)
      : null;
  const anyOtherPositiveBase = rows.some((r) => {
    if (r.tikr === leader.tikr) return false;
    const u = scenarioUpside(stockOf(r.tikr)?.base ?? null, r.cmp);
    return u != null && u > 0;
  });
  if (lBase != null && lBase > 0) {
    if (!anyOtherPositiveBase) parts.push("the only name with positive base-case upside");
    else if (rBase != null) parts.push(`wider base-case upside (${fmtPct(lBase)} vs ${fmtPct(rBase)})`);
    else parts.push(`positive base-case upside (${fmtPct(lBase)})`);
  }
  const rationale = parts.length > 0 ? parts.join(" · ") : "best overall risk-adjusted profile";

  // Tradeoff line.
  const lDown = leader.cushionToBear;
  const rDown = runnerUp ? runnerUp.cushionToBear : null;
  const tradeoffBits: string[] = [];
  if (lDown != null && rDown != null && Math.abs(lDown - rDown) > 0.005) {
    const lLoss = fmtPct(-Math.max(0, lDown));
    const rLoss = fmtPct(-Math.max(0, rDown));
    tradeoffBits.push(
      lDown > rDown
        ? `carries more downside to bear than ${runnerUpName} (${lLoss} vs ${rLoss})`
        : `also the lower downside to bear (${lLoss} vs ${rLoss})`
    );
  }
  const lConv = leaderStock?.conviction;
  const rConv = runnerUpStock?.conviction;
  if (lConv != null && rConv != null && lConv === rConv && Number.isFinite(lConv)) {
    tradeoffBits.push(`conviction ${Math.round(lConv)}/5 on both`);
  }
  const tradeoff = tradeoffBits.length > 0 ? tradeoffBits.join(" · ") : null;
  const cmpStr = leader.cmp != null ? fmtRupee(leader.cmp) : "—";
  const headline = `${displayName} — best risk-adjusted`;

  // Disclosure section: leader's worked example.
  const lWeights = scenarioWeights(leaderStock?.conviction ?? null);
  const pBear = Math.round(lWeights.pBear * 100);
  const pBull = Math.round(lWeights.pBull * 100);
  const convN =
    leaderStock?.conviction != null && Number.isFinite(leaderStock.conviction)
      ? Math.round(leaderStock.conviction)
      : "?";
  const lBearUp = leaderStock ? scenarioUpside(leaderStock.bear, leader.cmp) : null;
  const lBaseUp = leaderStock ? scenarioUpside(leaderStock.base, leader.cmp) : null;
  const lBullUp = leaderStock ? scenarioUpside(leaderStock.bull, leader.cmp) : null;

  const workedParts: string[] = [];
  if (lBearUp != null) workedParts.push(`${pBear}% × ${fmtPct(lBearUp)} bear`);
  workedParts.push(`50% × ${lBaseUp != null ? fmtPct(lBaseUp) : "—"} base`);
  if (lBullUp != null) workedParts.push(`${pBull}% × ${fmtPct(lBullUp)} bull`);
  const workedExample =
    workedParts.length > 0 ? workedParts.join(" + ") : "—";

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
        {tradeoff && <p className="cmp-verdict-tradeoff">Tradeoff: {tradeoff}.</p>}

        {/* Collapsible methodology disclosure */}
        <details className="cmp-verdict-how">
          <summary className="cmp-verdict-how-summary">
            How &ldquo;best risk-adjusted&rdquo; is calculated
          </summary>

          <div className="cmp-verdict-how-body">
            {/* 1. Exp. return formula + worked example */}
            <p className="cmp-verdict-how-section-label">Exp. return (model)</p>
            <p className="cmp-verdict-how-text">
              Conviction-weighted average across bear / base / bull scenarios.
              Base is anchored at 50%; conviction {convN}/5 tilts the tails:{" "}
              <strong>{pBear}% bear · 50% base · {pBull}% bull</strong>.
            </p>
            <p className="cmp-verdict-how-text">
              {displayName}&rsquo;s worked example:{" "}
              <span className="cmp-verdict-how-formula">{workedExample}</span>
              {leader.expectedReturn != null && (
                <> = <strong>{fmtPct(leader.expectedReturn)}</strong></>
              )}
            </p>

            {/* 2. Rank formula */}
            <p className="cmp-verdict-how-section-label">&#x2605; Rank</p>
            <p className="cmp-verdict-how-text">
              Each stock is scored across three dimensions, all min-max
              normalised to [0,1] across the compared set, then blended:{" "}
              <strong>45% Up/Down ratio + 40% Exp. return + 15% low Downside-to-bear</strong>.
              The composite score is never shown as a number — it is used only
              to identify a single leader (no rank when tied).
            </p>

            {/* 3. Per-stock breakdown matrix */}
            <p className="cmp-verdict-how-section-label">Score breakdown</p>
            <div className="cmp-rank-matrix" role="table" aria-label="Rank dimension breakdown">
              <div className="cmp-rank-matrix-head" role="row">
                <span role="columnheader">Stock</span>
                <span role="columnheader">Up/Down (45%)</span>
                <span role="columnheader">Exp. return (40%)</span>
                <span role="columnheader">Low downside (15%)</span>
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
                      <RankBar value={r.rankParts.upDown} color="var(--color-accent-blue)" />
                    </span>
                    <span role="cell">
                      <RankBar value={r.rankParts.expected} color="var(--color-positive)" />
                    </span>
                    <span role="cell">
                      <RankBar value={r.rankParts.cushion} color="var(--color-warning)" />
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 4. Score ≠ rank note */}
            <p className="cmp-verdict-how-note">
              The &#x2605; rank is <strong>not</strong> the analyst{" "}
              <strong>Score (1–5)</strong> shown in the comparison table.
              The Score reflects analyst conviction and understanding; it
              does <strong>not</strong> feed the rank calculation above.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
