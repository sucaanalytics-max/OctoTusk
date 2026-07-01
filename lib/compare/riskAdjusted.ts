// The analytical core of the comparison page: risk-adjusted decision metrics.
//
// v2 (2026-06-30): rank dimensions replaced with annualized return (35%), margin of safety (30%),
// downside risk / safety (20%), and conviction (15%). The old 3-dim weights (upDown/expected/cushion)
// are retired; upDownRatio, expectedReturn, and cushionToBear are kept for backward-compat
// with the comparison table rows.
//
// Design notes (verified in a pre-build red-team against data/database.json + the quotes API):
//  - quote.price can be 0 on a Yahoo miss (app/api/quotes/route.ts) — CMP must be guarded > 0.
//  - conviction is unvalidated spreadsheet input — out-of-range / non-finite values must NOT
//    silently clamp into a plausible probability; they fall back to a neutral tilt.
//  - div_yield is a percent (not fraction) and currently 0 across the universe; any future yield
//    term must divide by 100. Hard-wired to 0 here as it carries no signal.
//  - "below bear" (cmp < bear) is the BEST case (whole band is upside), not a data gap.
//  - degenerate band (bull <= bear): marginScore and dispersion are null; bandPos stays for UI.
//
// Reuses lib/scenarioUpside.ts for every upside calc. Never imports DashboardClient.

import {
  scenarioUpside,
  bandPosition,
  scenarioZone,
} from "@/lib/scenarioUpside";
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
 * Kept for backward-compat: the comparison table's "Exp. return (model)" row still uses this.
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
 * > 0 = room to fall before hitting bear (potential downside — RISK);
 * < 0 = CMP already below bear (deep value, no further downside to bear).
 */
export function cushionToBear(cmp: number | null, bear: number | null): number | null {
  if (cmp == null || cmp <= 0 || bear == null) return null;
  return (cmp - bear) / cmp;
}

/**
 * Annualize a fractional upside over `years`. Returns null when the base is non-positive
 * (negative total return that exceeds -100%), guarding against NaN from Math.pow.
 */
function annualize(u: number | null, years: number): number | null {
  if (u == null) return null;
  if (1 + u <= 0) return null; // negative-base guard
  return Math.pow(1 + u, 1 / years) - 1;
}

/**
 * Compute the annualized expected return for a single stock.
 * Blends ann1 (1Y), ann2 (2Y annualized), and annEV (scenario EV annualized over 2Y).
 * div_yield is a percent (not fraction) and currently 0 across the universe;
 * any future yield term must divide by 100. Hard-wired to 0 here.
 */
function expectedReturnAnn(
  cmp: number | null,
  bear: number | null,
  base: number | null,
  bull: number | null,
  target1y: number | null,
  target2y: number | null,
  conviction: number | null
): { expReturnAnn: number | null; ann1: number | null; ann2: number | null } {
  const u1 = scenarioUpside(target1y, cmp);
  const u2 = scenarioUpside(target2y, cmp);
  const EV = convictionWeightedReturn(cmp, bear, base, bull, conviction);

  const ann1 = u1; // already 1Y
  const ann2 = annualize(u2, 2);
  const annEV = annualize(EV, 2);

  const present = [ann1, ann2, annEV].filter(
    (v): v is number => v != null && Number.isFinite(v)
  );

  if (present.length === 0) return { expReturnAnn: null, ann1, ann2 };
  const mean = present.reduce((s, v) => s + v, 0) / present.length;
  // div_yield omitted (see module comment above)
  return { expReturnAnn: mean, ann1, ann2 };
}

/** Min-max normalize to [0,1] across finite entries; all-equal (max==min) → 0.5; nulls stay null. */
function minMax(values: Array<number | null>): Array<number | null> {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length === 0) return values.map(() => null);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max === min) return values.map((v) => (v == null ? null : 0.5));
  return values.map((v) => (v == null ? null : (v - min) / (max - min)));
}

const RANK_WEIGHTS = { ret: 0.35, margin: 0.30, safety: 0.20, conviction: 0.15 } as const;

/**
 * Build the full scorecard for the compared set: per-stock metrics, a composite rank, and a single
 * highlighted leader. Rank rewards: high annualized return (35%), position near/below bear (30%),
 * low downside risk (20%), high conviction (15%). Highlight only — rankScore never displayed as a
 * number. No leader when < 2 stocks or on a tie.
 *
 * Leader eligibility (red-team fix): a row qualifies only when expReturnAnn != null AND at least
 * 2 of the 4 normalized dims are non-null. Non-eligible rows still receive a rankScore for sorting.
 */
export function computeScorecard(
  stocks: CompareStock[],
  quotes?: Record<string, CompareQuote>
): ScorecardRow[] {
  // ── Per-stock raw metrics ──────────────────────────────────────────────────
  const raw = stocks.map((s) => {
    const { cmp, isLive } = resolveCmp(s, quotes?.[s.tikr]);

    // Up/down ratio (kept for table compat)
    const ud = upDownRatio(cmp, s.bear, s.base);
    // Conviction-weighted EV (kept for table compat)
    const er = convictionWeightedReturn(cmp, s.bear, s.base, s.bull, s.conviction);
    // Downside cushion (kept for table compat + safety dim)
    const cushion = cushionToBear(cmp, s.bear);

    // v2 annualized return
    const { expReturnAnn, ann1, ann2 } = expectedReturnAnn(
      cmp, s.bear, s.base, s.bull, s.target1y, s.target2y, s.conviction
    );

    // Positioning
    const bp = bandPosition(cmp, s.bear, s.bull);
    const zone = scenarioZone(cmp, s.bear, s.bull);
    const degenerate = s.bear == null || s.bull == null || s.bull <= s.bear;
    const marginScore = degenerate || bp == null ? null : 1 - bp;
    const dispersion =
      degenerate || cmp == null || cmp <= 0
        ? null
        : (s.bull! - s.bear!) / cmp;

    // Safety / risk dim
    const downside = cushion; // (cmp - bear) / cmp
    const riskRaw =
      downside == null
        ? null
        : 0.7 * Math.max(0, downside) + 0.3 * Math.max(0, dispersion ?? 0);
    const safetyRaw = riskRaw == null ? null : -riskRaw;

    // Conviction (validated)
    const convRaw =
      s.conviction != null && Number.isFinite(s.conviction) &&
      s.conviction >= 1 && s.conviction <= 5
        ? s.conviction
        : null;

    return {
      tikr: s.tikr,
      cmp,
      cmpIsLive: isLive,
      ud,
      er,
      cushion,
      expReturnAnn,
      ann1,
      ann2,
      bandPos: bp,
      zone,
      marginScore,
      dispersion,
      safetyRaw,
      convRaw,
    };
  });

  // ── Normalize each dimension across the set ────────────────────────────────
  const nRet = minMax(raw.map((r) => r.expReturnAnn));
  const nMargin = minMax(raw.map((r) => r.marginScore));
  const nSafety = minMax(raw.map((r) => r.safetyRaw));
  const nConv = minMax(raw.map((r) => r.convRaw));

  // ── Composite rank score (renormalized over present dims) ─────────────────
  const rankScores = raw.map((_, i) => {
    const parts: Array<{ w: number; v: number }> = [];
    if (nRet[i] != null) parts.push({ w: RANK_WEIGHTS.ret, v: nRet[i] as number });
    if (nMargin[i] != null) parts.push({ w: RANK_WEIGHTS.margin, v: nMargin[i] as number });
    if (nSafety[i] != null) parts.push({ w: RANK_WEIGHTS.safety, v: nSafety[i] as number });
    if (nConv[i] != null) parts.push({ w: RANK_WEIGHTS.conviction, v: nConv[i] as number });
    const wsum = parts.reduce((s, p) => s + p.w, 0);
    if (parts.length === 0 || wsum <= 0) return null;
    return parts.reduce((s, p) => s + (p.w / wsum) * p.v, 0);
  });

  // ── Leader: unique max among ELIGIBLE rows, ≥2 stocks ─────────────────────
  // Eligibility: expReturnAnn != null AND at least 2 of 4 dims non-null.
  const eligible = raw.map((_, i) => {
    if (raw[i].expReturnAnn == null) return false;
    const presentDims = [nRet[i], nMargin[i], nSafety[i], nConv[i]].filter(
      (v) => v != null
    ).length;
    return presentDims >= 2;
  });

  let leaderIdx = -1;
  if (stocks.length >= 2) {
    let best = -Infinity;
    let bestCount = 0;
    rankScores.forEach((rs, i) => {
      if (rs == null || !eligible[i]) return;
      if (rs > best) { best = rs; leaderIdx = i; bestCount = 1; }
      else if (rs === best) bestCount += 1;
    });
    if (bestCount !== 1) leaderIdx = -1; // tie → no single leader
  }

  // ── Assemble output rows ───────────────────────────────────────────────────
  return raw.map((r, i) => ({
    tikr: r.tikr,
    cmp: r.cmp,
    cmpIsLive: r.cmpIsLive,
    upDownRatio: r.ud.value,
    upDownNote: r.ud.note,
    expectedReturn: r.er,
    cushionToBear: r.cushion,
    rankScore: rankScores[i],
    expReturnAnn: r.expReturnAnn,
    ann1: r.ann1,
    ann2: r.ann2,
    bandPos: r.bandPos,
    scenarioZone: r.zone,
    dispersion: r.dispersion,
    rankParts: {
      ret: nRet[i],
      margin: nMargin[i],
      safety: nSafety[i],
      conviction: nConv[i],
    },
    isLeader: i === leaderIdx,
  }));
}
