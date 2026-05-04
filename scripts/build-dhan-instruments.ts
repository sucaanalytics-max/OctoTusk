// Re-run when new expiry month rolls in: npx tsx scripts/build-dhan-instruments.ts
//
// Downloads the Dhan scrip master CSV and extracts NSE F&O instruments
// (FUTSTK + OPTSTK), building a lookup keyed by:
//   futures: `${underlying}-FUT-${YYYY-MM-DD}--`
//   options: `${underlying}-OPT-${YYYY-MM-DD}-${strike}-${CE|PE}`
//
// Output: data/dhan-fo-instruments.json

"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "data", "dhan-fo-instruments.json");
const CSV_URL = "https://images.dhan.co/api-data/api-scrip-master.csv";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InstrumentEntry {
  securityId: number;
  lotSize?: number;
}

type LookupTable = Record<string, InstrumentEntry>;

// ─── CSV parsing ─────────────────────────────────────────────────────────────

/**
 * Minimal CSV line parser that handles quoted fields.
 * Does NOT handle multi-line quoted values (none expected in this CSV).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Key builder ─────────────────────────────────────────────────────────────

/**
 * Build lookup key from raw CSV fields.
 *
 * SEM_TRADING_SYMBOL examples:
 *   "BAJAJFINSV-May2026-FUT"        → futures
 *   "CGPOWER-Jun2026-840-PE"        → put option
 *   "EICHERMOT-May2026-5400-CE"     → call option
 *
 * SEM_EXPIRY_DATE: "2026-05-26 14:30:00"  → extract "2026-05-26"
 * SEM_OPTION_TYPE: CE | PE | XX (XX = futures)
 * SEM_STRIKE_PRICE: "-0.01000" for futures, "840.00000" for options
 */
function buildKey(
  tradingSymbol: string,
  expiryDate: string,
  strikePrice: string,
  optionType: string,
  instrumentName: string
): string | null {
  // Extract underlying: everything before the first dash+month pattern
  // e.g. "BAJAJFINSV-May2026-FUT" → "BAJAJFINSV"
  //       "EICHERMOT-May2026-5400-CE" → "EICHERMOT"
  const dashIdx = tradingSymbol.indexOf("-");
  if (dashIdx === -1) return null;
  const underlying = tradingSymbol.substring(0, dashIdx);

  // Normalise expiry to YYYY-MM-DD
  const expiry = expiryDate.split(" ")[0]; // strip time component

  const isFuture =
    instrumentName === "FUTSTK" || optionType === "XX";

  if (isFuture) {
    // Futures key: BAJAJFINSV-FUT-2026-05-26--
    return `${underlying}-FUT-${expiry}--`;
  }

  // Options: normalise strike (drop trailing zeros after decimal point but keep integer)
  // e.g. "840.00000" → "840", "4000.00000" → "4000", "2600.50000" → "2600.5"
  const strikeNum = parseFloat(strikePrice);
  if (isNaN(strikeNum)) return null;
  // Format: remove unnecessary decimals
  const strikeStr =
    strikeNum % 1 === 0 ? String(Math.round(strikeNum)) : String(strikeNum);

  const optType = optionType === "CE" || optionType === "PE" ? optionType : null;
  if (!optType) return null;

  // Options key: BSE-OPT-2026-05-26-4000-CE
  return `${underlying}-OPT-${expiry}-${strikeStr}-${optType}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Downloading scrip master from ${CSV_URL} …`);
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const raw = await res.text();

  const lines = raw.split("\n");
  console.log(`Total rows in CSV (including header): ${lines.length}`);

  // Parse header
  const header = parseCsvLine(lines[0]);
  console.log("\nCSV columns:", header.join(", "), "\n");

  // Column indices (validate at runtime)
  const col = (name: string): number => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`Column "${name}" not found in CSV header`);
    return idx;
  };

  const IDX_EXCH       = col("SEM_EXM_EXCH_ID");
  const IDX_SEGMENT    = col("SEM_SEGMENT");
  const IDX_SEC_ID     = col("SEM_SMST_SECURITY_ID");
  const IDX_INSTR_NAME = col("SEM_INSTRUMENT_NAME");
  const IDX_TRADING_SYM= col("SEM_TRADING_SYMBOL");
  const IDX_LOT_UNITS  = col("SEM_LOT_UNITS");
  const IDX_EXPIRY_DATE= col("SEM_EXPIRY_DATE");
  const IDX_STRIKE     = col("SEM_STRIKE_PRICE");
  const IDX_OPT_TYPE   = col("SEM_OPTION_TYPE");

  const lookup: LookupTable = {};
  let nseFnoRows = 0;
  let skippedKeys = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);

    // Filter: NSE exchange, D (derivatives) segment, FUTSTK or OPTSTK instrument
    const exch     = fields[IDX_EXCH];
    const segment  = fields[IDX_SEGMENT];
    const instrName= fields[IDX_INSTR_NAME];

    if (exch !== "NSE" || segment !== "D") continue;
    if (instrName !== "FUTSTK" && instrName !== "OPTSTK") continue;

    nseFnoRows++;

    const tradingSymbol = fields[IDX_TRADING_SYM];
    const expiryDate    = fields[IDX_EXPIRY_DATE];
    const strikePrice   = fields[IDX_STRIKE];
    const optionType    = fields[IDX_OPT_TYPE];
    const securityIdRaw = fields[IDX_SEC_ID];
    const lotUnitsRaw   = fields[IDX_LOT_UNITS];

    const key = buildKey(tradingSymbol, expiryDate, strikePrice, optionType, instrName);
    if (!key) {
      skippedKeys++;
      continue;
    }

    const securityId = parseInt(securityIdRaw, 10);
    if (isNaN(securityId)) {
      skippedKeys++;
      continue;
    }

    const lotSize = parseFloat(lotUnitsRaw);
    const entry: InstrumentEntry = { securityId };
    if (!isNaN(lotSize) && lotSize > 0) {
      entry.lotSize = lotSize;
    }

    lookup[key] = entry;
  }

  console.log(`NSE F&O rows processed:  ${nseFnoRows}`);
  console.log(`Skipped (bad key/data):  ${skippedKeys}`);
  console.log(`Entries in output JSON:  ${Object.keys(lookup).length}`);

  // Sample keys for verification
  const sampleKeys = Object.keys(lookup).slice(0, 5);
  console.log("\nSample keys:");
  for (const k of sampleKeys) {
    console.log(`  ${k} →`, lookup[k]);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(lookup, null, 2));
  console.log(`\nWritten to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
