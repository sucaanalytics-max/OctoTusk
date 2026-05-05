/**
 * Builds data/dhan-eq-instruments-by-tikr.json by mapping each TIKR in
 * data/database.json's ticker_map to its Dhan equity securityId via the
 * detailed instrument master CSV.
 *
 * Run: npx tsx scripts/build-dhan-eq-instruments.ts
 *
 * Re-run whenever ticker_map changes (new stocks added).
 */

"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(REPO_ROOT, "data", "database.json");
const OUT_PATH = path.join(REPO_ROOT, "data", "dhan-eq-instruments-by-tikr.json");
const MASTER_URL = "https://images.dhan.co/api-data/api-scrip-master-detailed.csv";

interface EqEntry {
  securityId: number;
  exchange: "NSE_EQ" | "BSE_EQ";
}

function parseCsvLine(line: string): string[] {
  // Detailed master uses simple comma separation in the columns we read.
  return line.split(",");
}

async function main(): Promise<void> {
  console.log(`[build-eq] Fetching ${MASTER_URL}...`);
  const res = await fetch(MASTER_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const raw = await res.text();
  const lines = raw.split("\n");
  console.log(`[build-eq] CSV rows: ${lines.length}`);

  const header = parseCsvLine(lines[0]);
  const idx = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Column "${name}" not found`);
    return i;
  };
  const IDX_EXCH = idx("EXCH_ID");
  const IDX_SEGMENT = idx("SEGMENT");
  const IDX_SECURITY_ID = idx("SECURITY_ID");
  const IDX_INSTRUMENT = idx("INSTRUMENT");
  const IDX_UNDERLYING = idx("UNDERLYING_SYMBOL");
  const IDX_SERIES = idx("SERIES");

  // SEGMENT=E + INSTRUMENT=EQUITY captures cash-segment scrips.
  // Series filter covers tradable groups across both exchanges:
  //   NSE: EQ, BE, SM (SME), ST (suspended-but-listed), MF (mutual funds tradable)
  //   BSE: A, B, T, F, X, M, G, NS, NT, IF (REIT/InvIT) etc — accept all.
  const NSE_TRADABLE_SERIES = new Set(["EQ", "BE", "SM", "BL", "BZ", "GB", "GS", "IL", "MF", "ST"]);

  const nseIdx = new Map<string, EqEntry>();
  const bseIdx = new Map<string, EqEntry>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = parseCsvLine(line);
    if (f.length <= IDX_SERIES) continue;
    if (f[IDX_SEGMENT] !== "E") continue;
    if (f[IDX_INSTRUMENT] !== "EQUITY") continue;
    const sym = (f[IDX_UNDERLYING] || "").toUpperCase();
    if (!sym) continue;
    const id = Number(f[IDX_SECURITY_ID]);
    if (!id) continue;
    const exch = f[IDX_EXCH];
    const series = f[IDX_SERIES];
    if (exch === "NSE") {
      if (!NSE_TRADABLE_SERIES.has(series)) continue;
      if (!nseIdx.has(sym)) nseIdx.set(sym, { securityId: id, exchange: "NSE_EQ" });
    } else if (exch === "BSE") {
      // Accept all BSE equity series (A/B/T/X/M/F/G/NS/NT/IF for REITs/InvITs).
      if (!bseIdx.has(sym)) bseIdx.set(sym, { securityId: id, exchange: "BSE_EQ" });
    }
  }
  console.log(`[build-eq] Indexed: NSE=${nseIdx.size} BSE=${bseIdx.size}`);

  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  const tickerMap: Record<string, string> = db.ticker_map || {};

  const out: Record<string, EqEntry> = {};
  const unmatched: Array<{ tikr: string; yahoo: string }> = [];

  for (const [tikr, yahooSymbol] of Object.entries(tickerMap)) {
    const upper = yahooSymbol.toUpperCase();
    const isBo = upper.endsWith(".BO");
    let sym = upper.replace(/\.(NS|BO)$/, "");
    // Yahoo SME symbols carry a "-SM" or "-SME" suffix; Dhan stores them
    // without the suffix.
    sym = sym.replace(/-(SM|SME)$/, "");
    let entry: EqEntry | undefined;
    if (isBo) {
      entry = bseIdx.get(sym) ?? nseIdx.get(sym);
    } else {
      entry = nseIdx.get(sym) ?? bseIdx.get(sym);
    }
    if (entry) {
      out[tikr] = entry;
    } else {
      unmatched.push({ tikr, yahoo: yahooSymbol });
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`[build-eq] Wrote ${Object.keys(out).length} mappings to ${OUT_PATH}`);
  if (unmatched.length > 0) {
    console.log(`[build-eq] ${unmatched.length} unmatched (Yahoo fallback):`);
    for (const u of unmatched) console.log(`  - ${u.tikr} (${u.yahoo})`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
