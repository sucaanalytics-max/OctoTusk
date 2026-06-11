import { NextResponse } from "next/server";
import type * as XLSXTypes from "xlsx";
import staticDb from "@/data/database.json";

// Lazy-load xlsx (~700KB) only when the route is actually invoked
let _xlsx: typeof import("xlsx") | null = null;
async function getXLSX() {
  if (!_xlsx) _xlsx = await import("xlsx");
  return _xlsx;
}
import { auth } from "@/auth";
import { reportError, reportSuccess } from "@/lib/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Heavy workbooks are parsed via Graph sessions (light HTTP reads); 300s gives
// the manual sync headroom to finish without dropping files like the cron does.
export const maxDuration = 300;

// ── OneDrive coordinates (configurable via env vars) ──
const DRIVE_ID =
  process.env.GRAPH_DRIVE_ID ||
  "b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH";
const OCTOPUS_ITEM_ID =
  process.env.GRAPH_OCTOPUS_ITEM_ID ||
  "01XUUXNQ72HPRIFGFYLVGID3Y3UPXXUV4H";
const SHEET_NAME = "JVB Output";
const VF_FOLDER_PATH =
  process.env.GRAPH_VF_FOLDER_PATH ||
  "Tusk Equity/Portfolio Stock Valuations - Bull Base Bear (Tusk Prop)";
const VF_FOLDER_ID_FALLBACK =
  process.env.GRAPH_VF_FOLDER_ID || "01XUUXNQYRQ7B5PBRKMZGLUVNKA5K5MXY5";

// Positions & Leverage folder — contains "YYYYMMDD Tusk EQ.xlsx" holdings exports
const POSITIONS_FOLDER_ID =
  process.env.GRAPH_POSITIONS_FOLDER_ID ||
  "01XUUXNQYRGGGJMZ3F3VAYAO4FAA37IMDZ";

// ── Column index → database.json field mapping (JVB Output baseline) ──
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

// ── Static-db enrichment helpers ──
const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

function enrichFromStaticDb(stocks: Record<string, unknown>[]): { filledCount: number; addedCount: number } {
  const staticStocks: Record<string, unknown>[] = (staticDb as any).stocks || [];
  const staticMap = new Map<string, Record<string, unknown>>();
  for (const ss of staticStocks) {
    if (ss.tikr && typeof ss.tikr === "string") staticMap.set(ss.tikr as string, ss);
  }

  // Fill missing fields on existing stocks
  let filledCount = 0;
  for (const stock of stocks) {
    const staticVersion = staticMap.get(stock.tikr as string);
    if (!staticVersion) continue;
    let filled = false;
    for (const [key, staticVal] of Object.entries(staticVersion)) {
      if (key === "tikr" || key === "_vf_source" || key === "vf_web_url") continue;
      if (isEmpty(stock[key]) && !isEmpty(staticVal)) {
        stock[key] = staticVal;
        filled = true;
      }
    }
    if (filled) filledCount++;
  }

  // Add completely absent stocks
  // Skip any stock whose tikr is a TIKR_ALIAS key — it maps to a baseline entry already merged
  const aliasKeys = new Set(Object.keys(TIKR_ALIAS));
  const existingTikrs = new Set(stocks.map((s) => s.tikr as string));
  let addedCount = 0;
  for (const ss of staticStocks) {
    if (ss.tikr && !existingTikrs.has(ss.tikr as string) && !aliasKeys.has(ss.tikr as string)) {
      stocks.push(ss);
      addedCount++;
    }
  }

  return { filledCount, addedCount };
}

function deduplicateStocks(stocks: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  return stocks.filter((s) => {
    const key = (s.tikr as string)?.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing AZURE_TENANT_ID, GRAPH_CLIENT_ID, or GRAPH_CLIENT_SECRET env vars");
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
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

// ═══════════════════════════════════════════════════════════════
// JVB Output baseline reader
// ═══════════════════════════════════════════════════════════════

async function readJVBOutput(token: string): Promise<unknown[][]> {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${OCTOPUS_ITEM_ID}/workbook/worksheets('${encodeURIComponent(SHEET_NAME)}')/usedRange(valuesOnly=true)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Graph Excel error (JVB Output): ${data.error.message || JSON.stringify(data.error)}`);
  }
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

// ═══════════════════════════════════════════════════════════════
// vF workbook reader
// ═══════════════════════════════════════════════════════════════

interface VFFile {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl: string;
}

async function resolveVFFolderUrl(token: string): Promise<string> {
  if (VF_FOLDER_PATH) {
    const encodedPath = encodeURIComponent(VF_FOLDER_PATH);
    const pathUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children?$top=200&$select=id,name,size,lastModifiedDateTime,file,webUrl`;
    const testRes = await fetch(pathUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (testRes.ok) {
      console.log(`[sync] Resolved vF folder by path: "${VF_FOLDER_PATH}"`);
      return pathUrl;
    }
    const errData = await testRes.json().catch(() => ({}));
    console.warn(`[sync] Path lookup failed for "${VF_FOLDER_PATH}": ${errData?.error?.message || testRes.status}`);
  }
  if (VF_FOLDER_ID_FALLBACK) {
    console.log(`[sync] Using fallback folder ID: ${VF_FOLDER_ID_FALLBACK}`);
    return `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,lastModifiedDateTime,file,webUrl`;
  }
  throw new Error(`Could not resolve vF folder. Path "${VF_FOLDER_PATH}" not found and no fallback ID configured.`);
}

async function listVFFiles(token: string): Promise<VFFile[]> {
  const allFiles: VFFile[] = [];
  let url: string | null = await resolveVFFolderUrl(token);
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.error) throw new Error(`Graph folder listing error: ${data.error.message || JSON.stringify(data.error)}`);
    for (const item of data.value || []) {
      if (!item.file) continue;
      const name = item.name as string;
      if (!name.match(/\.(xlsx|xlsm)$/i)) continue;
      if (name.match(/Todos|Banking Results Tracker|Investment Dashboard|Sing grm|Octopus|updateMaster/i)) continue;
      if ((item.size || 0) > 20 * 1024 * 1024) continue;
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

function cellVal(ws: XLSXTypes.WorkSheet, addr: string): unknown {
  const cell = ws[addr];
  return cell ? (cell.v ?? null) : null;
}

function numVal(ws: XLSXTypes.WorkSheet, addr: string): number | null {
  const v = cellVal(ws, addr);
  if (v === null || v === undefined || v === "" || v === 0) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function strVal(ws: XLSXTypes.WorkSheet, addr: string): string {
  const v = cellVal(ws, addr);
  if (v === null || v === undefined || v === 0 || v === "0") return "";
  return String(v).trim();
}

// ── vF cell readers (shared by the Graph-range and XLSX paths) ──
type VfReader = { raw(addr: string): unknown; num(addr: string): number | null; str(addr: string): string };

function readerFromXlsxSheet(ws: XLSXTypes.WorkSheet): VfReader {
  return { raw: (a) => cellVal(ws, a), num: (a) => numVal(ws, a), str: (a) => strVal(ws, a) };
}

// Graph workbook range returns a 2-D values array for A1:G22 (col A=0 … G=6).
function readerFromRangeValues(values: unknown[][]): VfReader {
  const cell = (addr: string): unknown => {
    const m = addr.match(/^([A-Z])(\d+)$/);
    if (!m) return null;
    const col = m[1].charCodeAt(0) - 65;
    const row = Number(m[2]) - 1;
    const v = values[row]?.[col];
    return (v === "" || v === null || v === undefined) ? null : v;
  };
  return {
    raw: cell,
    num: (a) => { const v = cell(a); if (v === null || v === 0) return null; const n = Number(v); return isNaN(n) ? null : n; },
    str: (a) => { const v = cell(a); if (v === null || v === 0 || v === "0") return ""; return String(v).trim(); },
  };
}

function buildVfRecord(file: VFFile, r: VfReader, method: "graph" | "xlsx"): Record<string, unknown> | null {
  const tikr = r.str("B2")?.trim();
  if (!tikr) { console.warn(`[vF] No TIKR in ${file.name}`); return null; }
  const _bear = r.num("B9"), _base = r.num("C9"), _bull = r.num("D9");
  console.log(`[vF] Parsed (${method}) ${file.name} → TIKR="${tikr}" bear=${_bear} base=${_base} bull=${_bull}`);
  return {
    tikr,
    last_updated: (() => {
      const v = r.raw("A5");
      if (v === null || v === undefined) return "";
      if (typeof v === "number") return excelDateToISO(v);
      if (v instanceof Date) return v.toISOString().split("T")[0];
      return String(v);
    })(),
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
  };
}

// Primary parse path: Graph workbook SESSION → live evaluated values. A warm
// session reads heavy workbooks (e.g. the 5.6 MB Vedanta RemainCo model) that
// the download-and-XLSX path silently drops under the function time budget —
// the bug that let a manual sync overwrite VEDL with stale pre-demerger values.
// Throws on any transient Graph failure so parseVFFile can fall back to cached values.
async function parseVFFileGraph(token: string, file: VFFile): Promise<Record<string, unknown> | null> {
  const baseUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/workbook`;
  let sessionId: string | undefined;
  try {
    const sessionRes = await fetch(`${baseUrl}/createSession`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ persistChanges: false }),
      signal: AbortSignal.timeout(30000),
    });
    if (!sessionRes.ok) throw new Error(`createSession HTTP ${sessionRes.status}`);
    sessionId = (await sessionRes.json()).id as string;
    const sh: Record<string, string> = { Authorization: `Bearer ${token}`, "workbook-session-id": sessionId };

    const sheetsRes = await fetch(`${baseUrl}/worksheets?$select=name`, { headers: sh, signal: AbortSignal.timeout(30000) });
    if (!sheetsRes.ok) throw new Error(`worksheets HTTP ${sheetsRes.status}`);
    const sheetsData = await sheetsRes.json();
    if (sheetsData.error) throw new Error(sheetsData.error.message || "worksheets error");
    const summary = ((sheetsData.value || []) as { name: string }[])
      .map((s) => s.name)
      .find((n) => n.toLowerCase().replace(/\s+/g, " ").trim() === "tusk - summary");
    if (!summary) { console.warn(`[vF] SKIP ${file.name}: no "Tusk - Summary" sheet`); return null; }

    const rangeRes = await fetch(`${baseUrl}/worksheets('${encodeURIComponent(summary)}')/range(address='A1:G22')?$select=values`, { headers: sh, signal: AbortSignal.timeout(30000) });
    if (!rangeRes.ok) throw new Error(`range HTTP ${rangeRes.status}`);
    const rangeData = await rangeRes.json();
    if (rangeData.error) throw new Error(rangeData.error.message || "range error");
    return buildVfRecord(file, readerFromRangeValues((rangeData.values || []) as unknown[][]), "graph");
  } finally {
    if (sessionId) {
      fetch(`${baseUrl}/closeSession`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "workbook-session-id": sessionId } }).catch(() => {});
    }
  }
}

// Fallback parse path: download the .xlsx binary and read CACHED values.
async function parseVFFileXlsx(token: string, file: VFFile): Promise<Record<string, unknown> | null> {
  try {
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/content`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
    if (!res.ok) { console.warn(`[vF] Failed to download ${file.name}: ${res.status}`); return null; }
    const buffer = await res.arrayBuffer();
    const XLSX = await getXLSX();
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const summarySheet = wb.SheetNames.find(
      (s) => s.toLowerCase().replace(/\s+/g, " ").trim() === "tusk - summary"
    );
    if (!summarySheet) { console.warn(`[vF] SKIP ${file.name}: no "Tusk - Summary" sheet`); return null; }
    return buildVfRecord(file, readerFromXlsxSheet(wb.Sheets[summarySheet]), "xlsx");
  } catch (err) {
    console.warn(`[vF] Error parsing ${file.name}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// Graph session first (live values, handles heavy workbooks); on any transient
// Graph failure, fall back to the cached-values XLSX download.
async function parseVFFile(token: string, file: VFFile): Promise<Record<string, unknown> | null> {
  try {
    return await parseVFFileGraph(token, file);
  } catch (err) {
    console.warn(`[vF] Graph parse failed for ${file.name} (${err instanceof Error ? err.message : err}); falling back to XLSX cached values`);
    return parseVFFileXlsx(token, file);
  }
}

async function processVFFiles(
  token: string, files: VFFile[], concurrency: number = 3
): Promise<{ results: Map<string, Record<string, unknown>>; failures: string[] }> {
  const results = new Map<string, Record<string, unknown>>();
  const failures: string[] = [];
  const queue = [...files];
  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift()!;
      const data = await parseVFFile(token, file);
      if (data && data.tikr && typeof data.tikr === "string") {
        const tikr = data.tikr as string;
        if (results.has(tikr)) {
          // Reject the duplicate rather than silently overwriting. First-parsed
          // file wins; loud console.error so analyst template-copy mistakes
          // (wrong B2) fail visibly instead of corrupting the prior file's data.
          console.error(`[vF] DUPLICATE TIKR "${tikr}": "${file.name}" REJECTED — keeping "${(results.get(tikr)?._vf_source as string) || "unknown"}". Fix B2 in one of the files.`);
          continue;
        }
        results.set(tikr, data);
      } else if (data === null) failures.push(file.name);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
  await Promise.all(workers);
  return { results, failures };
}

// ═══════════════════════════════════════════════════════════════
// Live holdings reader — reads latest "YYYYMMDD Tusk EQ.xlsx"
// from the Positions & Leverage folder on OneDrive
// ═══════════════════════════════════════════════════════════════

interface HoldingRecord {
  asset_name: string;
  quantity: number;
  avg_price: number;
  amt_invested: number;
  current_price: number;
  overall_gain: number;
  overall_gain_pct: number;
  current_value: number;
}

async function readHoldings(token: string): Promise<HoldingRecord[] | null> {
  try {
    // List files in Positions & Leverage folder
    const listUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${POSITIONS_FOLDER_ID}/children?$select=id,name,lastModifiedDateTime,file&$top=50`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    const listData = await listRes.json();
    if (listData.error) {
      console.warn(`[holdings] Folder listing error: ${listData.error.message}`);
      return null;
    }

    // Find all "YYYYMMDD Tusk EQ.xlsx" files; sort descending so newest is first
    const eqFiles: { id: string; name: string }[] = (listData.value || [])
      .filter((f: { file?: unknown; name: string }) =>
        f.file && /^\d{6,8}\s+Tusk EQ\.xlsx$/i.test(f.name)
      )
      .sort((a: { name: string }, b: { name: string }) => b.name.localeCompare(a.name));

    if (eqFiles.length === 0) {
      console.warn("[holdings] No 'Tusk EQ.xlsx' file found in Positions folder");
      return null;
    }

    const file = eqFiles[0];
    console.log(`[holdings] Reading: ${file.name}`);

    // Download the file
    const dlRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/content`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" }
    );
    if (!dlRes.ok) {
      console.warn(`[holdings] Download failed: ${dlRes.status}`);
      return null;
    }

    const buffer = await dlRes.arrayBuffer();
    const XLSX = await getXLSX();
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
      header: 1,
      defval: "",
    });

    // Find the header row (contains "Asset Name")
    let headerRow = -1;
    for (let i = 0; i < rawRows.length; i++) {
      if (rawRows[i].some((c) => String(c).includes("Asset Name"))) {
        headerRow = i;
        break;
      }
    }
    if (headerRow === -1) {
      console.warn("[holdings] Header row not found in Tusk EQ file");
      return null;
    }

    const headers = rawRows[headerRow].map((h) => String(h).trim());
    const ci = {
      name:      headers.findIndex((h) => h.includes("Asset Name")),
      qty:       headers.findIndex((h) => h === "Quantity"),
      avgPrice:  headers.findIndex((h) => h.includes("Avg")),
      invested:  headers.findIndex((h) => h.includes("Invested") || h.includes("Amt")),
      currPrice: headers.findIndex((h) => h.includes("Curr") && h.includes("Price")),
      gain:      headers.findIndex((h) => h.includes("Overall Gain") && !h.includes("%")),
      gainPct:   headers.findIndex((h) => h.includes("Overall Gain") && h.includes("%")),
      currValue: headers.findIndex((h) => h.includes("Current Value")),
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
        asset_name:      name,
        quantity:        qty,
        avg_price:       avgPrice,
        amt_invested:    Number(row[ci.invested])  || qty * avgPrice,
        current_price:   Number(row[ci.currPrice]) || 0,
        overall_gain:    Number(row[ci.gain])      || 0,
        overall_gain_pct: Number(row[ci.gainPct]) || 0,
        current_value:   Number(row[ci.currValue]) || 0,
      });
    }

    console.log(`[holdings] Parsed ${holdings.length} holdings from ${file.name}`);
    return holdings.length > 0 ? holdings : null;
  } catch (err) {
    console.warn("[holdings] Error:", err instanceof Error ? err.message : err);
    return null;
  }
}

const TIKR_ALIAS: Record<string, string> = {
  "SMARTWORKS": "Smartworks",
  "INDIANB": "IndianB",
  "UNIONBANK": "unionbank",
  "CEINSYS": "538734",
  "SMLMAH": "505192",
  "PSUBNKBEES": "XBOM:590108",
  "SMARTWORKS COWORKING SPACES LIMITED (XNSE:SMARTWORKS)": "Smartworks",
  "IIFL Finance": "IIFL",
  "XNSE:MOTHERSON": "MOTHERSON",
};

// ═══════════════════════════════════════════════════════════════
// F&O positions reader — reads latest "YYYYMMDD Tusk FO.xlsx"
// from the Positions & Leverage folder on OneDrive
// ═══════════════════════════════════════════════════════════════

interface FoPosition {
  instrument_name: string;
  underlying: string;
  instrument_type: "FUT" | "OPT";
  expiry: string;
  strike?: number;
  option_type?: "CE" | "PE";
  broker: string;
  direction: "BUY" | "SELL";
  quantity: number;
  avg_cost: number;
  curr_price: number;
  exposure: number;
  unrealised_pnl: number;
}

function parseExpiry(ddmmyy: string): string {
  const parts = ddmmyy.split("-");
  if (parts.length !== 3) return ddmmyy;
  const [dd, mm, yy] = parts;
  return `20${yy}-${mm}-${dd}`;
}

async function readFoPositions(token: string): Promise<FoPosition[] | null> {
  console.log(`[fo] start; folder=${POSITIONS_FOLDER_ID} drive=${DRIVE_ID.slice(0, 12)}…`);
  try {
    const listUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${POSITIONS_FOLDER_ID}/children?$select=id,name,lastModifiedDateTime,file&$top=50`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    const listData = await listRes.json();
    console.log(`[fo] list status=${listRes.status} children=${(listData.value ?? []).length}`);
    if (listData.error) {
      console.warn(`[fo] Folder listing error: ${listData.error.message} (folder=${POSITIONS_FOLDER_ID})`);
      return null;
    }

    const allChildren: { name: string }[] = listData.value || [];
    const foFiles: { id: string; name: string }[] = allChildren
      .filter((f) => (f as { file?: unknown }).file && /^\d{6,8}\s+Tusk FO\.xlsx$/i.test(f.name))
      .map((f) => f as { id: string; name: string })
      .sort((a, b) => b.name.localeCompare(a.name));
    console.log(`[fo] matched ${foFiles.length} candidate FO files: ${foFiles.map((f) => f.name).join(", ") || "(none)"}`);

    if (foFiles.length === 0) {
      const nonMatching = allChildren.slice(0, 5).map((f) => f.name).join(", ");
      console.warn(`[fo] No 'Tusk FO.xlsx' file found in Positions folder ${POSITIONS_FOLDER_ID}; first children: ${nonMatching || "(folder empty)"}`);
      return null;
    }

    const file = foFiles[0];
    console.log(`[fo] Reading: ${file.name}`);

    const dlRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/content`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" }
    );
    console.log(`[fo] download status=${dlRes.status} content-length=${dlRes.headers.get("content-length") ?? "?"}`);
    if (!dlRes.ok) {
      console.warn(`[fo] Download failed: ${dlRes.status} for ${file.name}`);
      return null;
    }

    const buffer = await dlRes.arrayBuffer();
    const XLSX = await getXLSX();
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
      header: 1,
      defval: "",
    });
    console.log(`[fo] sheet=${wb.SheetNames[0]} rows=${rawRows.length}`);

    let headerRow = -1;
    for (let i = 0; i < rawRows.length; i++) {
      if (rawRows[i].some((c) => String(c).includes("Instrument Name"))) {
        headerRow = i;
        break;
      }
    }
    console.log(`[fo] headerRow=${headerRow}`);
    if (headerRow === -1) {
      console.warn(`[fo] Header row not found in ${file.name}; first row: ${JSON.stringify(rawRows[0] ?? []).slice(0, 200)}`);
      return null;
    }

    const headers = rawRows[headerRow].map((h) => String(h).trim());
    const ci = {
      name:          headers.findIndex((h) => h.includes("Instrument Name")),
      broker:        headers.findIndex((h) => h.toLowerCase().includes("broker")),
      direction:     headers.findIndex((h) => /^buy\/sell$/i.test(h) || /^buy.sell$/i.test(h)),
      strike:        headers.findIndex((h) => h.toLowerCase().includes("strike")),
      quantity:      headers.findIndex((h) => h.toLowerCase() === "quantity"),
      avgCost:       headers.findIndex((h) => h.toLowerCase().includes("cost/unit") || (h.toLowerCase().includes("cost") && !h.toLowerCase().includes("total"))),
      currPrice:     headers.findIndex((h) => h.toLowerCase().includes("curr") && h.toLowerCase().includes("price")),
      exposure:      headers.findIndex((h) => h.toLowerCase().includes("exposure")),
      unrealisedPnl: headers.findIndex((h) => h.toLowerCase().includes("unreali")),
    };

    const SKIP_ROW = /^(stock|total|figures)/i;
    const positions: FoPosition[] = [];

    for (let i = headerRow + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      const name = String(row[ci.name] ?? "").trim();
      if (!name || SKIP_ROW.test(name)) continue;

      const futMatch = name.match(/^(.+)-FUTSTK:(\d{2}-\d{2}-\d{2})$/);
      const optMatch = name.match(/^(.+)-OPTSTK:(\d{2}-\d{2}-\d{2}):([\d.]+):(CE|PE)$/);

      if (!futMatch && !optMatch) continue;

      let underlying: string;
      let instrument_type: "FUT" | "OPT";
      let expiry: string;
      let strike: number | undefined;
      let option_type: "CE" | "PE" | undefined;

      if (futMatch) {
        underlying = futMatch[1];
        instrument_type = "FUT";
        expiry = parseExpiry(futMatch[2]);
      } else {
        underlying = optMatch![1];
        instrument_type = "OPT";
        expiry = parseExpiry(optMatch![2]);
        strike = Math.abs(Number(optMatch![3])) || undefined;
        option_type = optMatch![4] as "CE" | "PE";
      }

      // Strike price column may show puts as (2600.00) — parse and abs
      const rawStrike = ci.strike >= 0 ? row[ci.strike] : "";
      const parsedStrike = parseFloat(String(rawStrike).replace(/[()]/g, ""));
      const strikeFromCol = rawStrike !== "" && !isNaN(parsedStrike) ? Math.abs(parsedStrike) : undefined;
      if (instrument_type === "OPT" && strikeFromCol) strike = strikeFromCol;

      const broker = String(row[ci.broker] ?? "").trim();
      const dirRaw = String(row[ci.direction] ?? "").trim().toUpperCase();
      const rawExposure = Number(row[ci.exposure]) || 0;
      // Dhan exports "LONG"/"SHORT"; some brokers use "BUY"/"SELL".
      // Exposure-sign fallback uses option delta logic:
      //   Short CALL / Short FUT → negative delta → negative exposure → SELL
      //   Short PUT              → positive delta → positive exposure → SELL (inverted!)
      const direction: "BUY" | "SELL" =
        (dirRaw === "SELL" || dirRaw === "SHORT") ? "SELL" :
        (dirRaw === "BUY"  || dirRaw === "LONG")  ? "BUY"  :
        (instrument_type === "OPT" && option_type === "PE")
          ? (rawExposure > 0 ? "SELL" : "BUY")   // short put → positive exposure
          : (rawExposure < 0 ? "SELL" : "BUY");  // short call / future → negative exposure
      const quantity = Number(row[ci.quantity]) || 0;
      const avg_cost = Number(row[ci.avgCost]) || 0;
      const curr_price = Number(row[ci.currPrice]) || 0;
      const exposure = Math.abs(rawExposure);  // always positive; direction captures long/short
      const rawPnl = Number(row[ci.unrealisedPnl]) || 0;
      // Some brokers compute (curr_price - avg_cost) × qty regardless of direction.
      // For SELL, profit means curr_price < avg_cost → priceDiff > 0 → rawPnl should be > 0.
      // If sign contradicts expected direction, flip it.
      const priceDiff = direction === "SELL" ? avg_cost - curr_price : curr_price - avg_cost;
      const unrealised_pnl = priceDiff !== 0 && (rawPnl >= 0) !== (priceDiff >= 0) ? -rawPnl : rawPnl;

      const pos: FoPosition = {
        instrument_name: name,
        underlying,
        instrument_type,
        expiry,
        broker,
        direction,
        quantity: direction === "SELL" ? -Math.abs(quantity) : Math.abs(quantity),
        avg_cost,
        curr_price,
        exposure,
        unrealised_pnl,
      };
      if (strike !== undefined) pos.strike = strike;
      if (option_type !== undefined) pos.option_type = option_type;

      positions.push(pos);
    }

    console.log(`[fo] Parsed ${positions.length} F&O positions from ${file.name}`);
    if (positions.length === 0) {
      const dataRows = rawRows.slice(headerRow + 1, headerRow + 6);
      const sampleNames = dataRows
        .map((r) => String(r[Math.max(0, ci.name)] ?? "").trim())
        .filter(Boolean)
        .slice(0, 3);
      console.warn(`[fo] zero positions parsed (rows after header: ${rawRows.length - headerRow - 1}, sample names: ${sampleNames.join(" | ") || "(none)"}); ci.name=${ci.name}`);
    }
    return positions.length > 0 ? positions : null;
  } catch (err) {
    const stack = err instanceof Error ? err.stack : undefined;
    console.warn(`[fo] Error: ${err instanceof Error ? err.message : err}${stack ? `\n${stack}` : ""}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// POST handler — supports 3 modes:
//   { mode: "baseline" }  → JVB Output only (fast, <10s)
//   { mode: "vf", offset, batchSize, baselineStocks }  → process a batch of vF files
//   { } or no body → legacy full sync (may timeout on Hobby)
// ═══════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  // Auth: user session OR internal cron secret
  const cronSecret = request.headers.get("x-cron-secret");
  const isCron = cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;

  if (!isCron) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, unknown> = {};
  try { body = await request.json().catch(() => ({})); } catch { /* empty */ }
  const mode = (body.mode as string) || "full";

  try {
    const token = await getGraphToken();

    // ── Mode: holdings ── reads only Tusk EQ + Tusk FO from the
    // Positions & Leverage folder. No JVB read, no vF processing.
    // For when the analyst has only updated today's positions exports and
    // doesn't need the full ~10-min baseline+vF pipeline. Expected: <30s.
    if (mode === "holdings") {
      console.log("[sync] Mode: holdings");
      const [liveHoldings, liveFo] = await Promise.all([
        readHoldings(token),
        readFoPositions(token),
      ]);
      console.log(`[sync] Mode: holdings — holdings=${liveHoldings?.length ?? "null"} fo=${liveFo?.length ?? "null"}`);
      return NextResponse.json({
        mode: "holdings",
        holdings: liveHoldings,
        fo_positions: liveFo,
        holdings_source: liveHoldings ? "live_onedrive" : "read_failed",
        fo_source:       liveFo       ? "live_onedrive" : "read_failed",
        refreshedAt: new Date().toISOString(),
      });
    }

    // ── Mode: baseline ── returns JVB + file list (fast)
    if (mode === "baseline") {
      console.log("[sync] Mode: baseline");
      const rows = await readJVBOutput(token);
      const baselineStocks = parseStocks(rows);
      console.log(`[sync] JVB baseline: ${baselineStocks.length} stocks`);

      const allFiles = await listVFFiles(token);
      const dedupedFiles = deduplicateVFFiles(allFiles);
      console.log(`[sync] Found ${allFiles.length} files, deduplicated to ${dedupedFiles.length}`);

      // Fill missing fields from static-db (e.g., ETF valuations not in JVB baseline)
      const { filledCount: bFilled, addedCount: bAdded } = enrichFromStaticDb(baselineStocks);
      if (bFilled > 0) console.log(`[sync] Baseline: filled static-db fields for ${bFilled} stocks`);
      if (bAdded > 0) console.log(`[sync] Baseline: added ${bAdded} static-db stocks`);

      // Read live holdings and F&O positions in parallel with baseline (non-blocking)
      const [liveHoldingsBaseline, liveFoBaseline] = await Promise.all([
        readHoldings(token),
        readFoPositions(token),
      ]);
      const holdingsBaseline = liveHoldingsBaseline ?? staticDb.holdings;
      console.log(`[sync] Holdings (baseline): ${holdingsBaseline.length} records (${liveHoldingsBaseline ? "live" : "static"})`);
      console.log(`[sync] F&O positions (baseline): ${liveFoBaseline === null ? "null (read failed) — caller should preserve last-good" : `${liveFoBaseline.length} records (live)`}`);

      return NextResponse.json({
        mode: "baseline",
        stocks: deduplicateStocks(baselineStocks),
        holdings: holdingsBaseline,
        fo_positions: liveFoBaseline,
        ticker_map: staticDb.ticker_map,
        holdings_source: liveHoldingsBaseline ? "live_onedrive" : "static_fallback",
        vfFiles: dedupedFiles.map((f) => ({ id: f.id, name: f.name, size: f.size, webUrl: f.webUrl })),
        totalVfFiles: dedupedFiles.length,
        refreshedAt: new Date().toISOString(),
      });
    }

    // ── Mode: vf ── process a batch of vF files and merge into provided baseline
    if (mode === "vf") {
      const offset = Number(body.offset) || 0;
      const batchSize = Number(body.batchSize) || 20;
      const vfFileList = body.vfFiles as { id: string; name: string; size: number; webUrl?: string }[] || [];
      const baselineStocks = body.baselineStocks as Record<string, unknown>[] || [];

      const filesToProcess: VFFile[] = vfFileList
        .slice(offset, offset + batchSize)
        .map((f) => ({ ...f, lastModifiedDateTime: "", webUrl: f.webUrl || "" }));
      const isDone = offset + batchSize >= vfFileList.length;

      console.log(`[sync] Mode: vf batch offset=${offset} size=${filesToProcess.length} total=${vfFileList.length}`);
      const { results: vfMap, failures } = await processVFFiles(token, filesToProcess, 2);
      console.log(`[sync] Parsed ${vfMap.size} vF files, ${failures.length} failures`);

      // Apply aliases
      for (const [vfTikr, jvbTikr] of Object.entries(TIKR_ALIAS)) {
        const data = vfMap.get(vfTikr);
        if (data && !vfMap.has(jvbTikr)) { vfMap.set(jvbTikr, data); vfMap.delete(vfTikr); }
      }


      // Fuzzy match vF tikrs to baseline (case-insensitive)
      const baselineTikrs = baselineStocks.map((s: Record<string, unknown>) => s.tikr as string);
      const baselineSet = new Set(baselineTikrs.map(t => t.toLowerCase()));
      for (const [vfTikr, fData] of Array.from(vfMap.entries())) {
        if (baselineSet.has(vfTikr.toLowerCase())) continue; // exact baseline match — skip fuzzy
        for (const jt of baselineTikrs) {
          if (vfMap.has(jt)) continue;
          const vfL = vfTikr.toLowerCase(), jtL = jt.toLowerCase();
          const shorter = Math.min(vfTikr.length, jt.length);
          const longer = Math.max(vfTikr.length, jt.length);
          if (vfL === jtL || ((vfL.includes(jtL) || jtL.includes(vfL)) && shorter / longer >= 0.5)) {
            console.log(`[sync] Fuzzy matched vF "${vfTikr}" -> baseline "${jt}"`);
            vfMap.set(jt, fData);
            if (jt !== vfTikr) vfMap.delete(vfTikr);
            break;
          }
        }
      }

      // Merge into baseline
      let matchCount = 0;
      const merged: Record<string, unknown>[] = baselineStocks.map((stock) => {
        const tikr = stock.tikr as string;
        const vfData = vfMap.get(tikr);
        if (!vfData) return stock;
        matchCount++;
        const m = { ...stock };
        for (const field of VF_OVERRIDE_FIELDS) {
          const v = vfData[field];
          if (v !== null && v !== undefined && v !== "") m[field] = v;
        }
        m._vf_source = vfData._vf_source;
        m.vf_web_url = vfData.vf_web_url;
        return m;
      });

      // Add standalone vF stocks (not in baseline)
      const matchedTikrs = new Set(merged.map((s) => s.tikr as string));
      let standaloneCount = 0;
      for (const [tikr, vfData] of Array.from(vfMap.entries())) {
        if (!matchedTikrs.has(tikr)) {
          const name = ((vfData._vf_source as string) || "")
            .replace(/^\d{6,8}[_ ]?/, "")
            .replace(/(?:[_ ]?[vV][fF]\d?)?\.xls[xm]$/i, "");
          // Spread vfData FIRST: its tikr is the raw B2 value, which differs from
          // the map key after TIKR_ALIAS/fuzzy resolution (e.g. XNSE:MOTHERSON -> MOTHERSON).
          merged.push({ ...vfData, tikr, official_name: name });
          standaloneCount++;
          console.log(`[sync] Added standalone vF stock: ${tikr}`);
        }
      }

      // Fill missing fields from static-db + add absent static-db stocks
      const { filledCount: vfFilled, addedCount: vfAdded } = enrichFromStaticDb(merged);
      if (vfFilled > 0) console.log(`[sync] vF batch: filled static-db fields for ${vfFilled} stocks`);
      if (vfAdded > 0) console.log(`[sync] vF batch: added ${vfAdded} static-db stocks`);

      // Log unmatched vF entries for debugging
      const unmatchedVf: string[] = [];
      for (const [vfTikr, vfD] of Array.from(vfMap.entries())) {
        const wasMatched = merged.some((s: Record<string, unknown>) => s._vf_source === (vfD as Record<string, unknown>)._vf_source);
        if (!wasMatched) {
          unmatchedVf.push(`${vfTikr} (${(vfD as Record<string, unknown>)._vf_source})`);
          console.warn(`[sync] vF TIKR="${vfTikr}" (from ${(vfD as Record<string, unknown>)._vf_source}) -- no baseline match`);
        }
      }

      reportSuccess("sync");
      return NextResponse.json({
        mode: "vf",
        stocks: deduplicateStocks(merged),
        offset,
        processed: filesToProcess.length,
        matched: matchCount,
        failures,
        unmatchedVf,
        done: isDone,
        totalVfFiles: vfFileList.length,
        refreshedAt: new Date().toISOString(),
      });
    }

    // ── Mode: full (legacy) ── try everything in one call
    console.log("[sync] Mode: full (legacy)");
    const rows = await readJVBOutput(token);
    const baselineStocks = parseStocks(rows);
    const allFiles = await listVFFiles(token);
    const dedupedFiles = deduplicateVFFiles(allFiles);
    const { results: vfMap, failures: vfFailures } = await processVFFiles(token, dedupedFiles, 2);

    for (const [vfTikr, jvbTikr] of Object.entries(TIKR_ALIAS)) {
      const data = vfMap.get(vfTikr);
      if (data && !vfMap.has(jvbTikr)) { vfMap.set(jvbTikr, data); vfMap.delete(vfTikr); }
    }
    const jvbTikrs = baselineStocks.map((s) => s.tikr as string);
    const baselineSetFull = new Set(jvbTikrs.map(t => t.toLowerCase()));
    for (const [vfTikr, data] of Array.from(vfMap.entries())) {
      if (baselineSetFull.has(vfTikr.toLowerCase())) continue; // exact baseline match — skip fuzzy
      for (const jt of jvbTikrs) {
        if (vfMap.has(jt)) continue;
        const shorter = Math.min(vfTikr.length, jt.length);
        const longer = Math.max(vfTikr.length, jt.length);
        const vfL = vfTikr.toLowerCase(), jtL = jt.toLowerCase();
        if ((vfL.includes(jtL) || jtL.includes(vfL)) && shorter / longer >= 0.5) { vfMap.set(jt, data); if (jt !== vfTikr) vfMap.delete(vfTikr); break; }
      }
    }

    let vfMatchCount = 0;
    const mergedStocks: Record<string, unknown>[] = baselineStocks.map((stock) => {
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
      merged.vf_web_url = vfData.vf_web_url;
      return merged;
    });

    // Add standalone vF stocks (not in JVB baseline)
    const fullMatchedTikrs = new Set(mergedStocks.map((s) => s.tikr as string));
    for (const [tikr, vfData] of Array.from(vfMap.entries())) {
      if (!fullMatchedTikrs.has(tikr)) {
        const name = ((vfData._vf_source as string) || "")
          .replace(/^\d{6,8}[_ ]?/, "")
          .replace(/(?:[_ ]?[vV][fF]\d?)?\.xls[xm]$/i, "");
        // Spread vfData FIRST so the alias/fuzzy-resolved map key wins over raw B2.
        mergedStocks.push({ ...vfData, tikr, official_name: name });
        console.log(`[sync] Full: added standalone vF stock: ${tikr}`);
      }
    }

    // Fill missing fields from static-db + add absent static-db stocks
    const { filledCount: fullFilled, addedCount: fullAdded } = enrichFromStaticDb(mergedStocks);
    if (fullFilled > 0) console.log(`[sync] Full: filled static-db fields for ${fullFilled} stocks`);
    if (fullAdded > 0) console.log(`[sync] Full: added ${fullAdded} static-db stocks`);

    const finalStocks = deduplicateStocks(mergedStocks);

    if (finalStocks.length === 0) {
      return NextResponse.json({ error: "No valid stocks found" }, { status: 422 });
    }

    // Read live holdings and F&O positions from OneDrive (fallback to static database.json)
    console.log("[sync] Reading live holdings and F&O positions...");
    const [liveHoldings, liveFoPositions] = await Promise.all([
      readHoldings(token),
      readFoPositions(token),
    ]);
    const holdings = liveHoldings ?? staticDb.holdings;
    const holdingsSource = liveHoldings ? "live_onedrive" : "static_fallback";
    console.log(`[sync] Holdings: ${holdings.length} records (${holdingsSource})`);
    console.log(`[sync] F&O positions: ${liveFoPositions === null ? "null (read failed) — caller should preserve last-good" : `${liveFoPositions.length} records (live)`}`);

    reportSuccess("sync");
    return NextResponse.json({
      mode: "full",
      stocks: finalStocks,
      holdings,
      fo_positions: liveFoPositions,
      ticker_map: staticDb.ticker_map,
      metadata: {
        source: "JVB Output + vF overrides",
        extracted_at: new Date().toISOString(),
        total_stocks: finalStocks.length,
        vf_files_found: allFiles.length,
        vf_files_parsed: vfMap.size,
        vf_stocks_matched: vfMatchCount,
        holdings_source: holdingsSource,
        total_holdings: holdings.length,
        vf_parse_failures: vfFailures,
      },
      refreshedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    reportError("sync");
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/sync] Error:", message);
    return NextResponse.json({ error: `Sync failed: ${message}` }, { status: 500 });
  }
}
