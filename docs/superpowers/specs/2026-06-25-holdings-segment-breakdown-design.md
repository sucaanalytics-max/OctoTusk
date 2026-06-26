# Holdings breakdown by Sector → Sub-sector

**Date:** 2026-06-25
**Status:** Design — awaiting user review
**Branch (current):** feat/research-compare-redesign

## 1. Goal

In the Holdings view, add a breakdown that groups the user's equity holdings by
**Sector → Sub-sector**, showing each holding as a line item with its value and a
**category total** at both the sub-sector and sector level. The breakdown must be
**accurate** — every held stock resolves to a correct canonical sector/sub-sector,
and category totals reconcile exactly to the portfolio total.

Rendered on **both** surfaces (desktop Holdings tab + mobile Portfolio) from one
shared computation.

## 2. Locked decisions (from brainstorming Q&A)

| Decision | Choice |
|---|---|
| Surface | **Both** — shared `lib/` logic, desktop + mobile renderers |
| Taxonomy | **Sector → Sub-sector** (industry), via canonical `lib/sectors.ts` |
| Value basis | **Current value + Invested + Unrealised P&L** (₹ and %), plus weight % per category |
| Frozen file | **Authorized** minimal wiring edit to `app/dashboard/DashboardClient.tsx` (sub-tab button + render branch only) |
| Judgment-call mappings | **Proposed here, user confirms** before any data edit |

## 3. Data accuracy (first-class deliverable)

The audit found the canonical taxonomy covers **106 / 121** universe stocks. The other
**15 have no `tikrToSector` entry** and would fall back to looser `database.json`
strings (`BFSI`, `Banks & NBFC`, `Manufacturing`, `Real Estate`, `Oil & Gas`, `Power & Energy`,
`Building Materials`) — *different strings* from the canonical names, which would render
as **phantom duplicate top-level buckets** next to the real ones. This is the core
accuracy risk and the breakdown is only trustworthy once it is closed.

### 3.1 Proposed `tikrToSector` additions (15)

Only `tikrToSector` is edited. `tikrAlias` is **not** touched, so the frozen sync files
(`scripts/sync-to-supabase.ts`, `app/api/sync/route.ts`) need **no** change (per the
file's own `_doc` note). Sub-sectors marked **(new)** are added in the existing naming style;
others **reuse** an existing canonical sub-sector string.

| Tikr | Company | Proposed sector | Proposed sub-sector | Confidence |
|---|---|---|---|---|
| DAMCAPITAL | DAM Capital Advisors | Financial Services | Stockbroking & Allied Services (reuse) | High — investment bank/broker, matches MOTILALOFS/ANGELONE |
| MONARCH | Monarch Networth Capital | Financial Services | Stockbroking & Allied Services (reuse) | High — broking/IB |
| PIRAMALFIN | Piramal Finance | Financial Services | NBFC (reuse) | High — retail+wholesale lender |
| 517417 | Patels Airtemp | Capital Goods | Industrial Manufacturing (Process Equipment) (reuse) | High — heat exchangers/pressure vessels |
| 500068 | Disa India | Capital Goods | Industrial Machinery (Foundry Equipment) **(new)** | High sector; sub is my proposal |
| ELECON…(XNSE:ELECON) | Elecon Engineering | Capital Goods | Industrial Products (Gears & Material Handling) **(new)** | High sector; sub is my proposal |
| somanycera | Somany Ceramics | Construction Materials | Tiles & Sanitaryware **(new)** | High |
| 533278 | Coal India | Oil, Gas & Consumable Fuels | Coal Mining **(new)** | High — NSE places Coal India here, not Metals |
| ABREL | Aditya Birla Real Estate | Realty | Developers (reuse) | ✅ Confirmed |
| J&KBANK | J&K Bank | Financial Services | **Public Sector Bank** (reuse) | ✅ Confirmed — user classifies as PSU (state govt majority owner) |
| VAML | Vedanta Aluminium | Metals & Mining | Aluminium **(new)** | ✅ Confirmed — classify now |
| VISL | Vedanta Iron & Steel | Metals & Mining | Iron & Steel (Integrated) (reuse) | ✅ Confirmed — classify now |
| VOGL | Vedanta Oil & Gas | Oil, Gas & Consumable Fuels | Crude Oil & Natural Gas (E&P) (reuse) | ✅ Confirmed — classify now |
| VEDPOWER | Vedanta Power | Power | Electric Utilities (Integrated) (reuse) | ✅ Confirmed — classify now |
| RPSGVENT | RPSG Ventures | Diversified | Holding Company (FMCG / IT-Enabled Services / Sports) **(new)** | ✅ Confirmed |

**All 15 mappings approved** (J&KBANK set to *Public Sector Bank* per user override of the
proposed private-bank reading). Each addition carries a one-line rationale in
`substantiveNotes` to match the file's convention.

### 3.2 Residual accuracy risk (called out, not silently hidden)

A holding only gets a sector if its `asset_name` resolves to a stock `tikr` via
`lib/holdings-match.ts`. A holding that resolves to **no** tikr lands in **Unclassified**
regardless of taxonomy completeness. Therefore the UI will **surface the Unclassified
bucket and its count** rather than hide it — so any matching gap is visible, not masked.

## 4. Architecture

### 4.1 Shared core — `lib/holdingsBreakdown.ts` (new, pure, no React)

The single place numbers are computed; imported by both renderers.

```ts
export interface BreakdownInput {
  assetName: string;
  tikr?: string | null;
  fallbackSector?: string | null;     // from matched stock; used only if canonical map misses
  fallbackSubsector?: string | null;
  value: number;      // live market value (CMP × qty); falls back to snapshot value if unpriced
  invested: number;   // amt_invested (cost basis)
  gain: number;       // unrealised P&L = value − invested
}

export interface BreakdownLine {
  assetName: string; tikr: string | null;
  value: number; invested: number; gain: number;
  gainPct: number;    // gain / invested  (null-safe → NaN guarded, shown as "—")
  weightPct: number;  // value / portfolioValue
}
export interface SubSectorGroup {
  subsector: string;  // "" → label "Other"
  value: number; invested: number; gain: number; gainPct: number; weightPct: number;
  lines: BreakdownLine[];
}
export interface SectorGroup {
  sector: string;
  value: number; invested: number; gain: number; gainPct: number; weightPct: number;
  subsectors: SubSectorGroup[];
}
export interface BreakdownResult {
  sectors: SectorGroup[];
  total: { value: number; invested: number; gain: number; gainPct: number };
  unclassifiedCount: number;   // # of lines that fell into Unclassified
}

export function buildHoldingsBreakdown(items: BreakdownInput[]): BreakdownResult;
```

**Algorithm:**
1. For each item, resolve `{sector, subsector} = getSectorInfo(tikr ?? "", {sector: fallbackSector, subsector: fallbackSubsector})`.
2. **Canonical guard:** if `sector` is **not** in `SECTOR_ORDER`, force `sector = "Unclassified"` (and keep the raw name as the sub-sector label). This guarantees top-level buckets are exactly the canonical set + Unclassified — a loose fallback name can never appear as a phantom top-level segment.
3. Group by sector → sub-sector; sum `value`, `invested`, `gain`.
4. `gainPct = invested > 0 ? gain / invested * 100 : null`. `weightPct = total.value > 0 ? value / total.value * 100 : 0`.
5. Sort sectors by `value` desc, then sub-sectors by `value` desc, then lines by `value` desc; ties broken by `assetName` for determinism. **Unclassified always sorts last.**
6. `total` = sum across all lines. **Invariant:** `Σ sectors.value === total.value` and `Σ invested === total.invested` (single counting path → holds by construction; a dev-only assert documents it).

`getSectorInfo` reads the bundled `sector-mapping.json`, so the data fix in §3 flows to
both surfaces automatically. Pure module → unit-testable without React/quotes.

### 4.2 Desktop — new `Sectors` sub-tab

- New component **outside the frozen tree**: `components/holdings/HoldingsBreakdown.tsx` (desktop-styled with inline `globals.css` tokens, matching the existing holdings table).
- It receives the already-computed `enrichedHoldings` (which carry `tikr`, `liveValue`, `amt_invested`, `liveGain`, and matched-stock `sector`/`subsector`), maps them to `BreakdownInput[]`, calls `buildHoldingsBreakdown`, and renders a grouped, collapsible table.
- **Authorized minimal edit to `app/dashboard/DashboardClient.tsx`** (frozen): (a) add `"breakdown"` to the `holdingsSubTab` union, (b) add one nav button labelled **"Sectors"** (distinct from the existing SEBI **"Segments"** tab) in the sub-tab nav (~L2826–2839), (c) add one render branch `{holdingsSubTab === "breakdown" && <HoldingsBreakdown … />}`. No logic in the monolith. `/boundary-check` run after, with the diff to DashboardClient called out explicitly.

### 4.3 Mobile — new Breakdown view under `app/m/portfolio/`

- New component `app/m/portfolio/BreakdownView.tsx` (≤400 lines), `.m-*` token classes in `app/m.css`.
- A **"Holdings / Breakdown"** toggle (segmented control) in `PortfolioClient.tsx` switches the list area between the existing card list and the breakdown.
- Renders an **accordion**: sector header (name · total value · weight % · P&L) always visible; tap expands to sub-sector sub-headers; tap expands to line items. Default collapsed at sector level for scannability on small screens.
- Reuses the same `lib/holdingsBreakdown.ts`. Holdings are already PIN-unlocked in memory via `useHoldings()`; **no new fetch, no new persistence** → no new data-leak surface.

## 5. Display semantics

- **Line item:** name · current value · invested · unrealised P&L (₹ + %). Weight % at category level.
- **Sub-sector row:** subtotal of its lines (value/invested/P&L) + weight %.
- **Sector row:** subtotal of its sub-sectors + weight %.
- **Portfolio total row** reconciles to the Holdings summary KPI.
- Empty sub-sector (`""`) → labelled **"Other"**. `invested = 0` → P&L % shows **"—"**.
- Numbers via `lib/format.ts` on mobile; desktop uses its existing inline formatters (en-IN, Cr).

## 6. Out of scope (YAGNI)

- **F&O positions** — excluded from the sector breakdown (a derivative has no natural equity sector); they stay in their existing section. UI notes this.
- **Market-cap (SEBI) dimension** — already covered by the existing desktop "Segments" tab; not duplicated here.
- **Thematic buckets** (defensive/cyclical/growth) — no data exists; not in scope.

## 7. Red-team / edge cases

| Case | Handling |
|---|---|
| Phantom duplicate buckets from loose fallback names | Canonical guard (§4.1 step 2) forces non-canonical sectors → Unclassified |
| Holding doesn't resolve to a tikr | Lands in Unclassified; **count surfaced in UI**, not hidden |
| Unpriced holding (no live quote) | `value` falls back to snapshot (current_price × qty) via existing `computeLivePnl`; never NaN |
| `invested = 0` | P&L % → "—" (no divide-by-zero) |
| Totals drift | Single counting path + dev assert `Σ category == total` |
| Non-deterministic order | value desc, ties by name; Unclassified always last |
| Duplicate asset names | Each holding row is its own line (keyed by row, not name) |

## 8. Security

- No new API; reuses the already-PIN-gated, in-memory holdings on both surfaces.
- No holdings to localStorage / sessionStorage / URL / push.
- `security-reviewer` runs on the `app/m/**` diff; `/security-check` before merge.

## 9. File-by-file change list

| File | Change | Frozen? |
|---|---|---|
| `data/sector-mapping.json` | Add 15 `tikrToSector` entries + `substantiveNotes` | No |
| `lib/holdingsBreakdown.ts` | New pure module (§4.1) | No |
| `components/holdings/HoldingsBreakdown.tsx` | New desktop component | No |
| `app/dashboard/DashboardClient.tsx` | Minimal sub-tab wiring (3 insertions) | **Yes — authorized** |
| `app/m/portfolio/BreakdownView.tsx` | New mobile component | No |
| `app/m/portfolio/PortfolioClient.tsx` | Add Holdings/Breakdown toggle | No |
| `app/m.css` | New `.m-*` breakdown classes | No |
| `scripts/verify-holdings-breakdown.ts` | `npx tsx` script: feeds sample holdings, asserts grouping + invariants (repo has no test runner) | No |

## 10. Verification plan

1. `npx tsc --noEmit` clean.
2. `npx tsx scripts/verify-holdings-breakdown.ts` — feeds sample holdings and asserts: grouping, weight %, totals invariant, divide-by-zero, canonical guard, Unclassified counting, sort order.
3. Re-run the coverage audit: 0 held-universe stocks map to a non-canonical/`Unclassified` sector (post data fix).
4. Manual: desktop "Sectors" sub-tab and mobile Breakdown render; category totals sum to the portfolio KPI; spot-check 3 sectors against the holdings table.
5. `/boundary-check` — confirm only the authorized DashboardClient.tsx wiring lines changed in the frozen tree.
6. `/security-check` on the mobile diff.
