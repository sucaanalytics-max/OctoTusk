#!/usr/bin/env npx tsx
/**
 * Update sector/subsector cells in OneDrive Excel files via Microsoft Graph.
 *
 * Targets two sources:
 *   1. JVB Output.xlsx — columns AF (sector) and AG (subsector), one row per stock.
 *   2. Each *_vf.xlsx — cells F5 (sector) and G5 (subsector).
 *
 * Hard scope guard: PATCHes only ever touch AF/AG on JVB Output and F5/G5 on vF files.
 *
 * Usage:
 *   npx tsx scripts/update-sectors-in-excel.ts                         # dry-run (default)
 *   npx tsx scripts/update-sectors-in-excel.ts --apply                 # mutate
 *   npx tsx scripts/update-sectors-in-excel.ts --backup --apply        # snapshot first, then mutate
 *   npx tsx scripts/update-sectors-in-excel.ts --apply --continue-on-error
 *
 * Env vars required: AZURE_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 *                    GRAPH_DRIVE_ID (or default), GRAPH_OCTOPUS_ITEM_ID (or default),
 *                    GRAPH_VF_FOLDER_PATH (or default), GRAPH_VF_FOLDER_ID (fallback).
 */

import * as fs from "fs";
import * as path from "path";

// ── Inline .env.local loader (no dotenv dependency) ───────────────────────────
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnvLocal();

// ── Env (mirror sync-to-supabase.ts) ──────────────────────────────────────────
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const GRAPH_CLIENT_ID = process.env.GRAPH_CLIENT_ID;
const GRAPH_CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const DRIVE_ID = process.env.GRAPH_DRIVE_ID || "b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH";
const OCTOPUS_ITEM_ID = process.env.GRAPH_OCTOPUS_ITEM_ID || "01XUUXNQ72HPRIFGFYLVGID3Y3UPXXUV4H";
const SHEET_NAME = "JVB Output";
const VF_FOLDER_PATH = process.env.GRAPH_VF_FOLDER_PATH || "Tusk Equity/Portfolio Stock Valuations - Bull Base Bear (Tusk Prop)";
const VF_FOLDER_ID_FALLBACK = process.env.GRAPH_VF_FOLDER_ID || "01XUUXNQYRQ7B5PBRKMZGLUVNKA5K5MXY5";

// JVB column indices (0-based): 31 = AF (sector), 32 = AG (subsector), 41 = AP (tikr).
const JVB_COL_TIKR = 41;
const JVB_COL_SECTOR = 31;
const JVB_COL_SUBSECTOR = 32;
const JVB_CELL_SECTOR = "AF"; // letter form for PATCH
const JVB_CELL_SUBSECTOR = "AG";

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const BACKUP = args.has("--backup");
const CONTINUE_ON_ERROR = args.has("--continue-on-error");
const MODE: "dry-run" | "apply" = APPLY ? "apply" : "dry-run";

// ── Classification mapping (loaded from data/sector-mapping.json) ─────────────
// NOTE: TIKR_ALIAS here is a script-only copy; the live-path copies in
//       scripts/sync-to-supabase.ts and app/api/sync/route.ts are kept inline.
//       When changing the alias, update those two files as well.
const _sectorMapping = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "data", "sector-mapping.json"), "utf8")
) as { tikrToSector: Record<string, { sector: string; subsector: string }>; tikrAlias: Record<string, string> };

const TIKR_TO_SECTOR: Record<string, { sector: string; subsector: string }> = _sectorMapping.tikrToSector;

// ── TIKR aliasing ──────────────────────────────────────────────────────────────
const TIKR_ALIAS: Record<string, string> = _sectorMapping.tikrAlias;

// ── Graph helpers (mirror sync-to-supabase.ts) ────────────────────────────────
async function getGraphToken(): Promise<string> {
  if (!AZURE_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error(
      "Missing AZURE_TENANT_ID, GRAPH_CLIENT_ID, or GRAPH_CLIENT_SECRET. " +
      "Run `vercel env pull` (or `vercel env pull .env.local`) in the project root to populate them."
    );
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

async function fetchWithRetry(url: string, opts: RequestInit, label: string, maxAttempts = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        const delay = attempt * 2000;
        console.warn(`[retry] ${attempt}/${maxAttempts} ${label} (${msg}), waiting ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("unreachable");
}

interface VFFile { id: string; name: string; size: number; webUrl: string; }

async function readJVBUsedRange(token: string): Promise<unknown[][]> {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${OCTOPUS_ITEM_ID}/workbook/worksheets('${encodeURIComponent(SHEET_NAME)}')/usedRange(valuesOnly=true)`;
  const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } }, "JVB usedRange");
  const data = await res.json();
  if (data.error) throw new Error(`Graph Excel error (JVB Output): ${data.error.message || JSON.stringify(data.error)}`);
  return (data.values || []) as unknown[][];
}

async function listVFFiles(token: string): Promise<VFFile[]> {
  let url: string | null;
  if (VF_FOLDER_PATH) {
    const encodedPath = encodeURIComponent(VF_FOLDER_PATH);
    const pathUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children?$top=200&$select=id,name,size,file,webUrl`;
    const testRes = await fetch(pathUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (testRes.ok) {
      url = pathUrl;
    } else if (VF_FOLDER_ID_FALLBACK) {
      url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,file,webUrl`;
    } else {
      throw new Error("Could not resolve vF folder");
    }
  } else if (VF_FOLDER_ID_FALLBACK) {
    url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,file,webUrl`;
  } else {
    throw new Error("Could not resolve vF folder");
  }
  const allFiles: VFFile[] = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (data.error) throw new Error(`Graph folder listing error: ${data.error.message}`);
    for (const item of data.value || []) {
      if (!item.file) continue;
      const name = item.name as string;
      if (!name.match(/\.(xlsx|xlsm)$/i)) continue;
      if (name.match(/Todos|Banking Results Tracker|Investment Dashboard|Sing grm|Octopus|updateMaster/i)) continue;
      const excludedStocks = [
        "REC", "Repco Hf", "Sunteck Realty",
        "Union Bank", "Indianbank", "Monarch Networth", "Rpsg Ventures", "Mallcom",
        "Disa India", "Dam Capital", "Patels Airtemp", "Emkay", "Tusk Arihant Model V2",
        "Kpit Tech", "Deepak Fertilizer Financial Model V3", "Elecon Engineering", "Somany Ceramics V1",
      ];
      if (excludedStocks.some((ex) => name.toLowerCase().includes(ex.toLowerCase()))) continue;
      if ((item.size || 0) > 40 * 1024 * 1024) continue;
      allFiles.push({ id: item.id, name, size: item.size || 0, webUrl: item.webUrl || "" });
    }
    url = data["@odata.nextLink"] || null;
  }
  return deduplicateVFFiles(allFiles);
}

function deduplicateVFFiles(files: VFFile[]): VFFile[] {
  const stockMap = new Map<string, VFFile>();
  for (const f of files) {
    const match = f.name.match(/^\d{6,8}[_ ]?(.+?)(?:[_ ]?[vV][fF]\d?)?\.xls[xm]$/i);
    const key = match ? match[1].trim().toLowerCase() : f.name.replace(/[_ ]?[vV][fF]\d?\.xls[xm]$/i, "").trim().toLowerCase();
    if (!stockMap.has(key) || f.name > stockMap.get(key)!.name) stockMap.set(key, f);
  }
  return Array.from(stockMap.values());
}

interface VFCells { tikr: string; sector: string; subsector: string; summarySheet: string; }

async function readVFCells(token: string, file: VFFile): Promise<VFCells | null> {
  const baseUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/workbook`;
  const sheetsRes = await fetchWithRetry(`${baseUrl}/worksheets?$select=name`, { headers: { Authorization: `Bearer ${token}` } }, file.name);
  if (!sheetsRes.ok) return null;
  const sheetsData = await sheetsRes.json();
  if (sheetsData.error) return null;
  const summarySheet = ((sheetsData.value || []) as { name: string }[])
    .map((s) => s.name)
    .find((name) => name.toLowerCase().replace(/\s+/g, " ").trim() === "tusk - summary");
  if (!summarySheet) return null;

  const rangeUrl = `${baseUrl}/worksheets('${encodeURIComponent(summarySheet)}')/range(address='B2:G5')?$select=values`;
  const rangeRes = await fetchWithRetry(rangeUrl, { headers: { Authorization: `Bearer ${token}` } }, file.name);
  if (!rangeRes.ok) return null;
  const rangeData = await rangeRes.json();
  if (rangeData.error) return null;

  const values: unknown[][] = rangeData.values || [];
  // B2:G5 → row 0=B2..G2, row 3=B5..G5
  const tikrRaw = values[0]?.[0];
  const sectorRaw = values[3]?.[4]; // F5 is column index 4 within B..G (B=0,C=1,D=2,E=3,F=4,G=5)
  const subsectorRaw = values[3]?.[5];
  const tikr = (tikrRaw === null || tikrRaw === undefined || tikrRaw === "") ? "" : String(tikrRaw).trim();
  const sector = (sectorRaw === null || sectorRaw === undefined || sectorRaw === "" || sectorRaw === 0 || sectorRaw === "0") ? "" : String(sectorRaw).trim();
  const subsector = (subsectorRaw === null || subsectorRaw === undefined || subsectorRaw === "" || subsectorRaw === 0 || subsectorRaw === "0") ? "" : String(subsectorRaw).trim();

  return { tikr, sector, subsector, summarySheet };
}

// ── Resolution: vF TIKR → baseline TIKR (alias + fuzzy) ───────────────────────
function resolveTikrToBaseline(vfTikr: string): string | null {
  if (!vfTikr) return null;

  // 1. Direct match
  if (TIKR_TO_SECTOR[vfTikr]) return vfTikr;

  // 2. Alias (case-sensitive key)
  if (TIKR_ALIAS[vfTikr]) return TIKR_ALIAS[vfTikr];

  // 3. Alias with uppercase key
  const upper = vfTikr.toUpperCase();
  if (TIKR_ALIAS[upper]) return TIKR_ALIAS[upper];

  // 4. Case-insensitive direct match against baseline keys
  const baselineKeys = Object.keys(TIKR_TO_SECTOR);
  const lc = vfTikr.toLowerCase();
  for (const k of baselineKeys) {
    if (k.toLowerCase() === lc) return k;
  }

  // 5. Fuzzy substring match (mirror sync-to-supabase.ts:678-687)
  for (const jt of baselineKeys) {
    const shorter = Math.min(vfTikr.length, jt.length);
    const longer = Math.max(vfTikr.length, jt.length);
    const vfL = vfTikr.toLowerCase();
    const jtL = jt.toLowerCase();
    if ((vfL.includes(jtL) || jtL.includes(vfL)) && shorter / longer >= 0.5) return jt;
  }

  return null;
}

// ── PATCH writer with hard scope guard ────────────────────────────────────────
async function patchCell(
  token: string,
  itemId: string,
  sheetName: string,
  cellAddr: string,
  newValue: string,
  context: "JVB" | "vF"
): Promise<void> {
  // SCOPE GUARD: refuse to touch any cell outside the sanctioned set.
  const allowed =
    (context === "JVB" && /^A[FG]\d+$/.test(cellAddr)) ||
    (context === "vF" && /^[FG]5$/.test(cellAddr));
  if (!allowed) {
    throw new Error(`SCOPE GUARD: refusing to PATCH ${context} cell ${cellAddr}`);
  }
  if (!APPLY) return; // dry-run: don't fire

  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${cellAddr}')`;
  const res = await fetchWithRetry(
    url,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [[newValue]] }),
    },
    `PATCH ${cellAddr}`
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} PATCH ${cellAddr}: ${txt.slice(0, 200)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface ChangeRecord { source: "JVB" | "vF"; tikr: string; file?: string; cell: string; field: "sector" | "subsector"; oldValue: string; newValue: string; status: "queued" | "applied" | "skipped" | "error"; error?: string; }
interface SkipRecord { source: "JVB" | "vF"; tikr: string; file?: string; reason: string; }

async function main() {
  console.log(`[update-sectors] Mode: ${MODE.toUpperCase()}${BACKUP ? " + backup" : ""}${CONTINUE_ON_ERROR ? " + continue-on-error" : ""}`);
  console.log(`[update-sectors] Mapping has ${Object.keys(TIKR_TO_SECTOR).length} TIKRs`);

  const token = await getGraphToken();
  console.log(`[update-sectors] Got Graph token`);

  const changes: ChangeRecord[] = [];
  const skipped: SkipRecord[] = [];
  const errors: { source: string; tikr: string; file?: string; detail: string }[] = [];

  // ── Backup snapshot ──
  const backup: { ranAt: string; jvb: { rowOffset: number; values: unknown[][] }; vf: { file: string; tikr: string; sector: string; subsector: string }[] } = {
    ranAt: new Date().toISOString(),
    jvb: { rowOffset: 0, values: [] },
    vf: [],
  };

  // ── JVB Output pass ──
  console.log(`[update-sectors] Reading JVB Output usedRange...`);
  const jvbRows = await readJVBUsedRange(token);
  console.log(`[update-sectors] JVB usedRange: ${jvbRows.length} rows`);

  if (BACKUP) backup.jvb.values = jvbRows;

  for (let r = 1; r < jvbRows.length; r++) {
    const row = jvbRows[r];
    const tikrRaw = row[JVB_COL_TIKR];
    if (!tikrRaw || typeof tikrRaw !== "string" || !tikrRaw.trim()) continue;
    const tikr = tikrRaw.trim();
    const proposed = TIKR_TO_SECTOR[tikr];
    if (!proposed) {
      skipped.push({ source: "JVB", tikr, reason: "not in TIKR_TO_SECTOR map" });
      continue;
    }
    const currentSector = String(row[JVB_COL_SECTOR] ?? "").trim();
    const currentSubsector = String(row[JVB_COL_SUBSECTOR] ?? "").trim();
    const excelRow = r + 1; // usedRange row 0 → Excel row 1

    if (currentSector !== proposed.sector) {
      changes.push({
        source: "JVB",
        tikr,
        cell: `${JVB_CELL_SECTOR}${excelRow}`,
        field: "sector",
        oldValue: currentSector,
        newValue: proposed.sector,
        status: "queued",
      });
    }
    if (currentSubsector !== proposed.subsector) {
      changes.push({
        source: "JVB",
        tikr,
        cell: `${JVB_CELL_SUBSECTOR}${excelRow}`,
        field: "subsector",
        oldValue: currentSubsector,
        newValue: proposed.subsector,
        status: "queued",
      });
    }
  }

  // ── vF files pass ──
  console.log(`[update-sectors] Listing vF files...`);
  const vfFiles = await listVFFiles(token);
  console.log(`[update-sectors] Found ${vfFiles.length} vF files`);

  for (const file of vfFiles) {
    let cells: VFCells | null;
    try {
      cells = await readVFCells(token, file);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[update-sectors] Read failed for ${file.name}: ${detail}`);
      errors.push({ source: "vF", tikr: "?", file: file.name, detail });
      if (!CONTINUE_ON_ERROR) throw err;
      continue;
    }
    if (!cells) {
      skipped.push({ source: "vF", tikr: "?", file: file.name, reason: "no Tusk - Summary sheet or read error" });
      continue;
    }
    if (BACKUP) backup.vf.push({ file: file.name, tikr: cells.tikr, sector: cells.sector, subsector: cells.subsector });

    if (!cells.tikr) {
      skipped.push({ source: "vF", tikr: "", file: file.name, reason: "B2 empty (no TIKR)" });
      continue;
    }
    const baselineTikr = resolveTikrToBaseline(cells.tikr);
    if (!baselineTikr) {
      skipped.push({ source: "vF", tikr: cells.tikr, file: file.name, reason: "TIKR not in mapping (alias + fuzzy match failed)" });
      continue;
    }
    const proposed = TIKR_TO_SECTOR[baselineTikr];
    if (!proposed) {
      skipped.push({ source: "vF", tikr: baselineTikr, file: file.name, reason: "resolved baseline TIKR not in mapping (should never happen)" });
      continue;
    }

    if (cells.sector !== proposed.sector) {
      changes.push({
        source: "vF",
        tikr: baselineTikr,
        file: file.name,
        cell: "F5",
        field: "sector",
        oldValue: cells.sector,
        newValue: proposed.sector,
        status: "queued",
      });
    }
    if (cells.subsector !== proposed.subsector) {
      changes.push({
        source: "vF",
        tikr: baselineTikr,
        file: file.name,
        cell: "G5",
        field: "subsector",
        oldValue: cells.subsector,
        newValue: proposed.subsector,
        status: "queued",
      });
    }
  }

  // ── Print queued changes ──
  console.log(`\n[update-sectors] ${changes.length} change(s) queued, ${skipped.length} skip(s)`);
  for (const c of changes) {
    const tag = c.source === "JVB" ? "JVB" : `vF ${c.file}`;
    console.log(`  [${MODE}] ${tag}  ${c.tikr}  ${c.cell} (${c.field})  "${c.oldValue}" -> "${c.newValue}"`);
  }

  // ── Backup file ──
  const dataDir = path.resolve(__dirname, "..", "data");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  if (BACKUP) {
    const backupPath = path.join(dataDir, `sector-update-backup-${ts}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`[update-sectors] Backup written to ${backupPath}`);
  }

  // ── Apply ──
  if (APPLY) {
    console.log(`\n[update-sectors] Applying ${changes.length} change(s)...`);
    for (const c of changes) {
      try {
        if (c.source === "JVB") {
          await patchCell(token, OCTOPUS_ITEM_ID, SHEET_NAME, c.cell, c.newValue, "JVB");
        } else {
          // Find vF file id and summary sheet name
          const file = vfFiles.find((f) => f.name === c.file);
          if (!file) throw new Error(`vF file not found in listing: ${c.file}`);
          // Re-resolve summary sheet name (could cache, but simpler to re-read)
          const cells = await readVFCells(token, file);
          if (!cells) throw new Error(`vF read failed at apply time: ${c.file}`);
          await patchCell(token, file.id, cells.summarySheet, c.cell, c.newValue, "vF");
        }
        c.status = "applied";
        console.log(`  [applied] ${c.source} ${c.tikr} ${c.cell}`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        c.status = "error";
        c.error = detail;
        errors.push({ source: c.source, tikr: c.tikr, file: c.file, detail });
        console.error(`  [error]   ${c.source} ${c.tikr} ${c.cell}: ${detail}`);
        if (!CONTINUE_ON_ERROR) {
          console.error(`[update-sectors] Aborting on first error (use --continue-on-error to override)`);
          break;
        }
      }
    }
  }

  // ── Report ──
  const reportPath = path.join(dataDir, "sector-update-report.json");
  const report = {
    ranAt: new Date().toISOString(),
    mode: MODE,
    backupTaken: BACKUP,
    jvbChanges: changes.filter((c) => c.source === "JVB"),
    vfChanges: changes.filter((c) => c.source === "vF"),
    skipped,
    errors,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n[update-sectors] Report written to ${reportPath}`);

  const applied = changes.filter((c) => c.status === "applied").length;
  const queued = changes.filter((c) => c.status === "queued").length;
  const erroredCount = changes.filter((c) => c.status === "error").length;
  console.log(`[update-sectors] Summary: ${applied} applied, ${queued} queued (dry-run), ${erroredCount} errored, ${skipped.length} skipped`);

  if (erroredCount > 0 && !CONTINUE_ON_ERROR) process.exit(1);
}

main().catch((err) => {
  console.error(`[update-sectors] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
