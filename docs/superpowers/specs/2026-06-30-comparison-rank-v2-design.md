# Comparison rank v2 — horizon + positioning + risk

**Date:** 2026-06-30
**Scope (editable):** `lib/compare/riskAdjusted.ts`, `lib/compare/types.ts`, `lib/compare/buildCompareStock.ts` (only if a dividend-yield field must be surfaced), `app/research/compare/{VerdictBanner,ScorecardGrid,ComparisonTable,comparisonRows}.tsx`, `compare-additions.css`. Frozen files untouched. Branch: `feat/compare-peer-picker`.
**Goal:** rank + verdict driven by **annualized 1Y/2Y expected return** and **position within the bear→bull band (margin of safety)**, plus downside risk and conviction. Fixes the contradictory "wider base-case upside" verdict line.

## Why
Today's rank (45% up/down ratio + 40% conviction-weighted scenario EV at *today's* price + 15% low downside) ignores the **time horizon** (1Y/2Y targets) and **where CMP sits in the band**. v2 makes both first-class. Grounded in: time-weighted return / IRR (CFA/PM practice), margin of safety (Graham, Klarman), asymmetry & risk-first (Marks), expected value (Mauboussin).

## Definitions (all upsides are fractions; reuse `scenarioUpside(price, cmp)`; CMP via `resolveCmp`)
Per stock, with `cmp>0`:
- `uBear,uBase,uBull = scenarioUpside(bear|base|bull, cmp)`
- `u1 = scenarioUpside(target1y, cmp)`, `u2 = scenarioUpside(target2y, cmp)`
- `EV = convictionWeightedReturn(...)` (existing; conviction-weighted bear/base/bull)
- `yield = dividend-yield as a fraction` (from `div_yield`; **optional** — if the field isn't on CompareStock, omit yield and note it; do NOT invent)

### 1. Expected annualized return (`expReturnAnn`) — rank weight 35%
Annualize each available horizon, average the present ones, add yield:
- `ann1 = u1` (already 1y)
- `ann2 = (1 + u2)^(1/2) − 1`
- `annEV = (1 + EV)^(1/H) − 1`, with `H = 2` (documented constant — bear/base/bull are undated "current" intrinsic targets; assume ~2y realization)
- `expReturnAnn = mean(present of {ann1, ann2, annEV}) + (yield ?? 0)`
- If none of u1/u2/EV are computable → `expReturnAnn = null`.

### 2. Margin of safety / positioning (`marginScore`) — rank weight 30%
- `bandPos = (cmp − bear)/(bull − bear)` (reuse `bandPosition`), clamp [0,1].
- `marginScore = 1 − bandPos` (cheap/near-bear → high). **null** when `bull <= bear` (degenerate band) or bear/bull missing.
- Below-bear (`cmp < bear`) → bandPos clamps to 0 → marginScore = 1 (max). Correct: cheapest.
- Also expose `scenarioZone` (existing: cheap/fair/rich) for labels.

### 3. Downside risk (`safetyScore`) — rank weight 20%
- `downside = cushionToBear = (cmp − bear)/cmp` (≥0 = risk; ≤0 = below bear, no downside)
- `dispersion = (bull − bear)/cmp` (uncertainty width; null if bull≤bear)
- `riskRaw = 0.7*max(0, downside) + 0.3*max(0, dispersion ?? 0)` (higher = worse)
- rank dimension uses `minMax(−riskRaw)` (lower risk → higher score). null only if downside null.

### 4. Conviction (`convScore`) — rank weight 15%
- `conviction` (1–5), invalid/out-of-range → null (do NOT clamp a typo to high). `minMax` over present.

## Rank (unchanged machinery, new dimensions)
- Normalize each of the four raw values with the existing `minMax` **across the selected set** (all-equal → 0.5; nulls preserved).
- `rankScore = Σ (w_i/Σw_present) * n_i` over present dims; `w = {return:0.35, margin:0.30, safety:0.20, conviction:0.15}`.
- Leader = unique max when ≥2 stocks; tie → no leader (unchanged).
- **Do not display rankScore as a number** (unchanged).

## ScorecardRow additions (`types.ts`) — additive, non-optional
`expReturnAnn:number|null; ann1:number|null; ann2:number|null; bandPos:number|null; scenarioZone:ScenarioZone|null; dispersion:number|null;` and replace `rankParts` with `{ ret:number|null; margin:number|null; safety:number|null; conviction:number|null }`. Keep existing `expectedReturn` (scenario EV), `upDownRatio`, `cushionToBear` for the table.

## UI
- **VerdictBanner:** rationale built from the new signals, e.g. *"{name} — best risk-adjusted: ~{fmtPct(expReturnAnn)} p.a. to its 1–2Y targets · {zone} in its bear–bull range · {fmtPct(−downside)} downside to bear"*, with a correct vs-runner-up delta on `expReturnAnn`. **Only make comparative claims ("higher/wider/lower") that are arithmetically true** (fixes the bug). Update the "How it's calculated" panel: replace the rank-breakdown matrix columns with the 4 new dimensions (Return p.a. / Margin / Safety / Conviction) and explain each in one line.
- **ScorecardGrid:** headline metric becomes **"Exp. return p.a."** (`expReturnAnn`); add a **"Position in range"** chip (scenarioZone + bandPos as a small marker); keep the Bear/Base/Bull/1Y/2Y upside strip; keep "Downside to bear". Drop the standalone "Up/Down ratio" tile (positioning subsumes it) — or keep if it fits cleanly. Conviction stays.
- **ComparisonTable (Model group):** show Exp. return p.a., Position in range (zone), Downside to bear (keep winner-highlight + bars; "Exp. return p.a." gets a signed bar, goal max).

## Guardrails / acceptance
- Reuse `scenarioUpside`/`bandPosition`/`scenarioZone`/`convictionWeightedReturn`/`cushionToBear`/`scenarioWeights`/`minMax`; don't re-derive.
- Edge cases covered: missing targets, `bull<=bear`, below-bear, null conviction, cmp≤0, EV null, yield absent.
- `npx tsc --noEmit` clean; tokens only; files ≤400; bear→base→bull order; `—` for null.
- New CSS into `compare-additions.css` (loaded on both embed + standalone).
- No frozen-file edits; read-only data surface unchanged.
