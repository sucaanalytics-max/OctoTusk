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
  "bear_pe", "base_pe", "bull_pe", "base_pe_2sd",
  "bear_pb", "base_pb", "bull_pb", "base_pb_2sd",
  "bear_evebitda", "base_evebitda", "bull_evebitda", "base_evebitda_2sd",
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
  "bear_pe", "base_pe", "bull_pe", "base_pe_2sd",
  "bear_pb", "base_pb", "bull_pb", "base_pb_2sd",
  "bear_evebitda", "base_evebitda", "bull_evebitda", "base_evebitda_2sd",
  "vp", "sa", "conviction", "understanding",
  "sector", "subsector", "last_updated", "comments",
];

const TIKR_ALIAS: Record<string, string> = {
  "SMARTWORKS": "Smartworks",
  "INDIANB": "IndianB",
  "UNIONBANK": "unionbank",
  "CEINSYS": "538734",
  "SMLMAH": "505192",
  "PSUBNKBEES": "XBOM:590108",
  "SMARTWORKS COWORKING SPACES LIMITED (XNSE:SMARTWORKS)": "Smartworks",
  "IIFL Finance": "IIFL",
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

interface VFFile { id: string; name: string; size: number; lastModifiedDateTime: string; webUrl: string; }

async function resolveVFFolderUrl(token: string): Promise<string> {
  if (VF_FOLDER_PATH) {
    const encodedPath = encodeURIComponent(VF_FOLDER_PATH);
    const pathUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children?$top=200&$select=id,name,size,lastModifiedDateTime,file,webUrl`;
    const testRes = await fetch(pathUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (testRes.ok) { console.log(`[sync] Resolved vF folder by path`); return pathUrl; }
    console.warn(`[sync] Path lookup failed, trying folder ID fallback`);
  }
  if (VF_FOLDER_ID_FALLBACK) {
    return `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,lastModifiedDateTime,file,webUrl`;
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
      // Non-vF utility files
      if (name.match(/Todos|Banking Results Tracker|Investment Dashboard|Sing grm|Octopus|updateMaster/i)) continue;
      // Excluded stocks (no longer tracked)
      const excludedStocks = [
        "REC", "Repco Hf", "Sunteck Realty",
        "Union Bank", "Indianbank", "Monarch Networth", "Rpsg Ventures", "Mallcom",
        "Disa India", "Dam Capital", "Patels Airtemp", "Emkay", "Tusk Arihant Model V2",
        "Kpit Tech", "Deepak Fertilizer Financial Model V3", "Elecon Engineering", "Somany Ceramics V1",
      ];
      if (excludedStocks.some(ex => name.toLowerCase().includes(ex.toLowerCase()))) continue;
      if ((item.size || 0) > 40 * 1024 * 1024) { console.warn(`[vF] SKIP ${name}: oversized (${Math.round((item.size || 0) / 1024 / 1024)}MB > 40MB limit)`); continue; }
      allFiles.push({ id: item.id, name, size: item.size || 0, lastModifiedDateTime: item.lastModifiedDateTime || "", webUrl: item.webUrl || "" });
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

type CellReader = { raw(addr: string): unknown; num(addr: string): number | null; str(addr: string): string };

function buildVfData(file: VFFile, r: CellReader, method: "graph" | "xlsx"): ParseResult {
  const tikr = r.str("B2");
  if (!tikr) return { ok: false, reason: "no_tikr", file: file.name, detail: "no TIKR in B2" };
  const _bear = r.num("B9"), _base = r.num("C9"), _bull = r.num("D9");
  console.log(`[vF] Parsed (${method}) ${file.name} -> TIKR="${tikr}" bear=${_bear} base=${_base} bull=${_bull}`);
  return { ok: true, data: {
    tikr,
    last_updated: (() => { const v = r.raw("A5"); if (v === null) return ""; if (typeof v === "number") return excelDateToISO(v); if (v instanceof Date) return v.toISOString().split("T")[0]; return String(v); })(),
    vp: r.str("B5"), sa: r.str("C5"),
    conviction: r.num("D5"), understanding: r.num("E5"),
    sector: r.str("F5"), subsector: r.str("G5"),
    bear_current: _bear, base_current: _base, bull_current: _bull,
    upside_bear: r.num("B10"), upside_base: r.num("C10"), upside_bull: r.num("D10"),
    target_1y: r.num("C11"), upside_1y: r.num("E11"),
    target_2y: r.num("C12"), upside_2y: r.num("E12"),
    bear_pe: r.num("B16"), base_pe: r.num("C16"), bull_pe: r.num("D16"), base_pe_2sd: r.num("F16"),
    bear_pb: r.num("B17"), base_pb: r.num("C17"), bull_pb: r.num("D17"), base_pb_2sd: r.num("F17"),
    bear_evebitda: r.num("B18"), base_evebitda: r.num("C18"), bull_evebitda: r.num("D18"), base_evebitda_2sd: r.num("F18"),
    comments: r.str("B21"),
    _vf_source: file.name,
    _vf_method: method,
    vf_web_url: file.webUrl || "",
  } };
}

function readerFromGraphValues(values: unknown[][]): CellReader {
  const cell = (addr: string): unknown => {
    const m = addr.match(/^([A-Z])(\d+)$/);
    if (!m) return null;
    const col = m[1].charCodeAt(0) - 65;
    const row = Number(m[2]) - 1;
    const rRow = values[row];
    if (!rRow) return null;
    const v = rRow[col];
    return (v === "" || v === null || v === undefined) ? null : v;
  };
  return {
    raw: cell,
    num: (addr) => { const v = cell(addr); if (v === null || v === 0) return null; const n = Number(v); return isNaN(n) ? null : n; },
    str: (addr) => { const v = cell(addr); if (v === null || v === 0 || v === "0") return ""; return String(v).trim(); },
  };
}

function readerFromXlsxSheet(ws: XLSX.WorkSheet): CellReader {
  const cell = (addr: string): unknown => {
    const c = ws[addr];
    return c ? (c.v ?? null) : null;
  };
  return {
    raw: cell,
    num: (addr) => { const v = cell(addr); if (v === null || v === undefined || v === "" || v === 0) return null; const n = Number(v); return isNaN(n) ? null : n; },
    str: (addr) => { const v = cell(addr); if (v === null || v === undefined || v === 0 || v === "0") return ""; return String(v).trim(); },
  };
}

async function parseVFFileGraph(token: string, file: VFFile): Promise<ParseResult> {
  try {
    const baseUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/workbook`;
    const sheetsRes = await fetchWithRetry(`${baseUrl}/worksheets?$select=name`, { headers: { Authorization: `Bearer ${token}` } }, file.name);
    if (!sheetsRes.ok) return { ok: false, reason: "http_error", file: file.name, detail: `HTTP ${sheetsRes.status} listing sheets` };
    const sheetsData = await sheetsRes.json();
    if (sheetsData.error) return { ok: false, reason: "parse_error", file: file.name, detail: sheetsData.error.message };
    const summarySheet = ((sheetsData.value || []) as { name: string }[])
      .map(s => s.name)
      .find(name => name.toLowerCase().replace(/\s+/g, " ").trim() === "tusk - summary");
    if (!summarySheet) return { ok: false, reason: "no_sheet", file: file.name, detail: "no \"Tusk - Summary\" sheet" };

    const rangeUrl = `${baseUrl}/worksheets('${encodeURIComponent(summarySheet)}')/range(address='A1:G22')?$select=values`;
    const rangeRes = await fetchWithRetry(rangeUrl, { headers: { Authorization: `Bearer ${token}` } }, file.name);
    if (!rangeRes.ok) {
      const txt = await rangeRes.text().catch(() => "");
      return { ok: false, reason: "http_error", file: file.name, detail: `HTTP ${rangeRes.status} reading range: ${txt.slice(0, 200)}` };
    }
    const rangeData = await rangeRes.json();
    if (rangeData.error) return { ok: false, reason: "parse_error", file: file.name, detail: rangeData.error.message };
    return buildVfData(file, readerFromGraphValues((rangeData.values || []) as unknown[][]), "graph");
  } catch (err) {
    return { ok: false, reason: "parse_error", file: file.name, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function parseVFFileXlsx(token: string, file: VFFile): Promise<ParseResult> {
  try {
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/content`;
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" }, file.name);
    if (!res.ok) return { ok: false, reason: "http_error", file: file.name, detail: `HTTP ${res.status} downloading binary` };
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: "array" });
    const summarySheet = wb.SheetNames.find(s => s.toLowerCase().replace(/\s+/g, " ").trim() === "tusk - summary");
    if (!summarySheet) return { ok: false, reason: "no_sheet", file: file.name, detail: "no \"Tusk - Summary\" sheet" };
    return buildVfData(file, readerFromXlsxSheet(wb.Sheets[summarySheet]), "xlsx");
  } catch (err) {
    return { ok: false, reason: "parse_error", file: file.name, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function parseVFFile(token: string, file: VFFile): Promise<ParseResult> {
  // Graph Workbook API gives LIVE evaluated formula values (the .xlsx binary
  // contains stale cached values). When Graph times out on heavy workbooks
  // (HTTP 504 MaxRequestDurationExceeded), fall back to the XLSX path so we
  // at least get cached values rather than dropping the override entirely.
  const graph = await parseVFFileGraph(token, file);
  if (graph.ok) return graph;
  if (graph.reason !== "http_error") return graph;
  console.warn(`[vF] Graph failed for ${file.name} (${graph.detail.slice(0, 100)}), falling back to XLSX cached values`);
  return parseVFFileXlsx(token, file);
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
        if (data.tikr && typeof data.tikr === "string") {
          const tikr = data.tikr as string;
          if (results.has(tikr)) {
            console.warn(`[vF] DUPLICATE TIKR "${tikr}": "${file.name}" overwrites "${(results.get(tikr)?._vf_source as string) || "unknown"}" — check cell B2 in both files`);
          }
          results.set(tikr, data);
        }
      } else {
        const failure = result as ParseFailure;
        if (failure.reason === "no_sheet") {
          console.warn(`[vF] SKIP ${failure.file}: ${failure.detail}`);
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
  console.log(`[sync] vF tikrs: ${Array.from(vfMap.keys()).join(", ")}`);
  if (vfSkipped.length > 0) console.warn(`[sync] Skipped files (no Tusk - Summary sheet): ${vfSkipped.join(", ")}`);
  if (vfFailed.length > 0) console.warn(`[sync] Failed files: ${vfFailed.join(", ")}`);

  // Apply aliases
  for (const [vfTikr, jvbTikr] of Object.entries(TIKR_ALIAS)) {
    const data = vfMap.get(vfTikr);
    if (data && !vfMap.has(jvbTikr)) { vfMap.set(jvbTikr, data); vfMap.delete(vfTikr); }
  }

  // Fuzzy match
  const jvbTikrs = baselineStocks.map(s => s.tikr as string);
  const baselineSet = new Set(jvbTikrs.map(t => t.toLowerCase()));
  for (const [vfTikr, data] of Array.from(vfMap.entries())) {
    if (baselineSet.has(vfTikr.toLowerCase())) continue; // exact baseline match — skip fuzzy
    for (const jt of jvbTikrs) {
      if (vfMap.has(jt)) continue;
      const shorter = Math.min(vfTikr.length, jt.length);
      const longer = Math.max(vfTikr.length, jt.length);
      const vfL = vfTikr.toLowerCase(), jtL = jt.toLowerCase();
      if ((vfL.includes(jtL) || jtL.includes(vfL)) && shorter / longer >= 0.5) { vfMap.set(jt, data); if (jt !== vfTikr) vfMap.delete(vfTikr); break; }
    }
  }

  // Capture which tikrs got a live vF this run (after alias + fuzzy resolution).
  // Distinguishes "fresh override this run" from "_vf_source carried over via static-db".
  const liveVfTikrs = new Set(Array.from(vfMap.keys()));

  // Merge vF into baseline
  let vfMatchCount = 0;
  let mergedStocks = baselineStocks.map(stock => {
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
    merged._vf_method = vfData._vf_method;
    merged.vf_web_url = vfData.vf_web_url;
    return merged;
  });

  console.log(`[sync] Merged ${vfMatchCount} vF overrides`);

  // Add standalone vF stocks (not in JVB baseline)
  const matchedTikrs = new Set(mergedStocks.map(s => s.tikr as string));
  const standaloneTikrs = new Set<string>();
  for (const [tikr, vfData] of Array.from(vfMap.entries())) {
    if (!matchedTikrs.has(tikr)) {
      const name = (vfData._vf_source as string || "").replace(/^\d{6,8}[_ ]?/, "").replace(/[_ ]?[vV][fF]\d?\.xls[xm]$/i, "");
      mergedStocks.push({ tikr, official_name: name, ...vfData });
      standaloneTikrs.add(tikr);
    }
  }
  if (standaloneTikrs.size > 0) console.log(`[sync] Added ${standaloneTikrs.size} standalone vF stocks`);

  // Preserve static-db: fill missing fields on existing stocks + add absent stocks
  const isEmpty = (v: unknown) => v === null || v === undefined || v === "";
  const staticStocks: Record<string, unknown>[] = (staticDb as any).stocks || [];
  const staticMap = new Map<string, Record<string, unknown>>();
  for (const ss of staticStocks) {
    if (ss.tikr && typeof ss.tikr === "string") staticMap.set(ss.tikr as string, ss);
  }

  // Fill missing/null fields from static-db for stocks already in merged
  let filledCount = 0;
  for (const stock of mergedStocks) {
    const staticVersion = staticMap.get(stock.tikr as string);
    if (!staticVersion) continue;
    let filled = false;
    for (const [key, staticVal] of Object.entries(staticVersion)) {
      if (key === "tikr" || key === "_vf_source" || key === "_vf_method" || key === "vf_web_url") continue;
      if (isEmpty(stock[key]) && !isEmpty(staticVal)) {
        stock[key] = staticVal;
        filled = true;
      }
    }
    if (filled) filledCount++;
  }
  if (filledCount > 0) console.log(`[sync] Filled missing fields from static-db for ${filledCount} stocks`);

  // Add static-db stocks not present at all (e.g., ETFs not yet in JVB/vF)
  // Skip any stock whose tikr is a TIKR_ALIAS key — it maps to a baseline entry already merged
  const aliasKeys = new Set(Object.keys(TIKR_ALIAS));
  const allMergedTikrs = new Set(mergedStocks.map(s => s.tikr as string));
  let preservedCount = 0;
  for (const ss of staticStocks) {
    if (ss.tikr && !allMergedTikrs.has(ss.tikr as string) && !aliasKeys.has(ss.tikr as string)) {
      mergedStocks.push(ss);
      preservedCount++;
    }
  }
  if (preservedCount > 0) console.log(`[sync] Preserved ${preservedCount} static-db stocks (ETFs, etc.)`);

  // Deduplicate by tikr (case-insensitive) - keep first occurrence (baseline+vF merged)
  const beforeDedup = mergedStocks.length;
  const seenTikrs = new Set<string>();
  mergedStocks = mergedStocks.filter((s: Record<string, unknown>) => {
    const key = (s.tikr as string)?.toLowerCase();
    if (!key || seenTikrs.has(key)) return false;
    seenTikrs.add(key);
    return true;
  });
  if (mergedStocks.length < beforeDedup) console.log(`[sync] Deduped: removed ${beforeDedup - mergedStocks.length} duplicate stocks`);

  // 3. Read holdings
  console.log("[sync] Reading holdings...");
  const liveHoldings = await readHoldings(token);
  const holdings = liveHoldings ?? staticDb.holdings;

  // Add unlisted holdings not in demat export
  const manualHoldings = [
    {
      asset_name: "National Stock Exchange of India",
      quantity: 685000,
      avg_price: 409,
      amt_invested: 280165000,
      current_price: 2000,
      overall_gain: 1089835000,
      overall_gain_pct: 388.95,
      current_value: 1370000000,
    },
  ];
  for (const mh of manualHoldings) {
    if (!(holdings as any[]).some((h: any) => h.asset_name === mh.asset_name)) {
      (holdings as any[]).push(mh);
    }
  }

  console.log(`[sync] Holdings: ${(holdings as unknown[]).length} records (${liveHoldings ? "live" : "static"})`);

  // ── Per-stock validation report ──
  // Lets us spot-check that what lands on the dashboard matches the source vF cells,
  // and surfaces stocks running on stale baseline data (no live vF this run).
  const STALE_DAYS = 30;
  const todayMs = Date.now();
  const stale: string[] = [];
  console.log(`[validate] === Final values per stock (post-merge, post-dedup) ===`);
  for (const stock of mergedStocks) {
    const tikr = stock.tikr as string;
    const live = liveVfTikrs.has(tikr);
    const file = live ? ((stock._vf_source as string) || "?") : "NONE";
    const method = live ? ((stock._vf_method as string) || "?") : "-";
    const bear = stock.bear_current ?? "null";
    const base = stock.base_current ?? "null";
    const bull = stock.bull_current ?? "null";
    const lu = (stock.last_updated as string) ?? "";
    console.log(`[validate] tikr=${tikr} method=${method} file=${file} bear=${bear} base=${base} bull=${bull} last_updated=${lu}`);

    if (!live && lu) {
      const luMs = new Date(lu).getTime();
      if (!isNaN(luMs)) {
        const daysOld = Math.floor((todayMs - luMs) / 86400000);
        if (daysOld > STALE_DAYS) stale.push(`${tikr}(${daysOld}d)`);
      }
    }
  }
  console.log(`[unmatched] ${standaloneTikrs.size} vF stocks added as standalone (potential silent stale clones if a baseline row also exists for the same company): ${Array.from(standaloneTikrs).join(", ") || "none"}`);
  console.log(`[stale] ${stale.length} baseline stocks with no live vF override this run and last_updated > ${STALE_DAYS}d: ${stale.join(", ") || "none"}`);

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
