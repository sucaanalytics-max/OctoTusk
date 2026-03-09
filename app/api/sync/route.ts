import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import staticDb from "@/data/database.json";
import { auth } from "@/auth";
import { reportError, reportSuccess } from "@/lib/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60; // Hobby tier max

// ── OneDrive coordinates (configurable via env vars) ──
const DRIVE_ID =
  process.env.GRAPH_DRIVE_ID ||
  "b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH";
const OCTOPUS_ITEM_ID =
  process.env.GRAPH_OCTOPUS_ITEM_ID ||
  "01XUUXNQ72HPRIFGFYLVGID3Y3UPXXUV4H"; // Octopus Dashboard_.xlsx
const SHEET_NAME = "JVB Output";
// Use path-based lookup by default; fall back to hardcoded ID
const VF_FOLDER_PATH =
  process.env.GRAPH_VF_FOLDER_PATH ||
  "Tusk Equity/Portfolio Stock Valuations - Bull Base Bear (Tusk Prop)";
const VF_FOLDER_ID_FALLBACK =
  process.env.GRAPH_VF_FOLDER_ID || "01XUUXNQYRQ7B5PBRKMZGLUVNKA5K5MXY5";

// ── Column index → database.json field mapping (JVB Output baseline) ──
const COL_MAP: Record<number, string> = {
  41: "tikr",
  1: "official_name",
  2: "in_fno",
  3: "holding_cash_lakhs",
  4: "holding_pct",
  5: "abs_leverage",
  6: "leverage_pct",
  7: "bear_current",
  8: "base_current",
  9: "bull_current",
  10: "target_1y",
  11: "target_2y",
  12: "div_yield",
  13: "cmp",
  14: "upside_bear",
  15: "upside_base",
  16: "upside_bull",
  17: "upside_1y",
  18: "upside_2y",
  20: "base_pe",
  21: "base_pe_2sd",
  22: "base_pb",
  23: "base_pb_2sd",
  24: "base_evebitda",
  25: "base_evebitda_2sd",
  26: "reviewed_pranay",
  27: "vp",
  28: "sa",
  29: "conviction",
  30: "understanding",
  31: "sector",
  32: "subsector",
  33: "last_updated",
  34: "comments",
  39: "score",
  40: "score_adj_1y",
  42: "remarks",
  43: "exp_profit_fy27",
  44: "exp_profit_fy28",
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

// Fields that vF files override (valuation data — the source of truth)
const VF_OVERRIDE_FIELDS: string[] = [
  "bear_current", "base_current", "bull_current",
  "upside_bear", "upside_base", "upside_bull",
  "target_1y", "target_2y", "upside_1y", "upside_2y",
  "base_pe", "base_pe_2sd", "base_pb", "base_pb_2sd",
  "base_evebitda", "base_evebitda_2sd",
  "vp", "sa", "conviction", "understanding",
  "sector", "subsector", "last_updated", "comments",
];

/** Convert Excel serial date to ISO string */
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

/** Get Graph API access token */
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
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

      if (val === "" || val === null || val === undefined) {
        val = null;
      } else if (typeof val === "string" && val.startsWith("#")) {
        val = null;
      }

      if (NUMERIC_FIELDS.has(field) && val !== null) {
        const n = Number(val);
        val = isNaN(n) ? null : n;
      }

      if (field === "last_updated" && val !== null) {
        val = excelDateToISO(val as number | string);
      }

      if (STRING_FIELDS.has(field)) {
        if (val === null || val === 0 || val === "0") {
          val = "";
        } else {
          val = String(val);
        }
      }

      stock[field] = val;
    }

    if (!stock.tikr || typeof stock.tikr !== "string" || stock.tikr.trim() === "") {
      continue;
    }
    stocks.push(stock);
  }
  return stocks;
}

// ═══════════════════════════════════════════════════════════════
// vF workbook reader — reads directly from individual vF files
// ═══════════════════════════════════════════════════════════════

interface VFFile {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
}

/** Resolve the vF folder — try path-based lookup first, then fallback to hardcoded ID */
async function resolveVFFolderUrl(token: string): Promise<string> {
  // Try path-based lookup first (handles folder renames/moves)
  if (VF_FOLDER_PATH) {
    const encodedPath = encodeURIComponent(VF_FOLDER_PATH);
    const pathUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children?$top=200&$select=id,name,size,lastModifiedDateTime,file`;

    const testRes = await fetch(pathUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (testRes.ok) {
      console.log(`[sync] Resolved vF folder by path: "${VF_FOLDER_PATH}"`);
      return pathUrl;
    }
    const errData = await testRes.json().catch(() => ({}));
    console.warn(`[sync] Path lookup failed for "${VF_FOLDER_PATH}": ${errData?.error?.message || testRes.status}`);
  }

  // Fallback to hardcoded folder ID
  if (VF_FOLDER_ID_FALLBACK) {
    console.log(`[sync] Using fallback folder ID: ${VF_FOLDER_ID_FALLBACK}`);
    return `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,lastModifiedDateTime,file`;
  }

  throw new Error(`Could not resolve vF folder. Path "${VF_FOLDER_PATH}" not found and no fallback ID configured. Set GRAPH_VF_FOLDER_PATH or GRAPH_VF_FOLDER_ID env vars.`);
}

/** List all xlsx/xlsm files in the vF folder */
async function listVFFiles(token: string): Promise<VFFile[]> {
  const allFiles: VFFile[] = [];
  let url: string | null = await resolveVFFolderUrl(token);

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.error) {
      throw new Error(`Graph folder listing error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    for (const item of data.value || []) {
      // Skip folders (no file property)
      if (!item.file) continue;
      const name = item.name as string;
      // Only xlsx and xlsm files
      if (!name.match(/\.(xlsx|xlsm)$/i)) continue;
      // Skip known non-valuation files
      if (name.match(/Todos|Banking Results Tracker|Investment Dashboard|Sing grm|Octopus|updateMaster/i)) continue;
      // Skip very large files (>20MB) to avoid memory issues
      if ((item.size || 0) > 20 * 1024 * 1024) {
        console.warn(`[vF] Skipping large file: ${name} (${((item.size || 0) / 1024 / 1024).toFixed(1)}MB)`);
        continue;
      }

      allFiles.push({
        id: item.id,
        name: name,
        size: item.size || 0,
        lastModifiedDateTime: item.lastModifiedDateTime || "",
      });
    }

    url = data["@odata.nextLink"] || null;
  }

  return allFiles;
}

/** Pick the latest vF file per stock (by date prefix in filename) */
function deduplicateVFFiles(files: VFFile[]): VFFile[] {
  const stockMap = new Map<string, VFFile>();

  for (const f of files) {
    // Normalize: extract stock name from patterns like "20250423_Shriram Fin_vf.xlsx"
    const match = f.name.match(/^\d{6,8}[_ ]?(.+?)(?:[_ ]?[vV][fF]\d?)?\.xls[xm]$/i);
    if (!match) {
      // Try without date prefix (rare)
      const match2 = f.name.match(/^(.+?)(?:[_ ]?[vV][fF]\d?)?\.xls[xm]$/i);
      if (match2) {
        const key = match2[1].trim().toLowerCase();
        if (!stockMap.has(key) || f.name > (stockMap.get(key)!.name)) {
          stockMap.set(key, f);
        }
      }
      continue;
    }

    const key = match[1].trim().toLowerCase();
    if (!stockMap.has(key) || f.name > (stockMap.get(key)!.name)) {
      stockMap.set(key, f);
    }
  }

  return Array.from(stockMap.values());
}

/** Read a cell value from a SheetJS worksheet */
function cellVal(ws: XLSX.WorkSheet, addr: string): unknown {
  const cell = ws[addr];
  if (!cell) return null;
  return cell.v ?? null;
}

/** Parse numeric value from a cell */
function numVal(ws: XLSX.WorkSheet, addr: string): number | null {
  const v = cellVal(ws, addr);
  if (v === null || v === undefined || v === "" || v === 0) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Parse string value from a cell */
function strVal(ws: XLSX.WorkSheet, addr: string): string {
  const v = cellVal(ws, addr);
  if (v === null || v === undefined || v === 0 || v === "0") return "";
  return String(v).trim();
}

/** Download a vF file as binary and parse the "Tusk - Summary" Output Section */
async function parseVFFile(token: string, file: VFFile): Promise<Record<string, unknown> | null> {
  try {
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/content`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "follow",
    });

    if (!res.ok) {
      console.warn(`[vF] Failed to download ${file.name}: ${res.status}`);
      return null;
    }

    const buffer = await res.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });

    // Find "Tusk - Summary" sheet
    const summarySheet = wb.SheetNames.find(
      (s) => s.toLowerCase().replace(/\s+/g, " ").trim() === "tusk - summary"
    );
    if (!summarySheet) {
      return null;
    }

    const ws = wb.Sheets[summarySheet];

    const tikr = strVal(ws, "B2");
    if (!tikr) {
      console.warn(`[vF] No TIKR in ${file.name}`);
      return null;
    }

    const vfData: Record<string, unknown> = {
      tikr,
      last_updated: (() => {
        const v = cellVal(ws, "A5");
        if (v === null || v === undefined) return "";
        if (typeof v === "number") return excelDateToISO(v);
        if (v instanceof Date) return v.toISOString().split("T")[0];
        return String(v);
      })(),
      vp: strVal(ws, "B5"),
      sa: strVal(ws, "C5"),
      conviction: numVal(ws, "D5"),
      understanding: numVal(ws, "E5"),
      sector: strVal(ws, "F5"),
      subsector: strVal(ws, "G5"),

      bear_current: numVal(ws, "B9"),
      base_current: numVal(ws, "C9"),
      bull_current: numVal(ws, "D9"),

      upside_bear: numVal(ws, "B10"),
      upside_base: numVal(ws, "C10"),
      upside_bull: numVal(ws, "D10"),

      target_1y: numVal(ws, "C11"),
      upside_1y: numVal(ws, "E11"),
      target_2y: numVal(ws, "C12"),
      upside_2y: numVal(ws, "E12"),

      base_pe: numVal(ws, "C16"),
      base_pe_2sd: numVal(ws, "F16"),
      base_pb: numVal(ws, "C17"),
      base_pb_2sd: numVal(ws, "F17"),
      base_evebitda: numVal(ws, "C18"),
      base_evebitda_2sd: numVal(ws, "F18"),

      comments: strVal(ws, "B21"),

      _vf_source: file.name,
    };

    return vfData;
  } catch (err) {
    console.warn(`[vF] Error parsing ${file.name}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Process vF files with concurrency limit */
async function processVFFiles(
  token: string,
  files: VFFile[],
  concurrency: number = 5
): Promise<{ results: Map<string, Record<string, unknown>>; failures: string[] }> {
  const results = new Map<string, Record<string, unknown>>();
  const failures: string[] = [];
  const queue = [...files];

  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift()!;
      const data = await parseVFFile(token, file);
      if (data && data.tikr && typeof data.tikr === "string") {
        results.set(data.tikr as string, data);
      } else if (data === null) {
        failures.push(file.name);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
  await Promise.all(workers);

  return { results, failures };
}

// ═══════════════════════════════════════════════════════════════
// TIKR alias map: vF TIKR → JVB TIKR (for known mismatches)
// ═══════════════════════════════════════════════════════════════
const TIKR_ALIAS: Record<string, string> = {
  "SMARTWORKS": "Smartworks",
  "INDIANB": "IndianB",
  "UNIONBANK": "unionbank",
};

// ═══════════════════════════════════════════════════════════════
// Main POST handler — merges JVB baseline + vF overrides
// Supports chunked sync via request body: { offset, batchSize }
// ═══════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse optional chunking params
  let offset = 0;
  let batchSize = 0; // 0 = process all
  try {
    const body = await request.json().catch(() => ({}));
    offset = Number(body.offset) || 0;
    batchSize = Number(body.batchSize) || 0;
  } catch { /* use defaults */ }

  try {
    const token = await getGraphToken();

    // Step 1: Read JVB Output baseline
    console.log("[sync] Reading JVB Output baseline...");
    const rows = await readJVBOutput(token);
    const baselineStocks = parseStocks(rows);
    console.log(`[sync] JVB baseline: ${baselineStocks.length} stocks`);

    // Step 2: List and deduplicate vF files
    console.log("[sync] Listing vF files...");
    const allFiles = await listVFFiles(token);
    console.log(`[sync] Found ${allFiles.length} xlsx/xlsm files in folder`);

    const dedupedFiles = deduplicateVFFiles(allFiles);
    console.log(`[sync] Deduplicated to ${dedupedFiles.length} unique files`);

    // Step 3: Apply chunking if requested
    const filesToProcess = batchSize > 0
      ? dedupedFiles.slice(offset, offset + batchSize)
      : dedupedFiles;
    const isChunked = batchSize > 0;
    const isDone = !isChunked || (offset + batchSize >= dedupedFiles.length);

    console.log(`[sync] Processing ${filesToProcess.length} vF files (offset=${offset}, batch=${batchSize || "all"})...`);
    const vfStart = Date.now();
    const { results: vfMap, failures: vfFailures } = await processVFFiles(token, filesToProcess, 8);
    console.log(`[sync] Parsed ${vfMap.size} vF files with valid TIKR in ${((Date.now() - vfStart) / 1000).toFixed(1)}s`);
    if (vfFailures.length > 0) {
      console.log(`[sync] Failed to parse: ${vfFailures.join(", ")}`);
    }

    // Apply TIKR aliases
    for (const [vfTikr, jvbTikr] of Object.entries(TIKR_ALIAS)) {
      const data = vfMap.get(vfTikr);
      if (data && !vfMap.has(jvbTikr)) {
        vfMap.set(jvbTikr, data);
      }
    }
    // Substring matching for long TIKRs
    const jvbTikrs = baselineStocks.map((s) => s.tikr as string);
    for (const [vfTikr, data] of Array.from(vfMap.entries())) {
      for (const jt of jvbTikrs) {
        if (vfMap.has(jt)) continue;
        if (vfTikr.includes(jt) || jt.includes(vfTikr)) {
          vfMap.set(jt, data);
        }
      }
    }

    // Step 4: Merge — vF overrides valuation fields on JVB baseline
    let vfMatchCount = 0;
    const mergedStocks = baselineStocks.map((stock) => {
      const tikr = stock.tikr as string;
      const vfData = vfMap.get(tikr);

      if (!vfData) return stock;

      vfMatchCount++;
      const merged = { ...stock };

      for (const field of VF_OVERRIDE_FIELDS) {
        const vfVal = vfData[field];
        if (vfVal !== null && vfVal !== undefined && vfVal !== "") {
          merged[field] = vfVal;
        }
      }

      merged._vf_source = vfData._vf_source;

      return merged;
    });

    if (mergedStocks.length === 0) {
      return NextResponse.json(
        { error: "No valid stocks found" },
        { status: 422 }
      );
    }

    const uniqueStocks = mergedStocks.reduce((set, s) => { set.add(s.tikr as string); return set; }, new Set<string>());

    reportSuccess("sync");
    return NextResponse.json({
      stocks: mergedStocks,
      holdings: staticDb.holdings,
      ticker_map: staticDb.ticker_map,
      metadata: {
        source: "JVB Output (baseline) + vF workbooks (live overrides)",
        extracted_at: new Date().toISOString(),
        total_stocks: mergedStocks.length,
        unique_stocks: uniqueStocks.size,
        vf_folder_path: VF_FOLDER_PATH,
        vf_files_found: allFiles.length,
        vf_files_deduped: dedupedFiles.length,
        vf_files_processed: filesToProcess.length,
        vf_files_parsed: vfMap.size,
        vf_stocks_matched: vfMatchCount,
        total_holdings: staticDb.holdings?.length || 0,
        vf_parse_failures: vfFailures,
        // Chunking info
        chunked: isChunked,
        chunk_offset: offset,
        chunk_size: batchSize,
        chunk_done: isDone,
        total_vf_files: dedupedFiles.length,
        // Diagnostics
        vf_all_files: allFiles.map((f) => ({ name: f.name, sizeMB: (f.size / 1024 / 1024).toFixed(1) })),
        vf_deduped_out: allFiles.filter((f) => !dedupedFiles.some((d) => d.id === f.id)).map((f) => f.name),
        vf_unmatched_tikrs: Array.from(vfMap.entries())
          .filter(([tikr]) => !baselineStocks.some((s) => s.tikr === tikr))
          .map(([tikr, data]) => ({ tikr, file: data._vf_source })),
        jvb_unmatched: mergedStocks.filter((s) => !s._vf_source).map((s) => s.tikr),
      },
      refreshedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    reportError("sync");
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/sync] Error:", message);
    return NextResponse.json(
      { error: `Sync failed: ${message}` },
      { status: 500 }
    );
  }
}
