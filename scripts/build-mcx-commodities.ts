/**
 * Builds data/mcx-commodities.json — the front-month (nearest non-expired)
 * MCX GOLD and SILVER futures security IDs, read at runtime by lib/commodities.ts.
 *
 * Run: npx tsx scripts/build-mcx-commodities.ts
 *
 * RE-RUN WHEN CONTRACTS ROLL (~every 2 months, after a front-month expiry) —
 * otherwise the digest falls back to the next contract automatically only if
 * one is listed here, so keeping this fresh avoids showing a stale month.
 */

"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(REPO_ROOT, "data", "mcx-commodities.json");
const MASTER_URL = "https://images.dhan.co/api-data/api-scrip-master-detailed.csv";

// CORE must exist — the daily digest (lib/commodities.ts) depends on gold/silver.
// EXTRA is best-effort for the wall-display strip; a missing contract is warned + skipped
// so it can never block the gold/silver regen.
const CORE = ["GOLD", "SILVER"] as const;
const EXTRA = ["ALUMINIUM", "CRUDEOIL"] as const;
const WANTED = [...CORE, ...EXTRA] as const;
// MCX SYMBOL_NAME → output key in data/mcx-commodities.json
const OUT_KEY: Record<string, string> = {
  GOLD: "gold", SILVER: "silver", ALUMINIUM: "aluminium", CRUDEOIL: "crude",
};

interface Contract {
  securityId: number;
  displayName: string;
  expiry: string; // YYYY-MM-DD
  segment: "MCX_COMM";
}

async function main(): Promise<void> {
  console.log(`[build-mcx] Fetching ${MASTER_URL}...`);
  const res = await fetch(MASTER_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const lines = (await res.text()).split("\n");
  console.log(`[build-mcx] CSV rows: ${lines.length}`);

  const header = lines[0].split(",");
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Column "${name}" not found`);
    return i;
  };
  const C_EXCH = col("EXCH_ID");
  const C_SECID = col("SECURITY_ID");
  const C_INSTR = col("INSTRUMENT");
  const C_SYMBOL = col("SYMBOL_NAME");
  const C_DISPLAY = col("DISPLAY_NAME");
  const C_EXPIRY = col("SM_EXPIRY_DATE");

  const today = new Date().toISOString().slice(0, 10);
  const best: Record<string, Contract> = {};

  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(",");
    if (f.length <= C_EXPIRY) continue;
    if (f[C_EXCH] !== "MCX" || f[C_INSTR] !== "FUTCOM") continue;
    const sym = (f[C_SYMBOL] || "").toUpperCase();
    if (!WANTED.includes(sym as (typeof WANTED)[number])) continue; // exact names, not GOLDM/MIC etc.
    const expiry = (f[C_EXPIRY] || "").slice(0, 10);
    if (!expiry || expiry < today) continue; // skip expired
    const id = Number(f[C_SECID]);
    if (!id) continue;
    // Keep the nearest expiry per metal.
    if (!best[sym] || expiry < best[sym].expiry) {
      best[sym] = { securityId: id, displayName: f[C_DISPLAY] || sym, expiry, segment: "MCX_COMM" };
    }
  }

  for (const m of CORE) {
    if (!best[m]) throw new Error(`No non-expired MCX ${m} FUTCOM found`);
  }
  for (const m of EXTRA) {
    if (!best[m]) console.warn(`[build-mcx] WARNING: no non-expired MCX ${m} FUTCOM found — skipping`);
  }

  const out: Record<string, unknown> = {
    _generatedAt: new Date().toISOString(),
    _note: "Front-month MCX commodities — gold/silver for the daily digest, +aluminium/crude for the /octopus wall strip. Re-run scripts/build-mcx-commodities.ts after a contract expires.",
    gold: best.GOLD,
    silver: best.SILVER,
  };
  for (const sym of EXTRA) {
    if (best[sym]) out[OUT_KEY[sym]] = best[sym];
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`[build-mcx] Wrote ${OUT_PATH}`);
  for (const sym of WANTED) {
    const c = best[sym];
    if (c) console.log(`  ${OUT_KEY[sym].padEnd(10)} ${c.displayName} (id ${c.securityId}, exp ${c.expiry})`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
