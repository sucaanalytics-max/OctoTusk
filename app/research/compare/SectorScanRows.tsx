"use client";
// Leaderboard table for Sector Scan — extracted from SectorScanView to keep it under 400 lines.
// Pure presentational: receives already-sorted rows + the combo (covered+manual) stock set.
// Range-bar cells carry data-tikr so ScenarioTip's delegated wrapper (mounted in
// SectorScanView) can show the Bear/Base/Bull/1Y/2Y tooltip on hover/click/focus.

import { memo } from "react";
import { fmtRupee, fmtPct, fmtPctRaw } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";
import { getCompanyShort } from "@/lib/companyName";
import type { CompareStock, CompareQuotesMap, ScorecardRow } from "@/lib/compare/types";
import type { ScanFlag } from "./sectorScan";

const FLAG_LABEL: Record<ScanFlag, string> = {
  "below-bear": "BELOW BEAR",
  "buy-watch": "BUY WATCH",
  "above-bull": "ABOVE BULL",
  "trim-watch": "TRIM WATCH",
  stale: "STALE",
};
const FLAG_CLASS: Record<ScanFlag, string> = {
  "below-bear": "is-below-bear",
  "buy-watch": "is-buy-watch",
  "above-bull": "is-above-bull",
  "trim-watch": "is-trim-watch",
  stale: "is-stale",
};
const ZONE_LABEL: Record<string, string> = { cheap: "Cheap", fair: "Fair", rich: "Rich" };

interface Props {
  rows: ScorecardRow[]; // pre-sorted
  stocks: CompareStock[]; // combo (covered + manual) set, for name/price/sector lookups
  quotes: CompareQuotesMap;
  flagsByTikr: Record<string, ScanFlag[]>;
  manualTikrs: string[];
}

function valCell(up: number | null): { text: string; cls: string } {
  if (up == null) return { text: "—", cls: "cmp-lb-val is-muted" };
  return { text: fmtPct(up), cls: `cmp-lb-val ${up >= 0 ? "is-pos" : "is-neg"}` };
}

function SectorScanRows({ rows, stocks, quotes, flagsByTikr, manualTikrs }: Props) {
  const byTikr = new Map(stocks.map((s) => [s.tikr, s]));
  const manualSet = new Set(manualTikrs);

  return (
    <div className="cmp-lb-scroll">
      <table className="cmp-lb-table">
        <thead>
          <tr>
            <th className="cmp-lb-rank-h">#</th>
            <th className="cmp-lb-name-h">Company</th>
            <th className="cmp-lb-range-h">Range (bear&rarr;bull)</th>
            <th>Downside</th>
            <th>1Y</th>
            <th>2Y</th>
            <th>Position</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const stock = byTikr.get(row.tikr);
            if (!stock) return null;
            const short = getCompanyShort({ official_name: stock.name, tikr: stock.tikr });
            const quote = quotes[stock.tikr];
            const dayText = row.cmpIsLive && quote ? fmtPctRaw(quote.changePct) : null;
            const dayCls = dayText != null && quote && quote.changePct < 0 ? "is-neg" : "is-pos";

            const bp = row.bandPos;
            const hasBand = bp != null;
            const dnW = hasBand ? Math.max(0, Math.min(100, bp * 100)) : 0;
            const upW = 100 - dnW;

            const downside = row.cushionToBear;
            const downsideCell =
              downside == null
                ? { text: "—", cls: "cmp-lb-val is-muted" }
                : downside <= 0
                ? { text: "below bear", cls: "cmp-lb-val is-pos" }
                : { text: fmtPct(-downside), cls: "cmp-lb-val is-warn" };

            const u1 = valCell(scenarioUpside(stock.target1y, row.cmp));
            const u2 = valCell(scenarioUpside(stock.target2y, row.cmp));

            const zone = row.scenarioZone;
            const flags = flagsByTikr[stock.tikr] ?? [];
            const isManual = manualSet.has(stock.tikr);

            return (
              <tr key={stock.tikr}>
                <td className="cmp-lb-rank">{i + 1}</td>
                <td className="cmp-lb-name-cell">
                  <div className="cmp-lb-name">
                    {short}
                    {isManual && <span className="cmp-lb-added">ADDED</span>}
                    {!hasBand && <span className="cmp-lb-noband">NO BAND</span>}
                  </div>
                  <div className="cmp-lb-sub">
                    {stock.tikr} &middot; {row.cmp != null ? fmtRupee(row.cmp) : "—"}
                    {dayText != null && <span className={dayCls}> &middot; {dayText}</span>}
                  </div>
                </td>
                <td className="cmp-lb-range-cell">
                  <span
                    className="cmp-lb-range"
                    data-tikr={stock.tikr}
                    tabIndex={0}
                    role="button"
                    aria-label={`Show bear, base, bull for ${short}`}
                  >
                    {hasBand ? (
                      <>
                        <span className="cmp-lb-range-seg-dn" style={{ width: `${dnW}%` }} />
                        <span className="cmp-lb-range-seg-up" style={{ left: `${dnW}%`, width: `${upW}%` }} />
                        <span className="cmp-lb-range-dot" style={{ left: `${dnW}%` }} />
                      </>
                    ) : (
                      <span className="cmp-lb-range-empty">no band</span>
                    )}
                  </span>
                </td>
                <td className={downsideCell.cls}>{downsideCell.text}</td>
                <td className={u1.cls}>{u1.text}</td>
                <td className={u2.cls}>{u2.text}</td>
                <td>
                  {zone != null ? (
                    <span className={`cmp-vt-range-verdict is-${zone}`}>{ZONE_LABEL[zone]}</span>
                  ) : (
                    <span className="cmp-lb-val is-muted">—</span>
                  )}
                </td>
                <td>
                  <div className="cmp-lb-flags">
                    {flags.length === 0 ? (
                      <span className="cmp-lb-val is-muted">—</span>
                    ) : (
                      flags
                        .slice(0, 3)
                        .map((f) => (
                          <span key={f} className={`cmp-lb-flag ${FLAG_CLASS[f]}`}>
                            {FLAG_LABEL[f]}
                          </span>
                        ))
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Memoized: SectorScanView's tip-position state re-renders lives in a sibling (the wrapper
// div's tip node), not here — rows/stocks/quotes/flagsByTikr/manualTikrs are all useMemo'd
// upstream, so a tip-only re-render leaves every prop reference unchanged and this bails out.
export default memo(SectorScanRows);
