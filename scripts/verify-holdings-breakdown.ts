// Run: npx tsx scripts/verify-holdings-breakdown.ts
// Asserts buildHoldingsBreakdown grouping/invariants + full canonical coverage of the universe.
import assert from "node:assert/strict";
import {
  buildHoldingsBreakdown,
  topSectorsWithOther,
  SECTOR_CONCENTRATED_PCT,
  SECTOR_DOMINANT_PCT,
  type BreakdownInput,
  type SectorGroup,
} from "../lib/holdingsBreakdown";
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

// ── summary ──────────────────────────────────────────────────────────────────
check("summary: constants exported at expected values", () => {
  assert.equal(SECTOR_CONCENTRATED_PCT, 25);
  assert.equal(SECTOR_DOMINANT_PCT, 40);
});

check("summary: concentrated — top sector ≥25%", () => {
  // Financials 60, IT 30, Power 10 → total 100, weights 60/30/10
  const r = buildHoldingsBreakdown([
    { assetName: "HDFC Bank", tikr: "HDFCBANK",    value: 60, invested: 50, gain: 10 },
    { assetName: "TCS",       tikr: "TATAELXSI",   value: 30, invested: 25, gain:  5 },
    { assetName: "NTPC",      tikr: "NTPC",         value: 10, invested:  8, gain:  2 },
  ]);
  const { summary } = r;
  assert.ok(summary, "summary is present on BreakdownResult");
  assert.equal(summary.sectorCount, 3);
  assert.ok(summary.largestSector !== null, "largestSector is non-null");
  // largest sector is Financial Services (value 60, weightPct 60%)
  assert.ok(summary.largestSector!.weightPct > 59 && summary.largestSector!.weightPct < 61,
    `maxSectorPct should be ~60, got ${summary.largestSector!.weightPct}`);
  assert.ok(summary.maxSectorPct > 59 && summary.maxSectorPct < 61,
    `maxSectorPct should be ~60, got ${summary.maxSectorPct}`);
  assert.ok(summary.top3WeightPct > 99 && summary.top3WeightPct <= 100,
    `top3WeightPct should be ~100, got ${summary.top3WeightPct}`);
  assert.equal(summary.isConcentrated, true, "60% ≥ 25 → concentrated");
});

check("summary: NOT concentrated when all sectors below 25%", () => {
  // 5 sectors at 20 each → 20% each, all below 25
  const items: BreakdownInput[] = [
    { assetName: "HDFC Bank",  tikr: "HDFCBANK",   value: 20, invested: 18, gain: 2 },
    { assetName: "TCS",        tikr: "TATAELXSI",  value: 20, invested: 18, gain: 2 },
    { assetName: "NTPC",       tikr: "NTPC",        value: 20, invested: 18, gain: 2 },
    { assetName: "Cipla",      tikr: "CIPLA",       value: 20, invested: 18, gain: 2 },
    { assetName: "DLF",        tikr: "DLF",         value: 20, invested: 18, gain: 2 },
  ];
  const { summary } = buildHoldingsBreakdown(items);
  assert.equal(summary.isConcentrated, false, "20% < 25 → not concentrated");
  assert.ok(summary.maxSectorPct < 25, `maxSectorPct should be <25, got ${summary.maxSectorPct}`);
});

check("summary: empty input → zeros + null largestSector", () => {
  const { summary } = buildHoldingsBreakdown([]);
  assert.equal(summary.sectorCount, 0);
  assert.equal(summary.largestSector, null);
  assert.equal(summary.top3WeightPct, 0);
  assert.equal(summary.maxSectorPct, 0);
  assert.equal(summary.isConcentrated, false);
});

check("summary: sectorCount excludes zero-value sectors (if any)", () => {
  // Only two non-zero sectors
  const r = buildHoldingsBreakdown([
    { assetName: "A", tikr: "HDFCBANK",  value: 50, invested: 40, gain: 10 },
    { assetName: "B", tikr: "TATAELXSI", value: 50, invested: 40, gain: 10 },
  ]);
  assert.equal(r.summary.sectorCount, 2);
});

// ── topSectorsWithOther ───────────────────────────────────────────────────────
check("topSectorsWithOther: 8 sectors, n=6 → 7 items with Other last", () => {
  // Use one TIKR per distinct canonical sector to guarantee 8 sectors
  // Sectors: Financial Services, IT, Power, Services, FMCG, Construction, Metals & Mining, Healthcare
  const items: BreakdownInput[] = [
    { assetName: "MCX",         tikr: "MCX",         value: 80, invested: 70, gain: 10 }, // Financial Services
    { assetName: "COFORGE",     tikr: "COFORGE",     value: 70, invested: 60, gain: 10 }, // IT
    { assetName: "NTPC",        tikr: "NTPC",         value: 60, invested: 50, gain: 10 }, // Power
    { assetName: "ADANIPORTS",  tikr: "ADANIPORTS",  value: 50, invested: 40, gain: 10 }, // Services
    { assetName: "VBL",         tikr: "VBL",          value: 40, invested: 35, gain:  5 }, // FMCG
    { assetName: "GPTINFRA",    tikr: "GPTINFRA",    value: 30, invested: 28, gain:  2 }, // Construction
    { assetName: "VEDL",        tikr: "VEDL",         value: 20, invested: 18, gain:  2 }, // Metals & Mining
    { assetName: "SURAKSHA",    tikr: "SURAKSHA",    value: 10, invested:  9, gain:  1 }, // Healthcare
  ];
  const r = buildHoldingsBreakdown(items);
  // We expect 8 distinct sectors; confirm before testing topSectorsWithOther
  assert.equal(r.sectors.length, 8, `Expected 8 sectors, got ${r.sectors.length}: ${r.sectors.map(s=>s.sector).join(", ")}`);
  const slices = topSectorsWithOther(r.sectors, 6);
  // 6 head + 1 Other = 7
  assert.equal(slices.length, 7, `expected 7 slices, got ${slices.length}`);
  const lastSlice = slices[slices.length - 1];
  assert.equal(lastSlice.isOther, true, "Last slice must be Other");
  assert.equal(lastSlice.key, "Other");
  // Σ value must equal Σ sectors.value
  const totalSectorsValue = r.sectors.reduce((s, x) => s + x.value, 0);
  const totalSlicesValue = slices.reduce((s, x) => s + x.value, 0);
  assert.ok(Math.abs(totalSlicesValue - totalSectorsValue) < 0.001,
    `Σ slices.value (${totalSlicesValue}) ≠ Σ sectors.value (${totalSectorsValue})`);
  // Σ weightPct should be approximately 100
  const totalWt = slices.reduce((s, x) => s + x.weightPct, 0);
  assert.ok(totalWt > 99.9 && totalWt <= 100.01, `Σ weightPct should ≈100, got ${totalWt}`);
});

check("topSectorsWithOther: ≤6 sectors → NO Other item", () => {
  // Two distinct canonical sectors
  const items: BreakdownInput[] = [
    { assetName: "MCX",     tikr: "MCX",     value: 50, invested: 40, gain: 10 }, // Financial Services
    { assetName: "COFORGE", tikr: "COFORGE", value: 50, invested: 40, gain: 10 }, // IT
  ];
  const r = buildHoldingsBreakdown(items);
  const slices = topSectorsWithOther(r.sectors, 6);
  assert.ok(!slices.some((s) => s.isOther), "No Other slice when ≤6 sectors");
  assert.equal(slices.length, r.sectors.length);
});

check("topSectorsWithOther: each head slice has isOther===false", () => {
  // 7 distinct canonical sectors → top 6 are head (isOther:false), 1 is tail ("Other")
  const items: BreakdownInput[] = [
    { assetName: "MCX",        tikr: "MCX",        value: 100, invested:  80, gain: 20 }, // Financial Services
    { assetName: "COFORGE",    tikr: "COFORGE",    value:  80, invested:  70, gain: 10 }, // IT
    { assetName: "NTPC",       tikr: "NTPC",        value:  60, invested:  50, gain: 10 }, // Power
    { assetName: "ADANIPORTS", tikr: "ADANIPORTS", value:  40, invested:  35, gain:  5 }, // Services
    { assetName: "VBL",        tikr: "VBL",         value:  20, invested:  18, gain:  2 }, // FMCG
    { assetName: "GPTINFRA",   tikr: "GPTINFRA",   value:  10, invested:   8, gain:  2 }, // Construction
    { assetName: "VEDL",       tikr: "VEDL",        value:   5, invested:   4, gain:  1 }, // Metals & Mining
  ];
  const r = buildHoldingsBreakdown(items);
  const slices = topSectorsWithOther(r.sectors, 6);
  const headSlices = slices.filter((s) => !s.isOther);
  assert.ok(headSlices.length <= 6, "At most 6 head slices");
  headSlices.forEach((s) => assert.equal(s.isOther, false));
});

console.log(`\nAll ${n} checks passed.`);
