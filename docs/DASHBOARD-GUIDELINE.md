# Tusk Dashboard Design Guideline

> Standardised template for everyone building dashboards on top of the OctoTusk pipeline.
> Source of truth lives in code. This doc points to it and prescribes how to use it.

**Audience:** internal Tusk analysts + the engineers building with them.
**Scope:** visual + components + layout, data presentation, information architecture, engineering conventions.
**Excel is the visual rigor benchmark.** "Excel made beautiful" — every choice below traces back to how a clean financial spreadsheet presents numbers.

---

## 1. When to use which aesthetic

Two visual systems coexist in the repo. Pick **one per page** — never mix.

| Need | Use **Octopus** | Use **Dashboard** |
|---|:-:|:-:|
| Full-screen wall display, single audience-facing view | ✓ | |
| Analyst working tool with tabs, dense controls, P&L tables | | ✓ |
| Print / export / screenshot-into-deck-ready | ✓ | |
| Light + dark mode required | | ✓ |
| Editorial broadsheet feel (serif headlines, paper canvas) | ✓ | |
| Familiar product-UI feel with cards + chips | | ✓ |
| Modular files, every component ≤ 300 lines | ✓ | aspirational |

**Decision rule:** if the screen will be projected, presented, or screenshotted, use Octopus. If it's a clickable workbench, use Dashboard.

**Anchor references:**
- Octopus → [app/octopus/](../app/octopus/) (modular, 13 files, longest is 493 lines)
- Dashboard → [app/dashboard/](../app/dashboard/) (legacy; `DashboardClient.tsx` is 4,811 lines and is the anti-pattern — do not copy its structure)

---

## 2. Excel as the visual rigor benchmark

The aesthetic baseline is the way a clean Excel sheet presents financial data. The rules below are non-negotiable for any view rendering numbers from the OctoTusk Excel inputs (`JVB Output.xlsx`, `*_vf.xlsx`).

- **Alignment.** Right-align all numerics. Left-align labels. Centre nothing except short status glyphs.
- **Sticky headers.** Every table has a sticky header row. Stock tables also stick the first column (TIKR / name).
- **Decimals.** One decimal in displays. Two decimals in tooltips and exports. Never zero, never three.
- **Negatives.** Use the minus-sign character `−` (U+2212), or wrap in parentheses for currency totals. Never a hyphen-minus, never a leading `-` on a different baseline.
- **Currency.** INR with `₹` prefix. `Cr` for ≥ 1 crore. `L` (Lakh) for 1 lakh – < 1 Cr. Plain rupees below that. Never paise.
- **Thousands separator.** `en-IN` locale (`1,23,45,678`), not `1,234,567`.
- **Column groups.** Separate groups (bear / base / bull) with a single vertical rule, not whitespace. Mirrors Excel gridlines.
- **Row striping.** None in Octopus. Optional 4 % row tint in Dashboard, only if scan density requires it.
- **Traceability.** Every visible number should trace back to an Excel cell. Where the audience may verify, expose the source sheet + cell in a tooltip or footnote.

---

## 3. Design tokens (verbatim from `app/globals.css`)

**Never hardcode hex.** Always reference a token. If a colour you need is missing, propose it via PR — don't add a one-off.

### 3.1 Dashboard system — `:root`, lines 11–102

```css
/* Backgrounds */
--color-bg-primary: #F8F9FB;       --color-bg-secondary: #FFFFFF;
--color-bg-card: #FFFFFF;          --color-bg-card-alt: #F3F4F6;
--color-bg-hover: #EEF0F4;         --color-bg-input: #FFFFFF;
--color-bg-elevated: #F0F2F5;

/* Borders */
--color-border: #D9DCE3;           --color-border-subtle: #E5E7EB;
--color-border-hover: #B0B5C0;

/* Text */
--color-text-primary: #111827;     --color-text-secondary: #4B5563;
--color-text-muted: #9CA3AF;       --color-text-inverse: #FFFFFF;

/* Accents */
--color-accent-blue: #2563EB;      --color-accent-blue-hover: #1D4ED8;
--color-accent-tusk: #e94560;      --color-accent-tusk-hover: #d63a55;

/* Semantic */
--color-positive: #059669;  --color-positive-bg: rgba(5,150,105,0.08);
--color-negative: #DC2626;  --color-negative-bg: rgba(220,38,38,0.06);
--color-warning:  #D97706;  --color-warning-bg:  rgba(217,119,6,0.08);
--color-info:     #2563EB;  --color-info-bg:     rgba(37,99,235,0.06);

/* Chart palette */
--color-chart-1..6: #2563EB, #059669, #D97706, #e94560, #7C3AED, #DB2777;

/* Segment palette (market cap buckets) */
--color-segment-large:  #2563EB;  --color-segment-mid:   #059669;
--color-segment-small:  #D97706;  --color-segment-micro: #e94560;
--color-segment-unclassified: #6B7280;

/* Type scale */
--text-xs: 0.6875rem (11px)   --text-sm: 0.8125rem (13px)
--text-base: 0.9375rem (15px) --text-lg: 1.125rem (18px)
--text-xl: 1.375rem (22px)    --text-2xl: 1.75rem (28px)
--text-3xl: 2.25rem (36px)

/* Spacing scale */
--space-1: 4px    --space-2: 8px    --space-3: 12px   --space-4: 16px
--space-5: 20px   --space-6: 24px   --space-8: 32px   --space-10: 40px
--space-12: 48px

/* Radius */
--radius-sm: 6px   --radius-md: 10px   --radius-lg: 16px
--radius-xl: 20px  --radius-full: 9999px

/* Shadow */
--shadow-card:      0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
--shadow-elevated:  0 4px 16px rgba(0,0,0,0.1);
--shadow-glow-green / red / blue: 0 0 20px rgba(...);

/* Motion */
--transition-fast:   150ms cubic-bezier(0.4,0,0.2,1);
--transition-normal: 250ms cubic-bezier(0.4,0,0.2,1);
--transition-slow:   400ms cubic-bezier(0.4,0,0.2,1);
```

Dark-mode counterparts at `.dark { … }` (lines 109–146) — paper-to-ink inversion with brighter semantic colours (positive `#00C48C`, negative `#FF4B4B`, warning `#FFB800`).

### 3.2 Octopus system — `.octopus-root`, lines 1305–1327

Scoped tokens only — do not leak outside the Octopus subtree.

```css
--ox-canvas: #FAF8F4    /* warm paper */
--ox-paper:  #FFFFFF
--ox-ink:    #1B2434    --ox-ink-soft: #475467   --ox-ink-mute: #8A95A4
--ox-rule:   #E7E3DC    --ox-rule-strong: #D1CCC2
--ox-pos:    #0F7A3C    --ox-pos-bg: #E8F4ED
--ox-neg:    #A82828    --ox-neg-bg: #F5E6E6
--ox-warning:#B45309    --ox-warning-bg: #FDF4E3
--ox-accent: var(--color-accent-tusk)

/* Font stacks */
--ox-font-sans: var(--font-geist-sans), 'Geist', -apple-system, …
--ox-font-mono: var(--font-geist-mono), 'Geist Mono', 'JetBrains Mono', …
--ox-serif:     var(--font-serif), 'Newsreader', 'Source Serif Pro', Georgia, …

/* Fluid type scale (all clamp()) */
--ox-text-display: clamp(34px, 3vw,    56px)
--ox-text-hero:    clamp(22px, 1.9vw,  34px)
--ox-text-body:    clamp(14px, 1.05vw, 18px)
--ox-text-meta:    clamp(10px, 0.8vw,  13px)
--ox-text-caption: clamp(10px, 0.75vw, 12px)
```

---

## 4. Layout & responsiveness

**Default: fluid, no breakpoints.**

| Pattern | Where | Rule |
|---|---|---|
| Full-bleed wall | `.octopus-root` | `width:100vw; height:100vh; overflow:hidden;` outer grid `auto auto 1fr` with `clamp()` gaps + padding. Zero `@media`. |
| KPI grid | `.kpi-grid` | `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));` — collapses 8→4→2 col without media queries. |
| Scenario grid | `.pnl-scenario-grid` | `repeat(3, 1fr)` — bear / base / bull. |
| SVG charts | anywhere | `viewBox` + CSS `max-width: 100%`. Never fixed pixel widths. |
| Type | anywhere | `clamp(min, prefer, max)` — see §3.2 for the canonical scale. |

**Do not add `@media` breakpoints to new code.** Dashboard ships three legacy blocks (`1024px / 768px / 480px`); they stay only until those sections are refactored. New code uses `clamp()`, `auto-fill / minmax()`, and `viewBox` instead.

---

## 5. Component catalogue

Each entry: when to use → file reference → gotchas.

**Never duplicate. Extend via props — never fork.** If a component doesn't fit, add a prop or extract a subcomponent; do not copy-paste it under a new name.

### Cards & badges
- **KPI card** — `.kpi-card` + `.kpi-positive / negative / warning / accent / purple` ([globals.css:329](../app/globals.css)). Left-edge accent bar via `::before`. Use for top-of-page summary metrics. **Max 8 per row.**
- **Pill / badge** — `.pill` + `.pill-green / red / amber / blue / gray / purple` ([globals.css:296](../app/globals.css)). For sector tags, status flags, signed deltas inline.
- **Metric card** — `.metric-card` ([globals.css:313](../app/globals.css)). The generic card chrome. Lift to `.kpi-card` when there's a single headline number.

### Navigation
- **Tab bar** — `.tab-bar`, `.tab-btn`, `.tab-active` ([globals.css:399](../app/globals.css)). Flat bottom-hairline + underline indicator via `::after`. **Max 5 tabs.** Need more? Use a sidebar or nested tabs.
- **Command palette** — [app/octopus/CommandPalette.tsx](../app/octopus/CommandPalette.tsx). ⌘K-style search. **Mandatory** on any dashboard with > 20 navigable entities.
- **Index strip** — [app/octopus/IndexStrip.tsx](../app/octopus/IndexStrip.tsx). Top-of-page market context (NIFTY / SENSEX).

### Tables
- **Stock table** — [app/octopus/StockTable.tsx](../app/octopus/StockTable.tsx), [StockUpsideTable.tsx](../app/octopus/StockUpsideTable.tsx). Sticky header, right-aligned numerics, `fmtPctSigned` with explicit `+` sign, colour-coded upside via `pctClass()`.
- **Stock pills** — [app/octopus/StockPills.tsx](../app/octopus/StockPills.tsx). Horizontal scroll strip of tickers with day % + `▲ / ▼` direction glyphs.

### Drill-downs & sector views
- **Hover card** — [app/octopus/HoverCard.tsx](../app/octopus/HoverCard.tsx). Stock-level drill-down. Always show CMP + bear / base / bull / 1Y upside in **₹ targets alongside %** (both, not either).
- **Sector grid / orbital / drawer** — [SectorGrid.tsx](../app/octopus/SectorGrid.tsx), [SectorOrbital.tsx](../app/octopus/SectorOrbital.tsx), [SectorDrawer.tsx](../app/octopus/SectorDrawer.tsx). Portfolio-segment views.
- **Top movers** — [TopMovers.tsx](../app/octopus/TopMovers.tsx). Right-rail or footer module.

### Visualisations
- **Treemap** — [lib/treemap.ts](../lib/treemap.ts). Portfolio-weight visualisation. **Never the only view of a dataset** — always pair with a table.
- **Sparklines / charts** — `viewBox` SVG; reference `--color-chart-1..6` for series colour.

### States (every component must handle all three)
- **Empty** — render `—` (em-dash). Never `0`, `N/A`, or blank.
- **Loading** — skeleton placeholders at the same dimensions as the loaded content. Never spinners over text.
- **Error** — use [components/ErrorBoundary.tsx](../components/ErrorBoundary.tsx) for the page-level catch; inline errors use `.pill-red`.

---

## 6. Data presentation rules

### Numbers
- **Currency.** `₹` prefix. `Cr` ≥ 1 crore. `L` (Lakh) 1 L – < 1 Cr. Plain otherwise. Never paise.
- **Locale.** `en-IN` thousands separator (`1,23,45,678`).
- **Precision.** 1 decimal in displays, 2 in tooltips / exports.
- **Direction glyphs.** `▲ / ▼` **after** the number, coloured by sign. Never replacing the number.

### Percentages
- Always signed: `+12.3 %`, `−4.7 %`. The `+` is explicit.
- One decimal. Use the minus-sign character `−`.
- Source from a **single shared module** — see §8 (mandate to create `lib/format.ts`).

### Colour semantics
| Meaning | Dashboard token | Octopus token |
|---|---|---|
| Positive / bull / upside | `--color-positive` | `--ox-pos` |
| Negative / bear / downside | `--color-negative` | `--ox-neg` |
| Warning / base case / caution | `--color-warning` | `--ox-warning` |
| Info / neutral | `--color-info` | `--ox-ink-soft` |
| Muted / stale | `--color-text-muted` | `--ox-ink-mute` |

### Scenarios (bear / base / bull)
- **Always** rendered in that order, left-to-right, with base in the middle. Never reorder by value.
- Bear uses negative colour, base uses warning (caution / "central case"), bull uses positive.

### Other
- **Empty / null** → `—` (em-dash). Not `0`, not `N/A`, not blank.
- **Stale data** → if `lastUpdated` is outside market hours, or > 5 min old during market hours, fade the cell to `--color-text-muted` and surface the timestamp in a tooltip.
- **Sort defaults** → tables sort by `name` ASC, unless the table's purpose is ranking (then by the ranked metric DESC).

---

## 7. Information architecture

- **One sentence** at the top of every dashboard stating its single purpose. If you can't write it in one sentence, the dashboard is doing too much.
- **Tab structure.** Mirror OctoTusk: visual overview → private / PIN'd P&L → analytics → journal. **Never exceed 5 tabs.** 3–4 is the sweet spot.
- **Above the fold.** Highest-density information first: market context strip, KPI strip, treemap, top movers. Detail tables go below.
- **Private / sensitive views** (P&L, holdings sizing) **must** be PIN-gated using the `HOLDINGS_PIN` env-var pattern. Never expose holdings publicly.
- **Live data refresh.** CMP refreshes every 60s **only during IST 09:15–15:30 Mon–Fri**. Use [lib/marketHours.ts](../lib/marketHours.ts). Outside market hours: fetch once on mount, then stop.
- **SSR + client merge.** Server component (`page.tsx`) loads the latest snapshot from Supabase at SSR time. Client component merges live quotes. **Never block first paint on a quote fetch.**

---

## 8. Engineering conventions

### File layout
- New components live in their own file. **Hard ceiling: 400 lines.** Soft target: 300.
- `app/octopus/*` is the model (13 files, longest 493 lines). [DashboardClient.tsx](../app/dashboard/DashboardClient.tsx) (4,811 lines) is the **anti-pattern** — do not copy its structure when starting something new.
- **Component split:** server component (`page.tsx`) → loads data → passes to client component (`*Client.tsx`) → composes presentational pieces from standalone files.

### CSS
- All colour, spacing, radius, shadow values come from tokens. **`grep -E "#[0-9a-fA-F]{3,6}"` should return zero hits in your new files.**
- Shared utility classes go in [app/globals.css](../app/globals.css) next to siblings. Component-scoped styles live with the component.
- Scope new design systems with a parent class (e.g. `.octopus-root`) so their tokens don't leak.

### Formatters (mandatory follow-up)
Today, `fmtPct` / `fmtPctSigned` is defined inline in **7 files** with mixed 1- vs 2-decimal precision. Before the next dashboard ships, create:

```ts
// lib/format.ts
export function fmtPct(p: number | null, opts?: { asFraction?: boolean }): string
export function fmtPctSigned(p: number | null, opts?: { decimals?: 1 | 2 }): string
export function fmtINR(amt: number | null, opts?: { decimals?: 1 | 2 }): string
export function fmtCr(amt: number | null): string
export function fmtLakh(amt: number | null): string
export function pctClass(p: number | null): 'pos' | 'neg' | 'zero'
```

Then delete the inline copies in:
[CommandPalette.tsx](../app/octopus/CommandPalette.tsx),
[HoverCard.tsx](../app/octopus/HoverCard.tsx),
[SectorDrawer.tsx](../app/octopus/SectorDrawer.tsx),
[SectorGrid.tsx](../app/octopus/SectorGrid.tsx),
[StockPills.tsx](../app/octopus/StockPills.tsx),
[StockTable.tsx](../app/octopus/StockTable.tsx),
[StockUpsideTable.tsx](../app/octopus/StockUpsideTable.tsx).

This is the first sanctioned refactor under the new rules.

### Data contract (Excel inputs)
Cross-reference [CLAUDE.md § vF merge logic](../CLAUDE.md). When wiring a new Excel file:
1. Define cell anchors explicitly in code (e.g. `B2` for TIKR).
2. Add a `TIKR_ALIAS` entry if the file uses non-canonical names.
3. Add a `ticker_map` entry in [data/database.json](../data/database.json) pointing to the Yahoo symbol (try `.NS`, fall back to `.BO`).
4. Deduplicate by TIKR (keep first) **before** upserting to Supabase.
5. Delete the original key after aliasing — prevents duplicate standalone entries.

### Environment & access
- Env vars go in CLAUDE.md's table. No secrets in client components.
- Auth: NextAuth via `AUTH_MICROSOFT_ENTRA_ID_*`, restricted to `@tuskinvest.com`. Don't add new auth flows — reuse the existing scope.
- PIN-gating uses `HOLDINGS_PIN` for any sensitive view.

### Quality gate
```bash
npx tsc --noEmit
```
No test suite, no lint script. This is the only pre-commit check — but it is mandatory.

---

## 9. Quickstart — "before you ship" checklist

Paste this into your PR description and tick each item.

- [ ] Aesthetic decision logged (Octopus vs Dashboard, with one-sentence reason).
- [ ] All colours via tokens — `grep -E "#[0-9a-fA-F]{3,6}"` returns zero hits in your new files.
- [ ] Numbers formatted via `lib/format.ts` — no inline `toFixed`.
- [ ] Percentages signed (explicit `+`), 1 decimal, `−` minus character.
- [ ] Bear / base / bull rendered in canonical order.
- [ ] Empty values render as `—`.
- [ ] Sticky header + right-aligned numerics on every table.
- [ ] One sentence stating the dashboard's purpose at the top.
- [ ] ≤ 5 tabs.
- [ ] PIN-gate on any P&L / holdings view.
- [ ] CMP refresh only during market hours ([lib/marketHours.ts](../lib/marketHours.ts)).
- [ ] No new `@media` breakpoints.
- [ ] No file > 400 lines.
- [ ] `npx tsc --noEmit` clean.
- [ ] One existing user (analyst) has clicked through the dashboard end-to-end.

---

## Appendix — files referenced

| Purpose | Path |
|---|---|
| Token source of truth | [app/globals.css](../app/globals.css) |
| Canonical modular components | [app/octopus/](../app/octopus/) |
| Legacy / anti-pattern reference | [app/dashboard/DashboardClient.tsx](../app/dashboard/DashboardClient.tsx) |
| Market-hours helper | [lib/marketHours.ts](../lib/marketHours.ts) |
| Display-name helper | [lib/displayName.ts](../lib/displayName.ts) |
| Treemap helper | [lib/treemap.ts](../lib/treemap.ts) |
| Sector helper | [lib/sectors.ts](../lib/sectors.ts) |
| Error boundary | [components/ErrorBoundary.tsx](../components/ErrorBoundary.tsx) |
| Pipeline + env vars + vF merge | [CLAUDE.md](../CLAUDE.md) |

---

*Maintenance: this doc lives in the repo and changes via PR. If you find yourself working around a rule, update the rule — don't ignore it.*
