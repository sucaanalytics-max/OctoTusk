#!/usr/bin/env npx tsx
/**
 * Standalone sync script — reads OneDrive via Microsoft Graph,
 * writes to Supabase via REST API (no postgres pooler needed).
 *
 * Used by GitHub Actions cron (.github/workflows/sync-onedrive.yml)
 * and can be run manually: npx tsx scripts/sync-to-supabase.ts
 */

import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// ── Environment ──
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const GRAPH_CLIENT_ID = process.env.GRAPH_CLIENT_ID;
const GRAPH_CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;

const DRIVE_ID = process.env.GRAPH_DRIVE_ID || "b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH";
const OCTOPUS_ITEM_ID = process.env.GRAPH_OCTOPUS_ITEM_ID || "01XUUXNQ72HPRIFGFYLVGID3Y3UPXXUV4H";
const SHEET_NAME = "JVB Output";
const VF_FOLDER_PATH = process.env.GRAPH_VF_FOLDER_PATH || "Tusk Equity/Portfolio Stock Valuations - Bull Base Bear (Tusk Prop)";
const VF_FOLDER_ID_FALLBACK = process.env.GRAPH_VF_FOLDER_ID || "01XUUXNQYRQ7B5PBRKMZGLUVNKA5K5MXY5";
const POSITIONS_FOLDER_ID = process.env.GRAPH_POSITIONS_FOLDER_ID || "01XUUXNQYRGGGJMZ3F3VAYAO4FAA37IMDZ";

// ── Column mapping (JVB Output) ──
const COL_MAP: Record<number, string> = {
  41: "tikr", 1: "official_name", 2: "in_fno",
  3: "holding_cash_lakhs", 4: "holding_pct", 5: "abs_leverage", 6: "leverage_pct",
  7: "bear_current", 8: "base_current", 9: "bull_current",
  10: "target_1y", 11: "target_2y", 12: "div_yield", 13: "cmp",
  14: "upside_bear", 15: "upside_base", 16: "upside_bull",
  17: "upside_1y", 18: "upside_2y",
  20: "base_pe", 21: "base_pe_2sd", 22: "base_pb", 23: "base_pb_2sd",
  24: "base_evebitda", 25: "base_evebitda_2sd",
  26: "reviewed_pranay", 27: "vp", 28: "sa",
  29: "conviction", 30: "understanding",
  31: "sector", 32: "subsector", 33: "last_updated", 34: "comments",
  39: "score", 40: "score_adj_1y", 42: "remarks",
  43: "exp_profit_fy27", 44: "exp_profit_fy28",
};

const NUMERIC_FIELDS = new Set([
  "holding_cash_lakhs", "holding_pct", "abs_leverage", "leverage_pct",
  "bear_current", "base_current", "bull_current",
  "target_1y", "target_2y", "div_yield", "cmp",
  "upside_bear", "upside_base", "upside_bull", "upside_1y", "upside_2y",
  "base_pe", "base_pe_2sd", "base_pb", "base_pb_2sd",
  "base_evebitda", "base_evebitda_2sd",
  "reviewed_pranay", "conviction", "understanding",
  "score", "score_adj_1y", "exp_profit_fy27", "exp_profit_fy28",
]);

const STRING_FIELDS = new Set([
  "tikr", "official_name", "in_fno", "vp", "sa",
  "sector", "subsector", "comments", "remarks", "last_updated",
]);

const VF_OVERRIDE_FIELDS: string[] = [
  "bear_current", "base_current", "bull_current",
  "upside_bear", "upside_base", "upside_bull",
  "target_1y", "target_2y", "upside_1y", "upside_2y",
  "base_pe", "base_pe_2sd", "base_pb", "base_pb_2sd",
  "base_evebitda", "base_evebitda_2sd",
  "vp", "sa", "conviction", "understanding",
  "sector", "subsector", "last_updated", "comments",
];

const TIKR_ALIAS: Record<string, string> = {
  "SMARTWORKS": "Smartworks",
  "INDIANB": "IndianB",
  "UNIONBANK": "unionbank",
};

// ── Helpers ──

function excelDateToISO(serial: number | string): string {
  if (typeof serial === "string") {
    if (/\d{4}-\d{2}-\d{2}/.test(serial)) return serial;
    const n = Number(serial);
    if (isNaN(n)) return serial;
    serial = n;
  }
  if (typeof serial !== "number" || serial < 1) return "";
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().split("T")[0];
}

async function getGraphToken(): Promise<string> {
  if (!AZURE_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error("Missing AZURE_TENANT_ID, GRAPH_CLIENT_ID, or GRAPH_CLIENT_SECRET");
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: GRAPH_CLIENT_ID,
        client_secret: GRAPH_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Graph token error: ${data.error_description || data.error || "unknown"}`);
  }
  return data.access_token;
}

// ── JVB Output ──

async function readJVBOutput(token: string): Promise<unknown[][]> {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${OCTOPUS_ITEM_ID}/workbook/worksheets('${encodeURIComponent(SHEET_NAME)}')/usedRange(valuesOnly=true)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Graph Excel error (JVB Output): ${data.error.message || JSON.stringify(data.error)}`);
  return data.values || [];
}

function parseStocks(rows: unknown[][]): Record<string, unknown>[] {
  if (rows.length < 2) return [];
  const stocks: Record<string, unknown>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const stock: Record<string, unknown> = {};
    for (const [colStr, field] of Object.entries(COL_MAP)) {
      const col = Number(colStr);
      let val = col < row.length ? row[col] : null;
      if (val === "" || val === null || val === undefined) val = null;
      else if (typeof val === "string" && val.startsWith("#")) val = null;
      if (NUMERIC_FIELDS.has(field) && val !== null) {
        const n = Number(val);
        val = isNaN(n) ? null : n;
      }
      if (field === "last_updated" && val !== null) val = excelDateToISO(val as number | string);
      if (STRING_FIELDS.has(field)) {
        val = (val === null || val === 0 || val === "0") ? "" : String(val);
      }
      stock[field] = val;
    }
    if (!stock.tikr || typeof stock.tikr !== "string" || stock.tikr.trim() === "") continue;
    stocks.push(stock);
  }
  return stocks;
}

// ── vF files ──

interface VFFile { id: string; name: string; size: number; lastModifiedDateTime: string; }

async function resolveVFFolderUrl(token: string): Promise<string> {
  if (VF_FOLDER_PATH) {
    const encodedPath = encodeURIComponent(VF_FOLDER_PATH);
    const pathUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children?$top=200&$select=id,name,size,lastModifiedDateTime,file`;
    const testRes = await fetch(pathUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (testRes.ok) { console.log(`[sync] Resolved vF folder by path`); return pathUrl; }
    console.warn(`[sync] Path lookup failed, trying folder ID fallback`);
  }
  if (VF_FOLDER_ID_FALLBACK) {
    return `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,lastModifiedDateTime,file`;
  }
  throw new Error("Could not resolve vF folder");
}

async function listVFFiles(token: string): Promise<VFFile[]> {
  const allFiles: VFFile[] = [];
  let url: string | null = await resolveVFFolderUrl(token);
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (data.error) throw new Error(`Graph folder listing error: ${data.error.message}`);
    for (const item of data.value || []) {
      if (!item.file) continue;
      const name = item.name as string;
      if (!name.match(/\.(xlsx|xlsm)$/i)) continue;
      if (name.match(/Todos|Banking Results Tracker|Investment Dashboard|Sing grm|Octopus|updateMaster/i)) continue;
      if ((item.size || 0) > 20 * 1024 * 1024) continue;
      allFiles.push({ id: item.id, name, size: item.size || 0, lastModifiedDateTime: item.lastModifiedDateTime || "" });
    }
    url = data["@odata.nextLink"] || null;
  }
  return allFiles;
}

function deduplicateVFFiles(files: VFFile[]): VFFile[] {
  const stockMap = new Map<string, VFFile>();
  for (const f of files) {
    const match = f.name.match(/^\d{6,8}[_ ]?(.+?)(?:[_ ]?[vV][fF]\d?)?\.xls[xm]$/i);
    if (!match) {
      const match2 = f.name.match(/^(.+?)(?:[_ ]?[vV][fF]\d?)?\.xls[xm]$/i);
      if (match2) {
        const key = match2[1].trim().toLowerCase();
        if (!stockMap.has(key) || f.name > (stockMap.get(key)!.name)) stockMap.set(key, f);
      }
      continue;
    }
    const key = match[1].trim().toLowerCase();
    if (!stockMap.has(key) || f.name > (stockMap.get(key)!.name)) stockMap.set(key, f);
  }
  return Array.from(stockMap.values());
}

function cellVal(ws: XLSX.WorkSheet, addr: string): unknown {
  const cell = ws[addr];
  return cell ? (cell.v ?? null) : null;
}
function numVal(ws: XLSX.WorkSheet, addr: string): number | null {
  const v = cellVal(ws, addr);
  if (v === null || v === undefined || v === "" || v === 0) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function strVal(ws: XLSX.WorkSheet, addr: string): string {
  const v = cellVal(ws, addr);
  if (v === null || v === undefined || v === 0 || v === "0") return "";
  return String(v).trim();
}

type ParseFailure = { ok: false; reason: "no_sheet" | "no_tikr" | "http_error" | "parse_error"; file: string; detail: string };
type ParseSuccess = { ok: true; data: Record<string, unknown> };
type ParseResult = ParseSuccess | ParseFailure;

async function fetchWithRetry(url: string, opts: RequestInit, fileName: string, maxAttempts = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        const delay = attempt * 2000;
        console.warn(`[vF] Retry ${attempt}/${maxAttempts}: ${fileName} (${msg}), waiting ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("unreachable");
}

async function parseVFFile(token: string, file: VFFile): Promise<ParseResult> {
  try {
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/content`;
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" }, file.name);
    if (!res.ok) { return { ok: false, reason: "http_error", file: file.name, detail: `HTTP ${res.status}` }; }
    const buffer = await res.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const summarySheet = wb.SheetNames.find(s => s.toLowerCase().replace(/\s+/g, " ").trim() === "tusk - summary");
    if (!summarySheet) return { ok: false, reason: "no_sheet", file: file.name, detail: "no \"Tusk - Summary\" sheet" };
    const ws = wb.Sheets[summarySheet];
    const tikr = strVal(ws, "B2");
    if (!tikr) { return { ok: false, reason: "no_tikr", file: file.name, detail: "no TIKR in B2" }; }
    return { ok: true, data: {
      tikr,
      last_updated: (() => { const v = cellVal(ws, "A5"); if (v === null || v === undefined) return ""; if (typeof v === "number") return excelDateToISO(v); if (v instanceof Date) return v.toISOString().split("T")[0]; return String(v); })(),
      vp: strVal(ws, "B5"), sa: strVal(ws, "C5"),
      conviction: numVal(ws, "D5"), understanding: numVal(ws, "E5"),
      sector: strVal(ws, "F5"), subsector: strVal(ws, "G5"),
      bear_current: numVal(ws, "B9"), base_current: numVal(ws, "C9"), bull_current: numVal(ws, "D9"),
      upside_bear: numVal(ws, "B10"), upside_base: numVal(ws, "C10"), upside_bull: numVal(ws, "D10"),
      target_1y: numVal(ws, "C11"), upside_1y: numVal(ws, "E11"),
      target_2y: numVal(ws, "C12"), upside_2y: numVal(ws, "E12"),
      base_pe: numVal(ws, "C16"), base_pe_2sd: numVal(ws, "F16"),
      base_pb: numVal(ws, "C17"), base_pb_2sd: numVal(ws, "F17"),
      base_evebitda: numVal(ws, "C18"), base_evebitda_2sd: numVal(ws, "F18"),
      comments: strVal(ws, "B21"),
      _vf_source: file.name,
    } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "parse_error", file: file.name, detail: msg };
  }
}

async function processVFFiles(token: string, files: VFFile[], concurrency = 3) {
  const results = new Map<string, Record<string, unknown>>();
  const skipped: string[] = [];
  const failed: string[] = [];
  const queue = [...files];
  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift()!;
      const result = await parseVFFile(token, file);
      if (result.ok) {
        const { data } = result;
        if (data.tikr && typeof data.tikr === "string") results.set(data.tikr as string, data);
      } else {
        const failure = result as ParseFailure;
        if (failure.reason === "no_sheet") {
          skipped.push(failure.file);
        } else {
          console.warn(`[vF] FAIL ${failure.file}: ${failure.reason} — ${failure.detail}`);
          failed.push(failure.file);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, () => worker()));
  return { results, skipped, failed };
}

// ── Holdings ──

interface HoldingRecord {
  asset_name: string; quantity: number; avg_price: number; amt_invested: number;
  current_price: number; overall_gain: number; overall_gain_pct: number; current_value: number;
}

async function readHoldings(token: string): Promise<HoldingRecord[] | null> {
  try {
    const listUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${POSITIONS_FOLDER_ID}/children?$select=id,name,lastModifiedDateTime,file&$top=50`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    const listData = await listRes.json();
    if (listData.error) { console.warn(`[holdings] Folder listing error: ${listData.error.message}`); return null; }

    const eqFiles: { id: string; name: string }[] = (listData.value || [])
      .filter((f: { file?: unknown; name: string }) => f.file && /^\d{6,8}\s+Tusk EQ\.xlsx$/i.test(f.name))
      .sort((a: { name: string }, b: { name: string }) => b.name.localeCompare(a.name));

    if (eqFiles.length === 0) { console.warn("[holdings] No Tusk EQ file found"); return null; }

    const file = eqFiles[0];
    console.log(`[holdings] Reading: ${file.name}`);

    const dlRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/content`, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
    if (!dlRes.ok) { console.warn(`[holdings] Download failed: ${dlRes.status}`); return null; }

    const buffer = await dlRes.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: "" });

    let headerRow = -1;
    for (let i = 0; i < rawRows.length; i++) {
      if (rawRows[i].some(c => String(c).includes("Asset Name"))) { headerRow = i; break; }
    }
    if (headerRow === -1) { console.warn("[holdings] Header row not found"); return null; }

    const headers = rawRows[headerRow].map(h => String(h).trim());
    const ci = {
      name: headers.findIndex(h => h.includes("Asset Name")),
      qty: headers.findIndex(h => h === "Quantity"),
      avgPrice: headers.findIndex(h => h.includes("Avg")),
      invested: headers.findIndex(h => h.includes("Invested") || h.includes("Amt")),
      currPrice: headers.findIndex(h => h.includes("Curr") && h.includes("Price")),
      gain: headers.findIndex(h => h.includes("Overall Gain") && !h.includes("%")),
      gainPct: headers.findIndex(h => h.includes("Overall Gain") && h.includes("%")),
      currValue: headers.findIndex(h => h.includes("Current Value")),
    };

    const SKIP_ROW = /^(stocks|total|tusk invst|tusk invest|cash|net|grand)/i;
    const holdings: HoldingRecord[] = [];

    for (let i = headerRow + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      const name = String(row[ci.name] ?? "").trim();
      if (!name || SKIP_ROW.test(name)) continue;
      const qty = Number(row[ci.qty]) || 0;
      const avgPrice = Number(row[ci.avgPrice]) || 0;
      if (qty === 0 && avgPrice === 0) continue;
      holdings.push({
        asset_name: name, quantity: qty, avg_price: avgPrice,
        amt_invested: Number(row[ci.invested]) || qty * avgPrice,
        current_price: Number(row[ci.currPrice]) || 0,
        overall_gain: Number(row[ci.gain]) || 0,
        overall_gain_pct: Number(row[ci.gainPct]) || 0,
        current_value: Number(row[ci.currValue]) || 0,
      });
    }

    console.log(`[holdings] Parsed ${holdings.length} holdings from ${file.name}`);
    return holdings.length > 0 ? holdings : null;
  } catch (err) {
    console.warn("[holdings] Error:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Load static fallback data ──

function loadStaticDb(): { ticker_map: Record<string, string>; holdings: unknown[] } {
  try {
    const dbPath = path.resolve(__dirname, "../data/database.json");
    const raw = fs.readFileSync(dbPath, "utf8");
    return JSON.parse(raw);
  } catch {
    console.warn("[sync] Could not load data/database.json, using empty fallbacks");
    return { ticker_map: {}, holdings: [] };
  }
}

// ── Main ──

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const staticDb = loadStaticDb();

  console.log("[sync] Getting Graph token...");
  const token = await getGraphToken();

  // 1. Read JVB baseline
  console.log("[sync] Reading JVB Output...");
  const rows = await readJVBOutput(token);
  const baselineStocks = parseStocks(rows);
  console.log(`[sync] JVB baseline: ${baselineStocks.length} stocks`);

  // 2. Read and process vF files
  console.log("[sync] Listing vF files...");
  const allFiles = await listVFFiles(token);
  const dedupedFiles = deduplicateVFFiles(allFiles);
  console.log(`[sync] Found ${allFiles.length} files, deduplicated to ${dedupedFiles.length}`);

  const { results: vfMap, skipped: vfSkipped, failed: vfFailed } = await processVFFiles(token, dedupedFiles, 3);
  console.log(`[sync] Parsed ${vfMap.size} vF files, skipped ${vfSkipped.length} (no sheet), ${vfFailed.length} errors`);
  if (vfFailed.length > 0) console.warn(`[sync] Failed files: ${vfFailed.join(", ")}`);

  // Apply aliases
  for (const [vfTikr, jvbTikr] of Object.entries(TIKR_ALIAS)) {
    const data = vfMap.get(vfTikr);
    if (data && !vfMap.has(jvbTikr)) vfMap.set(jvbTikr, data);
  }

  // Fuzzy match
  const jvbTikrs = baselineStocks.map(s => s.tikr as string);
  for (const [vfTikr, data] of Array.from(vfMap.entries())) {
    for (const jt of jvbTikrs) {
      if (vfMap.has(jt)) continue;
      if (vfTikr.includes(jt) || jt.includes(vfTikr)) vfMap.set(jt, data);
    }
  }

  // Merge vF into baseline
  let vfMatchCount = 0;
  const mergedStocks = baselineStocks.map(stock => {
    const tikr = stock.tikr as string;
    const vfData = vfMap.get(tikr);
    if (!vfData) return stock;
    vfMatchCount++;
    const merged = { ...stock };
    for (const field of VF_OVERRIDE_FIELDS) {
      const v = vfData[field];
      if (v !== null && v !== undefined && v !== "") merged[field] = v;
    }
    merged._vf_source = vfData._vf_source;
    return merged;
  });

  console.log(`[sync] Merged ${vfMatchCount} vF overrides`);

  // 3. Read holdings
  console.log("[sync] Reading holdings...");
  const liveHoldings = await readHoldings(token);
  const holdings = liveHoldings ?? staticDb.holdings;
  console.log(`[sync] Holdings: ${(holdings as unknown[]).length} records (${liveHoldings ? "live" : "static"})`);

  // 4. Write to Supabase
  console.log("[sync] Writing to Supabase...");
  const { error } = await supabase
    .from("sync_snapshot")
    .upsert({
      id: 1,
      stocks: mergedStocks,
      holdings,
      ticker_map: staticDb.ticker_map,
      synced_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  console.log(`[sync] Done! Synced ${mergedStocks.length} stocks, ${(holdings as unknown[]).length} holdings to Supabase`);
}

main().catch(e => {
  console.error("[sync] FATAL:", e);
  process.exit(1);
});
