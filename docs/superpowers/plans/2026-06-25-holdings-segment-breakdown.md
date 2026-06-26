# Holdings breakdown by Sector → Sub-sector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sector → Sub-sector breakdown of equity holdings (line items + category subtotals + portfolio total) to both the desktop Holdings tab and the mobile Portfolio screen, computed by one shared pure helper.

**Architecture:** A new pure module `lib/holdingsBreakdown.ts` groups already-valued holdings into a `Sector → Sub-sector → line` tree via the canonical `lib/sectors.ts` resolver, with a guard that forces any non-canonical sector into "Unclassified". Two thin renderers consume it: a new desktop component wired as a "Sectors" sub-tab, and a new mobile accordion view toggled inside Portfolio. The canonical taxonomy is completed first (15 missing tikrs) so classification is accurate.

**Tech Stack:** Next.js App Router, React (client components), TypeScript. No test runner — verification via `npx tsx` script + `npx tsc --noEmit`.

## Global Constraints

- **Frozen files (CLAUDE.md Do-Not-Touch):** only `app/dashboard/DashboardClient.tsx` may be edited, and only the 3 authorized wiring insertions in Task 4 (spec §2). No other frozen file changes. `data/sector-mapping.json` is **not** frozen.
- **Do not change `tikrAlias`** in `sector-mapping.json` (it is duplicated into the frozen sync files); only add to `tikrToSector` + `substantiveNotes`.
- **Taxonomy strings must exist** in `sector-mapping.json` or be added there — never invent a sector/sub-sector string at a call site.
- **Numbers:** mobile uses `lib/format.ts` (en-IN, real minus `−`, `—` for empty); desktop uses inline formatters + tokens `--color-positive` / `--color-negative`.
- **Mobile files ≤ 400 lines**, `.m-*` classes scoped under `[data-mroot]` in `app/m.css`; never edit `app/globals.css`.
- **Security:** no new data fetch; reuse the already-PIN-unlocked in-memory holdings. No holdings to storage/URL/push.
- **Pre-commit check:** `npx tsc --noEmit` must be clean.

---

### Task 1: Complete the canonical taxonomy (data accuracy)

**Files:**
- Modify: `data/sector-mapping.json` (add 15 `tikrToSector` entries + matching `substantiveNotes`)

**Interfaces:**
- Consumes: nothing.
- Produces: full canonical coverage so `getSectorInfo(tikr)` (no fallback) returns a non-`Unclassified` sector for every stock in `data/database.json`.

- [ ] **Step 1: Write the failing coverage check**

Run this exactly (it uses the existing `lib/sectors.ts` + `data/database.json`):

```bash
npx tsx -e "import {getSectorInfo,UNCLASSIFIED} from './lib/sectors'; import db from './data/database.json'; const bad=(db as {stocks:{tikr:string}[]}).stocks.filter(s=>getSectorInfo(s.tikr).sector===UNCLASSIFIED).map(s=>s.tikr); if(bad.length){console.error('FAIL ('+bad.length+'):',bad.join(', '));process.exit(1)} console.log('OK: all '+ (db as any).stocks.length +' stocks canonical');"
```

Expected **before** the edit: `FAIL (15): 500068, 517417, 533278, ABREL, DAMCAPITAL, ELECON ENGINEERING COMPANY LIMITED (XNSE:ELECON), J&KBANK, MONARCH, PIRAMALFIN, RPSGVENT, VAML, VEDPOWER, VISL, VOGL, somanycera` (order may vary).

- [ ] **Step 2: Add the 15 entries to `tikrToSector`**

Insert these key/value pairs into the `"tikrToSector"` object in `data/sector-mapping.json` (place each near its sector peers; JSON key order is irrelevant). Use these exact strings (J&KBANK is **Public Sector Bank** per user decision):

```jsonc
"DAMCAPITAL":  { "sector": "Financial Services", "subsector": "Stockbroking & Allied Services" },
"MONARCH":     { "sector": "Financial Services", "subsector": "Stockbroking & Allied Services" },
"PIRAMALFIN":  { "sector": "Financial Services", "subsector": "NBFC" },
"J&KBANK":     { "sector": "Financial Services", "subsector": "Public Sector Bank" },
"517417":      { "sector": "Capital Goods", "subsector": "Industrial Manufacturing (Process Equipment)" },
"500068":      { "sector": "Capital Goods", "subsector": "Industrial Machinery (Foundry Equipment)" },
"ELECON ENGINEERING COMPANY LIMITED (XNSE:ELECON)": { "sector": "Capital Goods", "subsector": "Industrial Products (Gears & Material Handling)" },
"somanycera":  { "sector": "Construction Materials", "subsector": "Tiles & Sanitaryware" },
"533278":      { "sector": "Oil, Gas & Consumable Fuels", "subsector": "Coal Mining" },
"ABREL":       { "sector": "Realty", "subsector": "Developers" },
"VAML":        { "sector": "Metals & Mining", "subsector": "Aluminium" },
"VISL":        { "sector": "Metals & Mining", "subsector": "Iron & Steel (Integrated)" },
"VOGL":        { "sector": "Oil, Gas & Consumable Fuels", "subsector": "Crude Oil & Natural Gas (E&P)" },
"VEDPOWER":    { "sector": "Power", "subsector": "Electric Utilities (Integrated)" },
"RPSGVENT":    { "sector": "Diversified", "subsector": "Holding Company (FMCG / IT-Enabled Services / Sports)" }
```

- [ ] **Step 3: Add rationale to `substantiveNotes`**

Add these keys to the existing `"substantiveNotes"` object (matches the file's convention):

```jsonc
"DAMCAPITAL": "BFSI/Exchanges in db — DAM Capital is an investment bank/broker → Stockbroking & Allied Services",
"MONARCH": "BFSI/Exchanges in db — Monarch Networth is a broker → Stockbroking & Allied Services",
"PIRAMALFIN": "Banks & NBFC in db — Piramal Finance is an NBFC",
"J&KBANK": "user classifies J&K Bank as PSU (J&K govt majority owner) → Public Sector Bank",
"517417": "Manufacturing in db — Patels Airtemp makes heat exchangers/pressure vessels → Capital Goods / Process Equipment",
"500068": "Manufacturing in db — Disa India makes foundry/moulding machinery → Capital Goods",
"ELECON ENGINEERING COMPANY LIMITED (XNSE:ELECON)": "Manufacturing in db — Elecon makes gears & material-handling equipment → Capital Goods",
"somanycera": "Building Materials in db — Somany Ceramics (tiles/sanitaryware) → Construction Materials",
"533278": "empty in db — Coal India; NSE places it in Oil, Gas & Consumable Fuels, not Metals",
"ABREL": "Real Estate/Developers in db — Aditya Birla Real Estate (ex-Century Textiles) → Realty / Developers (user-confirmed)",
"VAML": "Vedanta Aluminium — pre-demerger entity, classify now per user → Metals & Mining / Aluminium",
"VISL": "Vedanta Iron & Steel — pre-demerger entity, classify now per user → Metals & Mining",
"VOGL": "Vedanta Oil & Gas — pre-demerger entity, classify now per user → Oil, Gas & Consumable Fuels (E&P)",
"VEDPOWER": "Vedanta Power — pre-demerger entity, classify now per user → Power",
"RPSGVENT": "Other in db — RPSG Ventures holds FMCG (Too Yumm) + BPO + sports → Diversified holding co (user-confirmed)"
```

- [ ] **Step 4: Run the coverage check — verify it passes**

Run the command from Step 1 again.
Expected: `OK: all 121 stocks canonical` (count matches the universe).

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add data/sector-mapping.json
git commit -m "feat(sectors): complete canonical mapping for 15 unmapped tikrs (holdings breakdown accuracy)"
```

---

### Task 2: Shared grouping helper `lib/holdingsBreakdown.ts`

**Files:**
- Create: `lib/holdingsBreakdown.ts`
- Create: `scripts/verify-holdings-breakdown.ts`

**Interfaces:**
- Consumes: `getSectorInfo`, `SECTOR_ORDER`, `UNCLASSIFIED` from `@/lib/sectors`.
- Produces:
  - `buildHoldingsBreakdown(items: BreakdownInput[]): BreakdownResult`
  - `BreakdownInput { assetName: string; tikr?: string|null; fallbackSector?: string|null; fallbackSubsector?: string|null; value: number; invested: number; gain: number }`
  - `BreakdownLine { assetName: string; tikr: string|null; value: number; invested: number; gain: number; gainPct: number|null; weightPct: number }`
  - `SubSectorGroup { subsector: string; value; invested; gain; gainPct: number|null; weightPct; lines: BreakdownLine[] }`
  - `SectorGroup { sector: string; value; invested; gain; gainPct: number|null; weightPct; subsectors: SubSectorGroup[] }`
  - `BreakdownResult { sectors: SectorGroup[]; total: { value; invested; gain; gainPct: number|null }; unclassifiedCount: number }`

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-holdings-breakdown.ts`:

```ts
// Run: npx tsx scripts/verify-holdings-breakdown.ts
// Asserts buildHoldingsBreakdown grouping/invariants + full canonical coverage of the universe.
import assert from "node:assert/strict";
import { buildHoldingsBreakdown, type BreakdownInput } from "../lib/holdingsBreakdown";
import { getSectorInfo, UNCLASSIFIED } from "../lib/sectors";
import db from "../data/database.json";

let n = 0;
function check(name: string, fn: () => void) { fn(); n++; console.log("  ✓", name); }

check("groups by sector→subsector and totals reconcile", () => {
  const items: BreakdownInput[] = [
    { assetName: "HDFC Bank", tikr: "HDFCBANK", value: 200, invested: 100, gain: 100 },
    { assetName: "ICICI Bank", tikr: "ICICIBANK", value: 100, invested: 80, gain: 20 },
    { assetName: "SBI", tikr: "SBIN", value: 50, invested: 60, gain: -10 },
  ];
  const r = buildHoldingsBreakdown(items);
  assert.equal(r.total.value, 350);
  assert.equal(r.total.invested, 240);
  assert.equal(r.total.gain, 110);
  assert.equal(r.sectors.reduce((s, x) => s + x.value, 0), r.total.value);
  assert.equal(r.sectors.length, 1);
  assert.equal(r.sectors[0].sector, "Financial Services");
  assert.equal(r.sectors[0].subsectors[0].subsector, "Private Sector Bank"); // 300 > 50
  assert.equal(r.sectors[0].subsectors[0].value, 300);
  assert.equal(r.sectors[0].subsectors[1].subsector, "Public Sector Bank");
});

check("weightPct = value / total", () => {
  const r = buildHoldingsBreakdown([
    { assetName: "A", tikr: "HDFCBANK", value: 75, invested: 50, gain: 25 },
    { assetName: "B", tikr: "TATAELXSI", value: 25, invested: 20, gain: 5 },
  ]);
  const fin = r.sectors.find((s) => s.sector === "Financial Services")!;
  assert.equal(Math.round(fin.weightPct), 75);
});

check("invested<=0 → gainPct null", () => {
  const r = buildHoldingsBreakdown([{ assetName: "Z", tikr: "HDFCBANK", value: 10, invested: 0, gain: 10 }]);
  assert.equal(r.sectors[0].subsectors[0].lines[0].gainPct, null);
});

check("non-canonical fallback sector → Unclassified, counted, sorted last", () => {
  const r = buildHoldingsBreakdown([
    { assetName: "Real", tikr: "HDFCBANK", value: 100, invested: 100, gain: 0 },
    { assetName: "Loose", tikr: "ZZZUNKNOWN", value: 40, invested: 40, gain: 0, fallbackSector: "BFSI", fallbackSubsector: "X" },
  ]);
  assert.equal(r.unclassifiedCount, 1);
  assert.equal(r.sectors[r.sectors.length - 1].sector, UNCLASSIFIED);
  assert.ok(!r.sectors.some((s) => s.sector === "BFSI"));
});

check("sectors sorted by value desc", () => {
  const r = buildHoldingsBreakdown([
    { assetName: "IT", tikr: "TATAELXSI", value: 500, invested: 400, gain: 100 },
    { assetName: "Bank", tikr: "HDFCBANK", value: 100, invested: 90, gain: 10 },
  ]);
  assert.equal(r.sectors[0].sector, "Information Technology");
});

check("all universe stocks resolve to a canonical sector", () => {
  const stocks = (db as { stocks: Array<{ tikr: string }> }).stocks;
  const bad = stocks.filter((s) => getSectorInfo(s.tikr).sector === UNCLASSIFIED).map((s) => s.tikr);
  assert.equal(bad.length, 0, `Unclassified tikrs: ${bad.join(", ")}`);
});

console.log(`\nAll ${n} checks passed.`);
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx tsx scripts/verify-holdings-breakdown.ts`
Expected: FAIL — `Cannot find module '../lib/holdingsBreakdown'` (helper not created yet).

- [ ] **Step 3: Implement `lib/holdingsBreakdown.ts`**

Create `lib/holdingsBreakdown.ts`:

```ts
// Pure grouping of holdings into a Sector → Sub-sector tree with subtotals, weights and a
// portfolio total. Single source of truth for the breakdown numbers on both the desktop
// Holdings "Sectors" sub-tab and the mobile Portfolio breakdown view. No React, no quote
// fetching — feed it already-valued holdings.
import { getSectorInfo, SECTOR_ORDER, UNCLASSIFIED } from "@/lib/sectors";

export interface BreakdownInput {
  assetName: string;
  tikr?: string | null;
  fallbackSector?: string | null;
  fallbackSubsector?: string | null;
  value: number;     // current market value (CMP × qty; snapshot value if unpriced)
  invested: number;  // cost basis
  gain: number;      // unrealised P&L = value − invested
}

export interface BreakdownLine {
  assetName: string;
  tikr: string | null;
  value: number;
  invested: number;
  gain: number;
  gainPct: number | null;  // null when invested <= 0
  weightPct: number;
}
export interface SubSectorGroup {
  subsector: string;       // "" rendered as "Other" by the UI
  value: number; invested: number; gain: number; gainPct: number | null; weightPct: number;
  lines: BreakdownLine[];
}
export interface SectorGroup {
  sector: string;
  value: number; invested: number; gain: number; gainPct: number | null; weightPct: number;
  subsectors: SubSectorGroup[];
}
export interface BreakdownResult {
  sectors: SectorGroup[];
  total: { value: number; invested: number; gain: number; gainPct: number | null };
  unclassifiedCount: number;
}

const CANONICAL = new Set(SECTOR_ORDER); // SECTOR_ORDER already includes UNCLASSIFIED

const pct = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);
const gainPctOf = (gain: number, invested: number): number | null =>
  invested > 0 ? (gain / invested) * 100 : null;

export function buildHoldingsBreakdown(items: BreakdownInput[]): BreakdownResult {
  const resolved = items.map((it) => {
    const info = getSectorInfo(it.tikr ?? "", {
      sector: it.fallbackSector ?? null,
      subsector: it.fallbackSubsector ?? null,
    });
    // Canonical guard: a loose fallback sector (e.g. "BFSI") that isn't a real top-level
    // sector must never appear as a phantom bucket — force it into Unclassified.
    const sector = CANONICAL.has(info.sector) ? info.sector : UNCLASSIFIED;
    const subsector = sector === UNCLASSIFIED ? "" : info.subsector;
    return { sector, subsector, in: it };
  });

  const totalValue = resolved.reduce((s, r) => s + r.in.value, 0);
  const totalInvested = resolved.reduce((s, r) => s + r.in.invested, 0);
  const totalGain = totalValue - totalInvested;
  const unclassifiedCount = resolved.filter((r) => r.sector === UNCLASSIFIED).length;

  const sectorMap = new Map<string, Map<string, BreakdownLine[]>>();
  for (const r of resolved) {
    if (!sectorMap.has(r.sector)) sectorMap.set(r.sector, new Map());
    const subMap = sectorMap.get(r.sector)!;
    if (!subMap.has(r.subsector)) subMap.set(r.subsector, []);
    subMap.get(r.subsector)!.push({
      assetName: r.in.assetName,
      tikr: r.in.tikr ?? null,
      value: r.in.value,
      invested: r.in.invested,
      gain: r.in.gain,
      gainPct: gainPctOf(r.in.gain, r.in.invested),
      weightPct: pct(r.in.value, totalValue),
    });
  }

  const sectors: SectorGroup[] = [];
  for (const [sector, subMap] of sectorMap) {
    const subsectors: SubSectorGroup[] = [];
    for (const [subsector, lines] of subMap) {
      lines.sort((a, b) => b.value - a.value || a.assetName.localeCompare(b.assetName));
      const value = lines.reduce((s, l) => s + l.value, 0);
      const invested = lines.reduce((s, l) => s + l.invested, 0);
      const gain = value - invested;
      subsectors.push({ subsector, value, invested, gain, gainPct: gainPctOf(gain, invested), weightPct: pct(value, totalValue), lines });
    }
    subsectors.sort((a, b) => b.value - a.value || a.subsector.localeCompare(b.subsector));
    const value = subsectors.reduce((s, x) => s + x.value, 0);
    const invested = subsectors.reduce((s, x) => s + x.invested, 0);
    const gain = value - invested;
    sectors.push({ sector, value, invested, gain, gainPct: gainPctOf(gain, invested), weightPct: pct(value, totalValue), subsectors });
  }

  // Value desc, but Unclassified always last.
  sectors.sort((a, b) => {
    if (a.sector === UNCLASSIFIED) return 1;
    if (b.sector === UNCLASSIFIED) return -1;
    return b.value - a.value || a.sector.localeCompare(b.sector);
  });

  return {
    sectors,
    total: { value: totalValue, invested: totalInvested, gain: totalGain, gainPct: gainPctOf(totalGain, totalInvested) },
    unclassifiedCount,
  };
}
```

- [ ] **Step 4: Run the verification script — verify it passes**

Run: `npx tsx scripts/verify-holdings-breakdown.ts`
Expected: `All 6 checks passed.`

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/holdingsBreakdown.ts scripts/verify-holdings-breakdown.ts
git commit -m "feat(holdings): pure sector→sub-sector breakdown helper + verification script"
```

---

### Task 3: Desktop breakdown component

**Files:**
- Create: `components/holdings/HoldingsBreakdown.tsx`

**Interfaces:**
- Consumes: `buildHoldingsBreakdown`, `BreakdownInput` from `@/lib/holdingsBreakdown`.
- Produces: `export function HoldingsBreakdown({ enrichedHoldings }: { enrichedHoldings: BreakdownHolding[] })` and `export interface BreakdownHolding`. Task 4 renders `<HoldingsBreakdown enrichedHoldings={enrichedHoldings} />`.

- [ ] **Step 1: Implement the component**

Create `components/holdings/HoldingsBreakdown.tsx`:

```tsx
"use client";
import { Fragment, useMemo, useState } from "react";
import { buildHoldingsBreakdown, type BreakdownInput } from "@/lib/holdingsBreakdown";

// The subset of DashboardClient's enrichedHoldings element that this view needs.
export interface BreakdownHolding {
  asset_name: string;
  tikr?: string | null;
  liveValue: number;
  amt_invested: number;
  liveGain: number;
  stockData?: { sector?: string | null; subsector?: string | null; companyShort?: string | null } | null;
}

const cr = (n: number) => `₹${(n / 1e7).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
const pctTxt = (p: number | null) => (p == null ? "—" : `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`);
const ud = (n: number) => (n >= 0 ? "var(--color-positive)" : "var(--color-negative)");
const RIGHT = { textAlign: "right" as const, padding: "4px 8px" };

export function HoldingsBreakdown({ enrichedHoldings }: { enrichedHoldings: BreakdownHolding[] }) {
  const result = useMemo(() => {
    const items: BreakdownInput[] = enrichedHoldings.map((h) => ({
      assetName: h.stockData?.companyShort || h.asset_name,
      tikr: h.tikr ?? null,
      fallbackSector: h.stockData?.sector ?? null,
      fallbackSubsector: h.stockData?.subsector ?? null,
      value: h.liveValue,
      invested: h.amt_invested,
      gain: h.liveGain,
    }));
    return buildHoldingsBreakdown(items);
  }, [enrichedHoldings]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  if (!enrichedHoldings.length) {
    return <div style={{ color: "var(--color-text-muted)", padding: "1rem" }}>No holdings to break down.</div>;
  }

  return (
    <div className="animate-fade-in">
      {result.unclassifiedCount > 0 && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 8 }}>
          {result.unclassifiedCount} holding(s) could not be matched to a sector — shown under “Unclassified”.
        </div>
      )}
      <table className="w-full" style={{ borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
        <thead>
          <tr style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" }}>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Sector / Sub-sector / Holding</th>
            <th style={RIGHT}>Value</th>
            <th style={RIGHT}>Weight</th>
            <th style={RIGHT}>Invested</th>
            <th style={RIGHT}>P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {result.sectors.map((sec) => {
            const open = !collapsed[sec.sector];
            return (
              <Fragment key={sec.sector}>
                <tr
                  onClick={() => toggle(sec.sector)}
                  style={{ cursor: "pointer", fontWeight: 600, background: "rgba(127,127,127,0.06)", borderTop: "1px solid var(--color-border)" }}
                >
                  <td style={{ textAlign: "left", padding: "6px 8px" }}>{open ? "▾" : "▸"} {sec.sector}</td>
                  <td style={RIGHT}>{cr(sec.value)}</td>
                  <td style={RIGHT}>{sec.weightPct.toFixed(1)}%</td>
                  <td style={RIGHT}>{cr(sec.invested)}</td>
                  <td style={{ ...RIGHT, color: ud(sec.gain) }}>{cr(sec.gain)} ({pctTxt(sec.gainPct)})</td>
                </tr>
                {open &&
                  sec.subsectors.map((sub) => (
                    <Fragment key={sec.sector + "|" + sub.subsector}>
                      <tr style={{ color: "var(--color-text-secondary)" }}>
                        <td style={{ textAlign: "left", padding: "4px 8px 4px 24px", fontWeight: 500 }}>{sub.subsector || "Other"}</td>
                        <td style={RIGHT}>{cr(sub.value)}</td>
                        <td style={RIGHT}>{sub.weightPct.toFixed(1)}%</td>
                        <td style={RIGHT}>{cr(sub.invested)}</td>
                        <td style={{ ...RIGHT, color: ud(sub.gain) }}>{cr(sub.gain)} ({pctTxt(sub.gainPct)})</td>
                      </tr>
                      {sub.lines.map((ln) => (
                        <tr key={sec.sector + "|" + sub.subsector + "|" + ln.assetName} style={{ fontSize: "var(--text-xs)" }}>
                          <td style={{ textAlign: "left", padding: "3px 8px 3px 40px", color: "var(--color-text-primary)" }}>{ln.assetName}</td>
                          <td style={RIGHT}>{cr(ln.value)}</td>
                          <td style={{ ...RIGHT, color: "var(--color-text-muted)" }}>{ln.weightPct.toFixed(1)}%</td>
                          <td style={RIGHT}>{cr(ln.invested)}</td>
                          <td style={{ ...RIGHT, color: ud(ln.gain) }}>{cr(ln.gain)} ({pctTxt(ln.gainPct)})</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
              </Fragment>
            );
          })}
          <tr style={{ borderTop: "2px solid var(--color-border)", fontWeight: 700 }}>
            <td style={{ textAlign: "left", padding: "8px" }}>Total</td>
            <td style={{ ...RIGHT, padding: "8px" }}>{cr(result.total.value)}</td>
            <td style={{ ...RIGHT, padding: "8px" }}>100.0%</td>
            <td style={{ ...RIGHT, padding: "8px" }}>{cr(result.total.invested)}</td>
            <td style={{ ...RIGHT, padding: "8px", color: ud(result.total.gain) }}>{cr(result.total.gain)} ({pctTxt(result.total.gainPct)})</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `--color-text-secondary` is unknown to your IDE, it is still a valid CSS custom-property string — tsc does not validate CSS tokens.)

- [ ] **Step 3: Commit**

```bash
git add components/holdings/HoldingsBreakdown.tsx
git commit -m "feat(holdings): desktop Sector breakdown table component"
```

---

### Task 4: Wire the desktop "Sectors" sub-tab (AUTHORIZED frozen edit)

**Files:**
- Modify: `app/dashboard/DashboardClient.tsx:770`, `:2828`, `:2836`, and after `:3203`

> **Boundary note:** This file is frozen; these 3 insertions are pre-authorized (spec §2). If the `boundary-guard` PreToolUse hook blocks the edit, that is expected — re-run the edit with `OCTOTUSK_ALLOW_PIPELINE_EDIT=1` set (or approve when prompted). No other lines in this file may change.

**Interfaces:**
- Consumes: `HoldingsBreakdown` from `@/components/holdings/HoldingsBreakdown` (Task 3); `enrichedHoldings` (existing local).

- [ ] **Step 1: Add the import**

Near the existing `import { SegmentsTab } from "./SegmentsTab";` (line 11), add:

```tsx
import { HoldingsBreakdown } from "@/components/holdings/HoldingsBreakdown";
```

- [ ] **Step 2: Extend the sub-tab union (line 770)**

Replace:

```tsx
  const [holdingsSubTab, setHoldingsSubTab] = useState<"portfolio" | "segments" | "fo">("portfolio");
```

with:

```tsx
  const [holdingsSubTab, setHoldingsSubTab] = useState<"portfolio" | "segments" | "breakdown" | "fo">("portfolio");
```

- [ ] **Step 3: Add the tab button + label (lines 2828 and 2836)**

Replace the array literal on line 2828:

```tsx
                {(["portfolio", "segments", "fo"] as const).map(st => (
```

with:

```tsx
                {(["portfolio", "segments", "breakdown", "fo"] as const).map(st => (
```

Then replace the label expression on line 2836:

```tsx
                    {st === "portfolio" ? "Portfolio" : st === "segments" ? "Segments" : "F&O"}
```

with:

```tsx
                    {st === "portfolio" ? "Portfolio" : st === "segments" ? "Segments" : st === "breakdown" ? "Sectors" : "F&O"}
```

- [ ] **Step 4: Add the render branch (after line 3203, before the `fo` branch)**

Immediately after the closing `)}` of the `holdingsSubTab === "segments"` block (line 3203), insert:

```tsx
              {holdingsSubTab === "breakdown" && (
                <HoldingsBreakdown enrichedHoldings={enrichedHoldings} />
              )}
```

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Boundary check — confirm only authorized lines changed**

Run: `git diff --stat app/dashboard/DashboardClient.tsx` then invoke the `/boundary-check` skill.
Expected: `DashboardClient.tsx` is the only frozen file touched, with a small diff (1 import + union + array + label + render branch). Call this out explicitly in the commit body.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/DashboardClient.tsx
git commit -m "feat(holdings): wire desktop 'Sectors' breakdown sub-tab (authorized minimal edit to frozen DashboardClient)"
```

---

### Task 5: Mobile breakdown view + styles

**Files:**
- Create: `app/m/portfolio/BreakdownView.tsx`
- Modify: `app/m.css` (append new `.m-bd-*` classes)

**Interfaces:**
- Consumes: `buildHoldingsBreakdown`, `BreakdownInput` from `@/lib/holdingsBreakdown`; `fmtMoney`, `fmtPctRaw` from `@/lib/format`.
- Produces: `export default function BreakdownView({ items }: { items: BreakdownInput[] })`. Task 6 renders `<BreakdownView items={breakdownItems} />`.

- [ ] **Step 1: Implement the mobile view**

Create `app/m/portfolio/BreakdownView.tsx`:

```tsx
"use client";
import { useMemo, useState } from "react";
import { buildHoldingsBreakdown, type BreakdownInput } from "@/lib/holdingsBreakdown";
import { fmtMoney, fmtPctRaw } from "@/lib/format";

export default function BreakdownView({ items }: { items: BreakdownInput[] }) {
  const result = useMemo(() => buildHoldingsBreakdown(items), [items]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  if (!items.length) return <div className="m-empty">No holdings to break down.</div>;

  return (
    <div className="m-bd">
      {result.unclassifiedCount > 0 && (
        <p className="m-count" style={{ textAlign: "left" }}>
          {result.unclassifiedCount} holding(s) unmatched — under “Unclassified”.
        </p>
      )}
      {result.sectors.map((sec) => {
        const isOpen = !!open[sec.sector];
        return (
          <div key={sec.sector} className="m-bd-sector">
            <button className="m-bd-head" onClick={() => toggle(sec.sector)} aria-expanded={isOpen}>
              <span className="m-bd-caret" aria-hidden>{isOpen ? "▾" : "▸"}</span>
              <span className="m-bd-name">{sec.sector}</span>
              <span className="m-bd-wt">{sec.weightPct.toFixed(1)}%</span>
              <span className="m-bd-val">{fmtMoney(sec.value)}</span>
            </button>
            <div className={`m-bd-pnl ${sec.gain >= 0 ? "is-up" : "is-down"}`}>
              {fmtMoney(sec.gain)} ({fmtPctRaw(sec.gainPct ?? null)}) · inv {fmtMoney(sec.invested)}
            </div>
            {isOpen &&
              sec.subsectors.map((sub) => (
                <div key={sub.subsector} className="m-bd-subwrap">
                  <div className="m-bd-sub">
                    <span className="m-bd-sub-name">{sub.subsector || "Other"}</span>
                    <span className="m-bd-sub-val">{fmtMoney(sub.value)} · {sub.weightPct.toFixed(1)}%</span>
                  </div>
                  {sub.lines.map((ln) => (
                    <div key={ln.assetName} className="m-bd-line">
                      <span className="m-bd-line-name">{ln.assetName}</span>
                      <span className="m-bd-line-val">{fmtMoney(ln.value)}</span>
                      <span className={`m-bd-line-pnl ${ln.gain >= 0 ? "is-up" : "is-down"}`}>{fmtPctRaw(ln.gainPct ?? null)}</span>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        );
      })}
      <div className="m-bd-total">
        <span>Total</span>
        <span>{fmtMoney(result.total.value)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append the styles to `app/m.css`**

Add at the end of `app/m.css` (all selectors stay under the existing `[data-mroot]` scope — keep them prefixed so they inherit it; if `app/m.css` is not already wrapped, prefix each with `[data-mroot] `):

```css
/* Holdings breakdown (Sector → Sub-sector) */
.m-bd { display: flex; flex-direction: column; gap: var(--space-2); }
.m-bd-sector { border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
.m-bd-head {
  display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: var(--space-2);
  width: 100%; padding: var(--space-3); background: transparent; border: 0; cursor: pointer;
  color: var(--color-text-primary); font-size: var(--text-sm); font-weight: 600; text-align: left;
}
.m-bd-caret { color: var(--color-text-muted); }
.m-bd-wt { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.m-bd-val { font-variant-numeric: tabular-nums; }
.m-bd-pnl { padding: 0 var(--space-3) var(--space-2); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
.m-bd-subwrap { border-top: 1px solid var(--color-border); }
.m-bd-sub {
  display: flex; justify-content: space-between; padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs); font-weight: 600; color: var(--color-text-secondary); background: rgba(127,127,127,0.05);
}
.m-bd-line {
  display: grid; grid-template-columns: 1fr auto auto; gap: var(--space-2); align-items: center;
  padding: var(--space-1) var(--space-3) var(--space-1) var(--space-4); font-size: var(--text-xs);
}
.m-bd-line-name { color: var(--color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-bd-line-val, .m-bd-line-pnl { font-variant-numeric: tabular-nums; }
.m-bd-total {
  display: flex; justify-content: space-between; padding: var(--space-3);
  font-weight: 700; border-top: 2px solid var(--color-border); font-variant-numeric: tabular-nums;
}
```

> If any `--space-*` / `--radius-md` token name differs in this repo, grep `app/globals.css` for the actual token and substitute; do not invent new tokens.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/m/portfolio/BreakdownView.tsx app/m.css
git commit -m "feat(m/portfolio): mobile sector breakdown accordion view + styles"
```

---

### Task 6: Toggle the mobile breakdown inside Portfolio

**Files:**
- Modify: `app/m/portfolio/PortfolioClient.tsx`

**Interfaces:**
- Consumes: `BreakdownView` (Task 5), `BreakdownInput` from `@/lib/holdingsBreakdown`; existing `enriched` local.

- [ ] **Step 1: Add imports**

After line 8 (`import { fmtMoney, fmtPctRaw, fmtRupee } from "@/lib/format";`), add:

```tsx
import BreakdownView from "./BreakdownView";
import type { BreakdownInput } from "@/lib/holdingsBreakdown";
```

- [ ] **Step 2: Add view state**

After the existing `const [sort, setSort] = useState<SortKey>("value");` (line 66), add:

```tsx
  const [view, setView] = useState<"holdings" | "breakdown">("holdings");
```

- [ ] **Step 3: Build breakdown inputs**

After the `const totals = useMemo(...)` block (line 96), add:

```tsx
  const breakdownItems = useMemo<BreakdownInput[]>(
    () =>
      enriched.map((h) => ({
        assetName: h.name,
        tikr: h.tikr,
        value: h.liveValue,
        invested: h.amt_invested,
        gain: h.liveGain,
      })),
    [enriched],
  );
```

- [ ] **Step 4: Add the Holdings/Breakdown toggle**

Immediately before the `{/* Sort */}` comment (line 156), insert a view toggle:

```tsx
      {/* View toggle */}
      <div className="m-chips">
        {(["holdings", "breakdown"] as const).map((v) => (
          <button
            key={v}
            className={`m-chip${view === v ? " is-active" : ""}`}
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {v === "holdings" ? "Holdings" : "Sectors"}
          </button>
        ))}
      </div>
```

- [ ] **Step 5: Gate the existing list + render the breakdown**

Wrap the existing `{/* Sort */}` block AND the `{/* Holdings */}` `m-cardlist` block so they only show in the holdings view, and add the breakdown view. Specifically, change the opening of the `{/* Sort */}` block from:

```tsx
      {/* Sort */}
      <div className="m-chips">
```

to:

```tsx
      {view === "holdings" && (<>
      {/* Sort */}
      <div className="m-chips">
```

and close the fragment right after the holdings `m-cardlist` closing `</div>` (the block that ends at line 205, before `{/* F&O */}`), inserting the breakdown branch:

```tsx
      </div>
      </>)}

      {view === "breakdown" && <BreakdownView items={breakdownItems} />}

      {/* F&O */}
```

(The F&O section stays outside the toggle — it always shows under both views, matching the spec's "F&O excluded from the sector breakdown" note.)

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/m/portfolio/PortfolioClient.tsx
git commit -m "feat(m/portfolio): Holdings/Sectors view toggle wiring"
```

---

### Task 7: Full verification + reviews

**Files:** none (verification only)

- [ ] **Step 1: Type check + breakdown verification**

Run:
```bash
npx tsc --noEmit && npx tsx scripts/verify-holdings-breakdown.ts
```
Expected: tsc clean; `All 6 checks passed.`

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds (no type/import errors in the new components).

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`, then:
- Desktop `/dashboard` → Holdings tab → unlock PIN → click **Sectors** sub-tab. Confirm: sectors sorted by value desc, sub-sectors + line items expand/collapse, the **Total** row value matches the Holdings summary "Portfolio Value" KPI, and there is **no** "Unclassified" sector (post Task 1).
- Mobile `/m/portfolio` → unlock PIN → tap **Sectors** toggle. Confirm the accordion renders, sector totals + weights look right, F&O still shows.

- [ ] **Step 4: Boundary check**

Invoke `/boundary-check`.
Expected: the only frozen file in the diff is `app/dashboard/DashboardClient.tsx` with the authorized wiring lines.

- [ ] **Step 5: Security check (mobile diff)**

Invoke `/security-check`.
Expected: no holdings written to storage/URL/push; no new fetch; breakdown reuses the already-unlocked in-memory holdings. Pass.

- [ ] **Step 6: Final commit (if review fixes were needed)**

```bash
git add -A && git commit -m "chore(holdings): breakdown verification + review fixes"
```

---

## Self-Review

**Spec coverage:**
- §3.1 (15 mappings) → Task 1 ✓ (J&KBANK = Public Sector Bank per user override ✓)
- §3.2 (surface Unclassified, don't hide) → `unclassifiedCount` surfaced in both renderers (Tasks 3, 5) ✓
- §4.1 (pure helper + canonical guard + invariants) → Task 2 ✓
- §4.2 (desktop component + minimal frozen wiring) → Tasks 3, 4 ✓
- §4.3 (mobile view + toggle, ≤400 lines, no new fetch) → Tasks 5, 6 ✓
- §5 (value + invested + P&L + weight%, "Other", "—", en-IN) → Tasks 3, 5 ✓
- §6 (F&O excluded; cap-tier not duplicated) → Task 6 Step 5 ✓
- §7 (edge cases) → covered by Task 2 verification checks ✓
- §8 (security) → Task 7 Step 5 ✓
- §10 (verification) → Task 7 ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; the only conditional guidance is "grep the real token name if it differs," which is a safety net, not a missing value.

**Type consistency:** `buildHoldingsBreakdown` / `BreakdownInput` / `BreakdownResult` / `gainPct: number|null` used identically across Tasks 2–6. `BreakdownHolding` (desktop) and the mobile `BreakdownInput` mapping both supply `value/invested/gain`. `fmtPctRaw(null)` → `—` (verified against `lib/format.ts`). `enrichedHoldings` element fields (`asset_name`, `tikr`, `liveValue`, `amt_invested`, `liveGain`, `stockData.{sector,subsector,companyShort}`) match `DashboardClient.tsx:1566-1575` + `:1454`.
