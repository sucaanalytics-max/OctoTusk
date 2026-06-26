// The analytical core of the comparison page: risk-adjusted decision metrics.
//
// Design notes (verified in a pre-build red-team against data/database.json + the quotes API):
//  - quote.price can be 0 on a Yahoo miss (app/api/quotes/route.ts) — CMP must be guarded > 0, not != null.
//  - conviction is unvalidated spreadsheet input — out-of-range / non-finite values must NOT silently
//    clamp into a plausible probability; they fall back to a neutral tilt.
//  - scenario weights are STRICTLY POSITIVE (base anchored at 0.50; conviction tilts the tails), so
//    renormalizing around a missing scenario can never divide by zero.
//  - "below bear" (cmp < bear) is the BEST case (whole band is upside), not a data gap — it is surfaced
//    explicitly and ranked at the top of the up/down dimension, never rendered as "—".
//
// Reuses lib/scenarioUpside.ts for every upside calc (the sanctioned re-expression of the frozen
// monolith's logic). This module is orchestration only — it never imports DashboardClient.

import { scenarioUpside } from "@/lib/scenarioUpside";
import type { CompareStock, CompareQuote, ScorecardRow, UpDownNote } from "./types";

/**
 * Resolve CMP: prefer a live quote price > 0, else the snapshot cmp (> 0), else null.
 * The > 0 guard is essential — /api/quotes emits price: 0 when Yahoo has no print.
 */
export function resolveCmp(
  stock: CompareStock,
  quote?: CompareQuote | null
): { cmp: number | null; isLive: boolean } {
  if (quote && Number.isFinite(quote.price) && quote.price > 0) return { cmp: quote.price, isLive: true };
  return { cmp: stock.cmp, isLive: false };
}

/**
 * Scenario probability weights from conviction. Base case anchored at 0.50 (it is the central
 * scenario); conviction tilts the tails:
 *   t = (conv − 3) / 2   for conv ∈ [1,5]   (3 → neutral, 5 → +1, 1 → −1)
 *   pBull = 0.25 + 0.20·t   ∈ [0.05, 0.45]
 *   pBear = 0.25 − 0.20·t   ∈ [0.05, 0.45]
 *   pBase = 0.50
 * Every weight is strictly positive and the three sum to 1. Invalid / out-of-range / null conviction
 * → neutral (t = 0), i.e. 0.25 / 0.50 / 0.25 — never a clamped typo masquerading as high conviction.
 */
export function scenarioWeights(conviction: number | null): { pBear: number; pBase: number; pBull: number } {
  let t = 0;
  if (conviction != null && Number.isFinite(conviction) && conviction >= 1 && conviction <= 5) {
    t = (conviction - 3) / 2;
  }
  return { pBear: 0.25 - 0.2 * t, pBase: 0.5, pBull: 0.25 + 0.2 * t };
}

/**
 * Up/Down ratio = base-case upside ÷ bear-case downside (both as positive magnitudes). Higher = better.
 * Returns a value + a note so the UI can render honestly:
 *   "normal"        — a real ratio
 *   "no-base-upside"— value 0 (base ≤ cmp): meaningful, distinct from missing
 *   "below-bear"    — cmp < bear: entire band is upside (best case), ratio is undefined/∞
 *   "missing"       — cmp or bear unusable
 */
export function upDownRatio(
  cmp: number | null,
  bear: number | null,
  base: number | null
): { value: number | null; note: UpDownNote } {
  if (cmp == null || cmp <= 0 || bear == null) return { value: null, note: "missing" };
  if (cmp <= bear) return { value: null, note: "below-bear" };
  const bearDown = (cmp - bear) / cmp; // > 0 here
  if (base == null) return { value: null, note: "missing" };
  const baseUp = Math.max(0, (base - cmp) / cmp);
  if (baseUp === 0) return { value: 0, note: "no-base-upside" };
  return { value: baseUp / bearDown, note: "normal" };
}

/**
 * Conviction-weighted expected return (fraction). Drops any missing scenario and renormalizes the
 * surviving weights — safe because no weight is ever 0. Labeled "(model)" in the UI.
 */
export function convictionWeightedReturn(
  cmp: number | null,
  bear: number | null,
  base: number | null,
  bull: number | null,
  conviction: number | null
): number | null {
  if (cmp == null || cmp <= 0) return null;
  const w = scenarioWeights(conviction);
  const terms: Array<{ p: number; up: number }> = [];
  const ub = scenarioUpside(bear, cmp); if (ub != null) terms.push({ p: w.pBear, up: ub });
  const u0 = scenarioUpside(base, cmp); if (u0 != null) terms.push({ p: w.pBase, up: u0 });
  const uB = scenarioUpside(bull, cmp); if (uB != null) terms.push({ p: w.pBull, up: uB });
  const wsum = terms.reduce((s, x) => s + x.p, 0);
  if (terms.length === 0 || wsum <= 0) return null;
  return terms.reduce((s, x) => s + (x.p / wsum) * x.up, 0);
}

/**
 * Downside to the bear case: (cmp − bear) / cmp.
 * > 0 = room to fall before hitting bear (this much potential downside — RISK);
 * < 0 = CMP already below bear (deep value, no further downside to bear).
 * Surfaced in the UI as "Downside to bear" (risk; lower is safer), colour + rank agree: the rank
 * rewards LOW downside (minMax(−cushion) below), so a smaller value reads as safer everywhere.
 */
export function cushionToBear(cmp: number | null, bear: number | null): number | null {
  if (cmp == null || cmp <= 0 || bear == null) return null;
  return (cmp - bear) / cmp;
}

const RANK_WEIGHTS = { upDown: 0.45, expected: 0.4, cushion: 0.15 } as const;

/** Min-max normalize to [0,1] across finite entries; all-equal (max==min) → 0.5; nulls stay null. */
function minMax(values: Array<number | null>): Array<number | null> {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length === 0) return values.map(() => null);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max === min) return values.map((v) => (v == null ? null : 0.5));
  return values.map((v) => (v == null ? null : (v - min) / (max - min)));
}

/**
 * Build the full scorecard for the compared set: per-stock metrics, a composite rank, and a single
 * highlighted leader. Rank rewards a risk-adjusted profile: high up/down, high expected return, and
 * proximity to (or below) the bear floor (low cushion = limited downside). Highlight only — rankScore
 * is never displayed as a number. No leader when < 2 stocks or on a tie.
 */
export function computeScorecard(
  stocks: CompareStock[],
  quotes?: Record<string, CompareQuote>
): ScorecardRow[] {
  const raw = stocks.map((s) => {
    const { cmp, isLive } = resolveCmp(s, quotes?.[s.tikr]);
    return {
      tikr: s.tikr,
      cmp,
      cmpIsLive: isLive,
      ud: upDownRatio(cmp, s.bear, s.base),
      er: convictionWeightedReturn(cmp, s.bear, s.base, s.bull, s.conviction),
      cushion: cushionToBear(cmp, s.bear),
    };
  });

  // Up/down rank dimension: below-bear is the best case → sits above every finite ratio.
  const finiteRatios = raw
    .map((r) => (r.ud.note === "normal" ? r.ud.value : null))
    .filter((v): v is number => v != null);
  const maxRatio = finiteRatios.length ? Math.max(...finiteRatios) : 0;
  const udRankVals = raw.map((r) => {
    if (r.ud.note === "below-bear") return maxRatio + 1;
    if (r.ud.note === "no-base-upside") return 0;
    if (r.ud.note === "normal") return r.ud.value;
    return null;
  });

  const nUd = minMax(udRankVals);
  const nEr = minMax(raw.map((r) => r.er));
  // Lower cushion (closer to / below bear) = better → negate before normalizing.
  const nCu = minMax(raw.map((r) => (r.cushion == null ? null : -r.cushion)));

  const rankScores = raw.map((_, i) => {
    const parts: Array<{ w: number; v: number }> = [];
    if (nUd[i] != null) parts.push({ w: RANK_WEIGHTS.upDown, v: nUd[i] as number });
    if (nEr[i] != null) parts.push({ w: RANK_WEIGHTS.expected, v: nEr[i] as number });
    if (nCu[i] != null) parts.push({ w: RANK_WEIGHTS.cushion, v: nCu[i] as number });
    const wsum = parts.reduce((s, p) => s + p.w, 0);
    if (parts.length === 0 || wsum <= 0) return null;
    return parts.reduce((s, p) => s + (p.w / wsum) * p.v, 0);
  });

  let leaderIdx = -1;
  if (stocks.length >= 2) {
    let best = -Infinity;
    let bestCount = 0;
    rankScores.forEach((rs, i) => {
      if (rs == null) return;
      if (rs > best) { best = rs; leaderIdx = i; bestCount = 1; }
      else if (rs === best) bestCount += 1;
    });
    if (bestCount !== 1) leaderIdx = -1; // tie → no single leader
  }

  return raw.map((r, i) => ({
    tikr: r.tikr,
    cmp: r.cmp,
    cmpIsLive: r.cmpIsLive,
    upDownRatio: r.ud.value,
    upDownNote: r.ud.note,
    expectedReturn: r.er,
    cushionToBear: r.cushion,
    rankScore: rankScores[i],
    isLeader: i === leaderIdx,
  }));
}
