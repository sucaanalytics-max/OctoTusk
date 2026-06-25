// Verdict banner: names the risk-adjusted leader with a one-line rationale.
// Props come from computeScorecard() — never re-derives the math.

import { fmtRupee, fmtPct } from "@/lib/format";
import { getCompanyShort } from "@/lib/companyName";
import type { ScorecardRow } from "@/lib/compare/types";
import type { CompareStock } from "@/lib/compare/types";

interface Props {
  rows: ScorecardRow[];
  stocks: CompareStock[];
}

/** Build a one-line rationale from the leader's scorecard row. */
function buildRationale(row: ScorecardRow): string {
  const parts: string[] = [];

  // Up/Down ratio
  if (row.upDownNote === "below-bear") {
    parts.push("trading below bear — maximum upside");
  } else if (row.upDownNote === "normal" && row.upDownRatio != null) {
    parts.push(`Up/Down ${row.upDownRatio.toFixed(1)}×`);
  } else if (row.upDownNote === "no-base-upside") {
    parts.push("Up/Down 0.0×");
  }

  // Expected return
  if (row.expectedReturn != null) {
    parts.push(`Exp. return ${fmtPct(row.expectedReturn)}`);
  }

  // Cushion to bear
  if (row.cushionToBear != null) {
    const sign = row.cushionToBear >= 0 ? "+" : "";
    parts.push(`cushion to bear ${sign}${fmtPct(row.cushionToBear)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Best overall risk-adjusted profile";
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

  const leaderStock = stocks.find((s) => s.tikr === leader.tikr);
  const displayName = leaderStock
    ? getCompanyShort({ official_name: leaderStock.name, tikr: leaderStock.tikr })
    : leader.tikr;

  const cmpStr = leader.cmp != null ? fmtRupee(leader.cmp) : "—";
  const headline = `${displayName} — best risk-adjusted`;
  const rationale = buildRationale(leader);

  return (
    <div className="cmp-verdict" role="status" aria-label={`Verdict: ${headline}`}>
      <span className="cmp-verdict-icon" aria-hidden="true">&#x2B50;</span>
      <div className="cmp-verdict-body">
        <p className="cmp-verdict-label">Risk-adjusted verdict</p>
        <h2 className="cmp-verdict-headline is-leader">{headline}</h2>
        <p className="cmp-verdict-rationale">
          {rationale}
          {leader.cmpIsLive && leader.cmp != null && (
            <> &nbsp;&middot;&nbsp; CMP {cmpStr} (live)</>
          )}
        </p>
      </div>
    </div>
  );
}
