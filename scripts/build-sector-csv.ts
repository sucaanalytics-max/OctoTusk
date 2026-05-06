#!/usr/bin/env npx tsx
/**
 * Build data/sector-classification.csv from data/database.json + data/sector-mapping.json.
 * One-shot helper — produces the CSV the user pastes from when updating vF files.
 *
 * NOTE: this reads database.json (a snapshot, possibly stale). For an audit against
 * LIVE OneDrive state, use scripts/rescan-sectors.ts instead.
 */
import * as fs from "fs";
import * as path from "path";

interface SectorMapping {
  tikrToSector: Record<string, { sector: string; subsector: string }>;
  sectorOrder: string[];
  substantiveNotes: Record<string, string>;
}
const mappingPath = path.resolve(__dirname, "..", "data", "sector-mapping.json");
const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8")) as SectorMapping;
const TIKR_TO_SECTOR = mapping.tikrToSector;

interface DbStock { tikr: string; official_name?: string; sector?: string; subsector?: string; }

const dbPath = path.resolve(__dirname, "..", "data", "database.json");
const db = JSON.parse(fs.readFileSync(dbPath, "utf8")) as { stocks: DbStock[] };

// Stocks present in OneDrive but missing from database.json — current state captured manually
// from the live JVB Output / vF read on 2026-05-06.
const EXTRA_LIVE_STOCKS: DbStock[] = [
  // Angel One: vF file exists in OneDrive but no JVB row and not in database.json (sync skipped/failed)
  { tikr: "ANGELONE", official_name: "ANGEL ONE LIMITED", sector: "BFSI", subsector: "Exchanges & Capital Markets" },
  // PSU Bank BeES ETF: row 96 in live JVB Output, sector/subsector empty, missing from database.json
  { tikr: "XBOM:590108", official_name: "Nippon India ETF Nifty PSU Bank BeES", sector: "", subsector: "" },
];

const allStocks: DbStock[] = [...db.stocks, ...EXTRA_LIVE_STOCKS];

function csvField(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const SECTOR_ORDER: Record<string, number> = Object.fromEntries(
  mapping.sectorOrder.map((s, i) => [s, i + 1])
);

const rows: { tikr: string; official: string; curSec: string; curSub: string; newSec: string; newSub: string; sectorChanged: string; subsectorChanged: string; status: string; notes: string }[] = [];

const SUBSTANTIVE_NOTE = mapping.substantiveNotes;

const SUGGESTED_SECTOR_FOR_TIKR_ALIAS_KEYS: Record<string, string> = {};

for (const stock of allStocks) {
  const proposed = TIKR_TO_SECTOR[stock.tikr];
  if (!proposed) continue;
  const curSec = stock.sector || "";
  const curSub = stock.subsector || "";
  const sectorChanged = curSec !== proposed.sector;
  const subsectorChanged = curSub !== proposed.subsector;
  const anyChange = sectorChanged || subsectorChanged;
  const note = SUBSTANTIVE_NOTE[stock.tikr] || "";
  rows.push({
    tikr: stock.tikr,
    official: stock.official_name || "",
    curSec,
    curSub,
    newSec: proposed.sector,
    newSub: proposed.subsector,
    sectorChanged: sectorChanged ? "Y" : "",
    subsectorChanged: subsectorChanged ? "Y" : "",
    status: anyChange ? (note ? "CORRECTION" : "rename") : "no-change",
    notes: note,
  });
  SUGGESTED_SECTOR_FOR_TIKR_ALIAS_KEYS[stock.tikr] = proposed.sector;
}

// Sort: by proposed sector group, then by status (CORRECTION first), then alphabetically by TIKR
rows.sort((a, b) => {
  const sa = SECTOR_ORDER[a.newSec] ?? 99;
  const sb = SECTOR_ORDER[b.newSec] ?? 99;
  if (sa !== sb) return sa - sb;
  const statusOrder: Record<string, number> = { CORRECTION: 0, rename: 1, "no-change": 2 };
  const sta = statusOrder[a.status] ?? 9;
  const stb = statusOrder[b.status] ?? 9;
  if (sta !== stb) return sta - stb;
  return a.tikr.localeCompare(b.tikr);
});

const header = ["TIKR", "Official Name", "Current Sector", "Current Subsector", "New Sector (F5)", "New Subsector (G5)", "Sector Changed", "Subsector Changed", "Status", "Notes"];
const lines: string[] = [header.map(csvField).join(",")];
for (const r of rows) {
  lines.push([r.tikr, r.official, r.curSec, r.curSub, r.newSec, r.newSub, r.sectorChanged, r.subsectorChanged, r.status, r.notes].map(csvField).join(","));
}

const outPath = path.resolve(__dirname, "..", "data", "sector-classification.csv");
fs.writeFileSync(outPath, lines.join("\n") + "\n");

const corrections = rows.filter((r) => r.status === "CORRECTION").length;
const renames = rows.filter((r) => r.status === "rename").length;
const noChange = rows.filter((r) => r.status === "no-change").length;
console.log(`Wrote ${rows.length} rows to ${outPath}`);
console.log(`  Corrections (substantive):    ${corrections}`);
console.log(`  Renames (NSE-style cleanup):  ${renames}`);
console.log(`  No change:                    ${noChange}`);
