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
