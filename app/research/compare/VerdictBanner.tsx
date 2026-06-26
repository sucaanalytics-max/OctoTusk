// Verdict banner: names the risk-adjusted leader and explains WHY honestly — leads with the
// discriminating metric (model return + base-case upside), shows a vs-runner-up delta, and states
// the tradeoff (e.g. the leader carrying more downside to bear). Props come from computeScorecard();
// base upside is derived via the shared scenarioUpside helper, never re-deriving the rank math.

import { fmtRupee, fmtPct } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";
import { getCompanyShort } from "@/lib/companyName";
import type { ScorecardRow, CompareStock } from "@/lib/compare/types";

interface Props {
  rows: ScorecardRow[];
  stocks: CompareStock[];
}

function shortName(stock: CompareStock | undefined, tikr: string): string {
  return stock ? getCompanyShort({ official_name: stock.name, tikr: stock.tikr }) : tikr;
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

  // Runner-up = highest rankScore among the rest (for the "vs" delta).
  const runnerUp = rows
    .filter((r) => r.tikr !== leader.tikr && r.rankScore != null)
    .sort((a, b) => (b.rankScore as number) - (a.rankScore as number))[0];
  const runnerUpStock = runnerUp ? stockOf(runnerUp.tikr) : undefined;
  const runnerUpName = runnerUp ? shortName(runnerUpStock, runnerUp.tikr) : "";

  // ── Discriminator-first headline rationale ──
  const parts: string[] = [];
  if (leader.expectedReturn != null) {
    parts.push(
      runnerUp && runnerUp.expectedReturn != null
        ? `model return ${fmtPct(leader.expectedReturn)} vs ${runnerUpName} ${fmtPct(runnerUp.expectedReturn)}`
        : `model return ${fmtPct(leader.expectedReturn)}`
    );
  }
  const lBase = leaderStock ? scenarioUpside(leaderStock.base, leader.cmp) : null;
  const rBase = runnerUpStock && runnerUp ? scenarioUpside(runnerUpStock.base, runnerUp.cmp) : null;
  // "Only name" must hold across ALL other selected stocks, not just the runner-up.
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

  // ── Honest tradeoff line: downside to bear (lower is safer) + conviction parity ──
  const lDown = leader.cushionToBear; // fraction; >0 = room to fall to bear (risk)
  const rDown = runnerUp ? runnerUp.cushionToBear : null;
  const tradeoffBits: string[] = [];
  if (lDown != null && rDown != null && Math.abs(lDown - rDown) > 0.005) {
    // Show each downside as a clamped loss (≤0 cushion = no downside to bear → 0%).
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
      </div>
    </div>
  );
}
