// Refreshes the static fallback data/database.json (stocks + ticker_map) from the live
// Supabase snapshot, so keyless/preview/outage fallbacks aren't stale. Preserves metadata.
// SECURITY (V2): holdings/fo_positions are NEVER written to this committed file — the real
// portfolio lives only in Supabase + the PIN-gated /api/holdings. This script forces them
// empty so they cannot be reintroduced. Run: node --env-file=.env.local scripts/refresh-database-json.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from("sync_snapshot").select("stocks, ticker_map, synced_at").eq("id", 1).single();
if (error) {
  console.error("Supabase query failed:", error.message);
  process.exit(1);
}

const path = "data/database.json";
const db = JSON.parse(readFileSync(path, "utf8"));
const beforeStocks = Array.isArray(db.stocks) ? db.stocks.length : 0;
const beforeTm = db.ticker_map ? Object.keys(db.ticker_map).length : 0;

// Dedupe by tikr (case-insensitive, keep first) — mirrors the app's defensive dedupe.
const seen = new Set();
db.stocks = (data.stocks || []).filter((s) => {
  const k = (s.tikr || "").toLowerCase();
  if (!k || seen.has(k)) return false;
  seen.add(k);
  return true;
});
if (data.ticker_map && typeof data.ticker_map === "object") db.ticker_map = data.ticker_map;

// SECURITY (V2): enforce no portfolio data in the committed static file.
db.holdings = [];
db.fo_positions = [];
if (db.metadata && typeof db.metadata === "object") db.metadata.total_holdings = 0;

writeFileSync(path, JSON.stringify(db, null, 2) + "\n");

const m = db.stocks.find((s) => /manappuram/i.test(s.tikr || ""));
console.log(`stocks ${beforeStocks} -> ${db.stocks.length} | ticker_map ${beforeTm} -> ${Object.keys(db.ticker_map).length}`);
console.log("Supabase synced_at:", data.synced_at);
console.log("DB Manappuram now:", m ? JSON.stringify({ tikr: m.tikr, base: m.base_current, last_updated: m.last_updated, vf_web_url: m.vf_web_url ? "present" : null }) : "NOT FOUND");
