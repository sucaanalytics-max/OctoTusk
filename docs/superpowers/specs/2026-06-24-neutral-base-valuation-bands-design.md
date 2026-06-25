# Neutral Base Valuation Bands — Nuvama × Motilal Oswal

**Date:** 2026-06-24
**Type:** Standalone Artifact (self-contained HTML hosted on claude.ai). Not wired into the OctoTusk app; no Do-Not-Touch boundary impact.

## 1. Goal

An interactive "Neutral Base" valuation-band chart comparing **Nuvama Wealth Management** (`NUVAMA.NS`) and **Motilal Oswal Financial Services** (`MOTILALOFS.NS`). Each metric is plotted as a **statistical control chart**: the stock's own historical mean is the *Neutral Base* (z = 0), with control lines at −2σ, −1σ, 0, +1σ, +2σ. Both names are overlaid on one shared normalized axis.

Toggles:
- **Metric:** Price · PE · P/B · MC/Sales · EV/EBITDA
- **Window:** 1Y · 3Y · 5Y (bands recompute per window)

## 2. Why normalized (z-score), not raw

The two names trade at very different absolute levels and Nuvama only has ~3y of history. Plotting raw values would stack their bands at different heights and make overlay unreadable. Normalizing each series to *standard deviations from its own mean over the selected window* puts both on one shared scale, makes the five control lines a single shared set, and directly answers "is this name cheap or rich vs its own history right now?" — which is the point of a Neutral Base chart. Actual values are preserved in the legend/tooltip.

## 3. Data (verified against live Yahoo, 2026-06-24)

Source: `yahoo-finance2` v3 (already a dependency). All data is fetched **at build time** by a one-off script and **baked into the artifact** — the artifact's CSP forbids any runtime network call.

| | Price history | Annual fundamentals | Spot (now) |
|---|---|---|---|
| Motilal Oswal | weekly, since 2019 (5Y ✓) | FY23–FY26 (4 yrs) | ₹935, PE ~30.7x, mcap ₹56,310 Cr, 60.2 Cr shares |
| Nuvama | weekly, since IPO Sep-2023 (~3Y) | FY23–FY26 (4 yrs) | ₹1,736, PE ~30.9x, mcap ₹31,692 Cr, 18.25 Cr shares |

**Binding constraints (carried into the deliverable as labels, not hidden):**
- Quarterly fundamentals only reach ~6 quarters; **annual** reaches 4 yrs → ratio history is annual-granularity for older years, refined to trailing-twelve (TTM) at the live tip.
- **Nuvama has no 5Y** — its "5Y" view shows full available history, labelled "since IPO Sep-2023".
- Motilal annual via `fundamentalsTimeSeries` throws a v3 schema error → use `quoteSummary` (`incomeStatementHistory` + `balanceSheetHistory`, 4 yrs) for Motilal; Nuvama annual FTS works.

## 4. Methodology (hardened after red-team review)

Per stock, build a **weekly time series** of each metric in **raw absolute INR units only** (never reintroduce Cr/lakh — a 1e7 error cancels in num/denom and is invisible to eyeballing), then z-score it over the window.

- **Price** = weekly close.
- **PE** = price ÷ TTM EPS.
- **P/B** = (price × shares) ÷ book value (shareholders' equity).
- **MC/Sales** = (price × shares) ÷ TTM revenue.
- **EV/EBITDA** = (price × shares + net debt) ÷ TTM EBITDA.

**Single canonical data path for BOTH stocks** (`quoteSummary`: incomeStatement/balanceSheet/cashflow history, annual + quarterly; `defaultKeyStatistics`/`price`/`summaryDetail` for cross-checks). Diluted basis throughout. FTS used only as a cross-check. This keeps the two overlaid series apples-to-apples (red-team F7).

**Denominator (TTM) construction:**
- Where **quarterly** data exists (~last 6 quarters): rolling trailing-4-quarter sum → genuine quarterly steps so short windows aren't degenerate (F1/F4).
- Older periods: **annual** figure, stepped by **results-announcement date = fiscal-year-end + 75-day reporting lag** (NOT fiscal-year-end — avoids look-ahead bias, F3).
- Live tip uses latest TTM so it matches Yahoo's spot PE.

**z-score:** for window W, metric m, **per (stock, metric, window)** — never pooled:
- `mean = avg(series_m over W)`, `sd = sampleStdev(series_m over W)` (n−1, F11).
- `z(t) = (series_m(t) − mean) / sd`; control lines at z ∈ {−2,−1,0,+1,+2}.
- Current marker = z of latest point; legend shows actual value, z, and a tag **vs own history** — *Below avg / Around avg / Above avg* (NOT a fair-value/buy call; z=0 is the trailing mean, not proven fair value — these are re-rating names, F2).

**Metric gating (F5):** EV/EBITDA and MC/Sales are weak for broking/wealth/NBFC. If EBITDA ≤ 0 or missing for a stock → that metric is omitted for it (no Infinity). Net-debt sign is recorded; a negative-net-debt (cash-rich) flip is annotated. When EV/EBITDA or MC/Sales is the active metric, an **inline caveat banner** shows (not just a footnote).

**Resolution flag (F1/F4):** if a window has < 3 denominator updates for a stock, badge it "low-resolution — shape ≈ price" so a 1Y ratio band isn't mistaken for a high-information signal.

**Build-time validation (F6/F8):** assert derived mcap ≈ Yahoo `marketCap` (±2%), derived P/B ≈ `priceToBook` (±5%), derived trailing-PE ≈ `trailingPE` (±5%). Also spot-check 2 past dates. Build warns loudly on drift.

Missing data: a stock's line starts where its real data starts (clip-to-available); **effective window labelled per stock** in the legend (e.g. "Nuvama ≈ 2.8y" on the 5Y toggle, F10). No fabricated history. If a stock has < ~8 valid points in a window, it's omitted for that window with a note.

## 5. Build steps

1. **`scripts/fetch-valuation-bands.cjs`** (build-time, run once): fetch weekly closes (full history) + annual fundamentals (Motilal via quoteSummary, Nuvama via FTS) + latest TTM; compute per-week `{date, price, pe, pb, mcs, evEbitda}` for each stock; write a single `bands-data.json`.
2. **Artifact HTML** (written to the session scratchpad, then published): embeds `bands-data.json` inline; renders with hand-rolled inline SVG (no external chart lib — CSP-safe, self-contained). Client computes mean/σ/z per (metric, window) on toggle. Inline CSS/JS only; favicon emoji; responsive with horizontal-scroll guard.
3. Publish via the Artifact tool.

Charting: inline SVG line paths + horizontal control lines on a normalized y-axis (roughly −2.5σ…+2.5σ). Lightweight-charts is *not* used — it can't be inlined under the artifact CSP. A few hundred weekly points render fine as SVG paths.

## 6. UX / layout

- Header: title + "Neutral Base" explainer one-liner.
- Metric toggle row (5 chips) + window toggle row (3 chips).
- One overlay chart: shared σ grid lines (labelled −2/−1/0/+1/+2), green zone < −1σ, red zone > +1σ; Nuvama solid, Motilal dashed; current-value dots.
- Legend table: per stock → current actual value, z, Cheap/Neutral/Rich tag.
- Footnote: data source, as-of date, and the §3 caveats (Nuvama 5Y, financial-firm metric caveat: PE/PB are the meaningful lenses; EV/EBITDA & MC/Sales shown as requested but EBITDA is not a clean operating measure for broking/wealth/NBFC).
- Aesthetic: dark, aligned to OctoTusk dashboard tokens (recreated inline, since globals.css can't be linked).

## 7. Acceptance criteria

- Five metric toggles × three windows all render without error.
- **Build-time**: derived mcap within ±2% of Yahoo `marketCap`; derived P/B within ±5% of `priceToBook`; derived trailing-PE within ±5% of `trailingPE`; 2 past-date spot-checks pass. Build prints a validation report.
- Current actual value + z for both names are sane vs the spot PEs above (tip check).
- Nuvama @ 5Y shows full ~3Y history with a per-stock "≈2.8y / since IPO" label; no fabricated points.
- EV/EBITDA & MC/Sales show the inline caveat banner; omitted (not Infinity) where EBITDA ≤ 0/missing.
- Low-resolution windows (<3 denominator updates) are badged.
- Control lines at exactly −2/−1/0/+1/+2; Neutral Base (0) line visually distinct. σ is sample (n−1), per (stock, metric, window).
- Self-contained: opens with no network calls (CSP-clean), no horizontal page scroll on mobile width.

## 8. Out of scope (YAGNI)

- No live/auto-refresh (data baked at build time; re-run the fetch script to refresh).
- No integration into `app/m/**` or the dashboard.
- No additional stocks beyond the two named.
- No persistence / Supabase / API changes.
