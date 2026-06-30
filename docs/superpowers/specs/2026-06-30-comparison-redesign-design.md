# Comparison page redesign — design spec

**Date:** 2026-06-30
**Scope (editable, NON-frozen):** `app/research/compare/**`, `lib/compare/**`. The dashboard tab mounts `<CompareEmbed>` via the frozen `app/dashboard/DashboardClient.tsx` (4-line embed) — **that file is not touched**; redesigning the isolated tree updates the in-dashboard tab automatically.
**Reference mockup:** `scratchpad/compare-mockup.html` (clickable; signed off).

## Goals (from user)
1. **Clickable, browse-to-select stock picker** — today the picker only reveals options *after* typing 2+ chars; with an empty box there is nothing to click. Make a browseable, always-visible, click-to-add list (sector-filtered); search becomes an optional filter.
2. **Simpler page** — collapse 7 stacked sections to **4 visible + 1 collapsed**.
3. **Clarity on the verdict & scorecard** — surface the scenario *inputs* (bear/base/bull, 1Y, 2Y upside) and *explain the math* (how Exp. return (model) and the ★ risk-adjusted rank are computed), keeping the analyst **Score (1–5)** clearly distinct from the rank.
4. Keep existing **vocabulary** (bear/base/bull, CMP, upside, conviction, VP/SA, model return, Up/Down ratio, downside to bear) and the dashboard guideline (en-IN, `−` U+2212, `—` for null, tokens only, fluid layout, ≤400 lines/file).

## Information architecture (new)
1. **Picker** (`StockPicker.tsx`) — browse-to-select.
2. **Verdict** (`VerdictBanner.tsx`) — leader + why + collapsible "How 'best risk-adjusted' is calculated".
3. **Scorecard** (`ScorecardGrid.tsx`) — per-stock card: CMP, **Upside-vs-CMP strip** (Bear/Base/Bull/1Y/2Y), then 3 derived metrics each with a one-line formula.
4. **Football field** (`FootballField.tsx`) — single chart, kept (light polish only).
5. **One merged comparison table** (NEW `ComparisonTable.tsx`) — replaces `KeyMetrics` + `ValuationGauges` + `InternalVsStreet`. Groups: Price · Our research (bear/base/bull/1Y/2Y + upside%) · Model (exp return, up/down, downside) · Quality (conviction, **Analyst score**, VP, SA) · Multiples (P/E, P/B, EV/EBITDA) · Street (target mean, recommendation, # analysts, trailing/forward P/E). Sticky header + sticky first column, right-aligned numerics.
6. **Full detail (58 rows)** (`DetailTable.tsx`) — kept but **collapsed** behind a `<details>` toggle.

**Removed as standalone:** `ValuationGauges.tsx` / `ValuationGauge.tsx` (redundant with the table) and `InternalVsStreet.tsx` (folded into the merged table). Remove imports from `CompareClient.tsx`; delete the now-orphan components (and their CSS) only if nothing else references them — verify first.

## Picker behaviour (`StockPicker.tsx`)
- Always-visible browse grid of stocks (fluid `auto-fill minmax(...)`), filtered by the existing **sector dropdown** and an **optional** search box.
- Click a card to add; click again / chip × to remove. Selected cards highlighted (`aria-pressed`).
- Preserve current invariants: **max 4** (extras disabled with a hint), chips list, "Clear all", de-dup. State stays `{ selected: string[], query, sector }`.
- Each browse item: short name + TIKR + sector + CMP. Keyboard-accessible `<button>`s, visible focus.

## Scorecard clarity (`ScorecardGrid.tsx`)
- New **"Upside vs CMP"** strip: 5 cells Bear/Base/Bull/1Y/2Y, each colour-coded via `scenarioUpside()`; render `—` when null. Grid uses `minmax(0,1fr)` so it never overflows the card.
- Each derived metric keeps its value + micro-bar and gains a muted one-line formula:
  - **Exp. return (model)** → `conviction N/5 → X% bear · 50% base · Y% bull` (weights from `scenarioWeights()`).
  - **Up / Down ratio** → `base upside ÷ downside to bear — reward per unit of risk`.
  - **Downside to bear** → `how far CMP can fall to the bear case — lower is safer`.
- Keep all four `UpDownNote` states (normal / no-base-upside / below-bear / missing) rendered honestly.

## Verdict clarity (`VerdictBanner.tsx`)
- Keep the leader headline + rationale + tradeoff line.
- Add a collapsible **"How 'best risk-adjusted' is calculated"** explaining, in plain English:
  - **Exp. return (model)** formula with the leader's actual worked example.
  - **The ★ rank** = `45% Up/Down + 40% Exp. return + 15% low Downside-to-bear`, each min-max scored *across the compared set*; never shown as a number.
  - A small per-stock breakdown matrix (bar per dimension) showing *why* the leader won.
  - An explicit note: this rank is **not** the analyst **Score (1–5)** (shown separately in the table) and the Score does not feed the rank.

## Model exposure (`lib/compare/riskAdjusted.ts` + `types.ts`)
- The breakdown matrix needs the three **normalized rank dimensions** per stock. Today `computeScorecard()` computes `nUd/nEr/nCu` internally but only emits `rankScore`. **Extend `ScorecardRow`** with `rankParts: { upDown: number|null; expected: number|null; cushion: number|null }` (the normalized [0,1] values) and populate them. Pure addition — do not change the existing rank math, weights (`0.45/0.40/0.15`), `scenarioWeights`, `upDownRatio`, `convictionWeightedReturn`, `cushionToBear`, or the leader/tie rules. Reuse `scenarioUpside` for every upside calc.

## Styling (`app/research/compare/compare.css`)
- All new classes consume existing `--color-*` / `--text-*` / `--space-*` tokens (no hardcoded hex; `grep -E '#[0-9a-fA-F]{3,6}'` over new CSS must be zero). Light + `[data-theme="dark"]` both correct (compare runs inside the dashboard theme, not `[data-mroot]`).
- No edits to `globals.css`. Fluid only — no new `@media` for layout.

## Guardrails / acceptance
- Frozen boundary untouched (`/boundary-check` clean). No holdings/PII reach this read-only view (it consumes `/api/snapshot`, `/api/quotes`, `/api/enrichment` only).
- Numbers via `lib/format.ts`; `—` for null; signed % 1-dp; `−` U+2212; bear→base→bull order.
- Each file ≤400 lines; `npx tsc --noEmit` clean.
- Behaviour parity: selection (max 4, dedup, clear), CMP live-vs-snapshot guard (`price>0`), lazy enrichment + loading states preserved.

## Out of scope
- No pipeline/Graph/Supabase/`database.json` changes. No new routes. No algorithm changes (rank math is exposed, not altered).
