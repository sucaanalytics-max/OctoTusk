#!/usr/bin/env npx tsx
/**
 * Read-only live sector/subsector audit.
 *
 * Reads live JVB Output + every vF file via Microsoft Graph, compares both
 * against data/sector-mapping.json, and reports every discrepancy class:
 *
 *   a. JVB rows where AF/AG mismatches the canonical map
 *   b. JVB rows with empty sector or subsector
 *   c. JVB rows whose TIKR is not in the canonical map (uncovered)
 *   d. vF files where F5/G5 mismatches the canonical map
 *   e. vF files whose TIKR cannot be resolved to a canonical TIKR
 *   f. Same-stock JVB ↔ vF disagreement (AF/AG vs F5/G5 differ)
 *   g. Canonical-map entries not present in either live JVB or live vF
 *
 * Writes:
 *   data/sector-rescan-report.json   — full machine-readable diff
 *   data/sector-classification.csv  — regenerated from LIVE values
 *
 * Exit code 0 = no discrepancies; 1 = discrepancies found.
 *
 * Usage:
 *   npx tsx scripts/rescan-sectors.ts
 */

import * as fs from "fs";
import * as path from "path";

// ── Env loader ────────────────────────────────────────────────────────────────
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

// ── Config ────────────────────────────────────────────────────────────────────
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const GRAPH_CLIENT_ID = process.env.GRAPH_CLIENT_ID;
const GRAPH_CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const DRIVE_ID = process.env.GRAPH_DRIVE_ID || "b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH";
const OCTOPUS_ITEM_ID = process.env.GRAPH_OCTOPUS_ITEM_ID || "01XUUXNQ72HPRIFGFYLVGID3Y3UPXXUV4H";
const SHEET_NAME = "JVB Output";
const VF_FOLDER_PATH = process.env.GRAPH_VF_FOLDER_PATH || "Tusk Equity/Portfolio Stock Valuations - Bull Base Bear (Tusk Prop)";
const VF_FOLDER_ID_FALLBACK = process.env.GRAPH_VF_FOLDER_ID || "01XUUXNQYRQ7B5PBRKMZGLUVNKA5K5MXY5";

const JVB_COL_TIKR = 41;
const JVB_COL_OFFICIAL_NAME = 1;
const JVB_COL_SECTOR = 31;
const JVB_COL_SUBSECTOR = 32;

// ── Load canonical mapping ────────────────────────────────────────────────────
interface SectorMapping {
  tikrToSector: Record<string, { sector: string; subsector: string }>;
  tikrAlias: Record<string, string>;
  sectorOrder: string[];
  substantiveNotes: Record<string, string>;
}
const mappingPath = path.resolve(__dirname, "..", "data", "sector-mapping.json");
const MAPPING = JSON.parse(fs.readFileSync(mappingPath, "utf8")) as SectorMapping;
const TIKR_TO_SECTOR = MAPPING.tikrToSector;
const TIKR_ALIAS = MAPPING.tikrAlias;
const SECTOR_ORDER: Record<string, number> = Object.fromEntries(MAPPING.sectorOrder.map((s, i) => [s, i + 1]));

// ── Graph helpers ─────────────────────────────────────────────────────────────
async function getGraphToken(): Promise<string> {
  if (!AZURE_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error(
      "Missing AZURE_TENANT_ID, GRAPH_CLIENT_ID, or GRAPH_CLIENT_SECRET. " +
      "Run `vercel env pull .env.local` in the project root."
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

// ── JVB reader ────────────────────────────────────────────────────────────────
interface JvbStock {
  tikr: string;
  officialName: string;
  sector: string;
  subsector: string;
  rowNum: number;
}

async function readJVBStocks(token: string): Promise<JvbStock[]> {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${OCTOPUS_ITEM_ID}/workbook/worksheets('${encodeURIComponent(SHEET_NAME)}')/usedRange(valuesOnly=true)`;
  const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } }, "JVB usedRange");
  const data = await res.json();
  if (data.error) throw new Error(`Graph JVB error: ${data.error.message || JSON.stringify(data.error)}`);
  const rows = (data.values || []) as unknown[][];
  console.log(`[rescan] JVB usedRange: ${rows.length} rows`);
  const stocks: JvbStock[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const tikrRaw = row[JVB_COL_TIKR];
    if (!tikrRaw || typeof tikrRaw !== "string" || !tikrRaw.trim()) continue;
    stocks.push({
      tikr: tikrRaw.trim(),
      officialName: String(row[JVB_COL_OFFICIAL_NAME] ?? "").trim(),
      sector: String(row[JVB_COL_SECTOR] ?? "").trim(),
      subsector: String(row[JVB_COL_SUBSECTOR] ?? "").trim(),
      rowNum: r + 1,
    });
  }
  return stocks;
}

// ── vF file listing ───────────────────────────────────────────────────────────
interface VFFile { id: string; name: string; size: number; webUrl: string; }

async function listVFFiles(token: string): Promise<VFFile[]> {
  let url: string | null;
  if (VF_FOLDER_PATH) {
    const encodedPath = encodeURIComponent(VF_FOLDER_PATH);
    const pathUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children?$top=200&$select=id,name,size,file,webUrl`;
    const testRes = await fetch(pathUrl, { headers: { Authorization: `Bearer ${token}` } });
    url = testRes.ok ? pathUrl
      : VF_FOLDER_ID_FALLBACK
        ? `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,file,webUrl`
        : null;
  } else if (VF_FOLDER_ID_FALLBACK) {
    url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,file,webUrl`;
  } else {
    throw new Error("Could not resolve vF folder — set GRAPH_VF_FOLDER_PATH or GRAPH_VF_FOLDER_ID");
  }
  if (!url) throw new Error("Could not resolve vF folder");

  const allFiles: VFFile[] = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (data.error) throw new Error(`Graph folder error: ${data.error.message}`);
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
    const key = match
      ? match[1].trim().toLowerCase()
      : f.name.replace(/[_ ]?[vV][fF]\d?\.xls[xm]$/i, "").trim().toLowerCase();
    if (!stockMap.has(key) || f.name > stockMap.get(key)!.name) stockMap.set(key, f);
  }
  return Array.from(stockMap.values());
}

// ── vF cell reader ────────────────────────────────────────────────────────────
interface VFCells { tikr: string; sector: string; subsector: string; summarySheet: string; }

async function readVFCells(token: string, file: VFFile): Promise<VFCells | null> {
  const baseUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/workbook`;
  const sheetsRes = await fetchWithRetry(
    `${baseUrl}/worksheets?$select=name`,
    { headers: { Authorization: `Bearer ${token}` } },
    file.name
  );
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
  const tikrRaw = values[0]?.[0];
  const sectorRaw = values[3]?.[4]; // F5 is col index 4 within B..G
  const subsectorRaw = values[3]?.[5];
  const coerce = (v: unknown) =>
    v === null || v === undefined || v === "" || v === 0 || v === "0" ? "" : String(v).trim();
  return {
    tikr: coerce(tikrRaw),
    sector: coerce(sectorRaw),
    subsector: coerce(subsectorRaw),
    summarySheet,
  };
}

// ── TIKR resolver: vF TIKR → canonical TIKR in TIKR_TO_SECTOR ────────────────
function resolveToCanonical(vfTikr: string): string | null {
  if (!vfTikr) return null;
  if (TIKR_TO_SECTOR[vfTikr]) return vfTikr;
  if (TIKR_ALIAS[vfTikr]) return TIKR_ALIAS[vfTikr];
  const upper = vfTikr.toUpperCase();
  if (TIKR_ALIAS[upper]) return TIKR_ALIAS[upper];
  const lc = vfTikr.toLowerCase();
  for (const k of Object.keys(TIKR_TO_SECTOR)) {
    if (k.toLowerCase() === lc) return k;
  }
  for (const k of Object.keys(TIKR_TO_SECTOR)) {
    const shorter = Math.min(vfTikr.length, k.length);
    const longer = Math.max(vfTikr.length, k.length);
    if ((lc.includes(k.toLowerCase()) || k.toLowerCase().includes(lc)) && shorter / longer >= 0.5) return k;
  }
  return null;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
function csvField(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("[rescan] Starting live sector/subsector audit...");
  console.log(`[rescan] Mapping: ${Object.keys(TIKR_TO_SECTOR).length} canonical TIKRs, ${Object.keys(TIKR_ALIAS).length} aliases`);

  const token = await getGraphToken();
  console.log("[rescan] Got Graph token");

  // ── 1. Read JVB ──
  const jvbStocks = await readJVBStocks(token);
  console.log(`[rescan] JVB stocks with non-empty TIKR: ${jvbStocks.length}`);
  const jvbByTikr = new Map<string, JvbStock>(jvbStocks.map((s) => [s.tikr, s]));

  // ── 2. Read vF files ──
  console.log("[rescan] Listing vF files...");
  const vfFiles = await listVFFiles(token);
  console.log(`[rescan] vF files (deduped): ${vfFiles.length}`);

  interface VFResult {
    file: VFFile;
    cells: VFCells | null;
    canonicalTikr: string | null;
    readError?: string;
  }
  const vfResults: VFResult[] = [];

  // Process vF files with concurrency=3 (mirror sync-to-supabase.ts)
  const CONCURRENCY = 3;
  for (let i = 0; i < vfFiles.length; i += CONCURRENCY) {
    const batch = vfFiles.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (file) => {
        try {
          const cells = await readVFCells(token, file);
          const canonicalTikr = cells?.tikr ? resolveToCanonical(cells.tikr) : null;
          return { file, cells, canonicalTikr };
        } catch (err) {
          return { file, cells: null, canonicalTikr: null, readError: err instanceof Error ? err.message : String(err) };
        }
      })
    );
    for (const r of settled) {
      vfResults.push(r.status === "fulfilled" ? r.value : { file: batch[settled.indexOf(r)], cells: null, canonicalTikr: null, readError: "settled rejected" });
    }
    if (i + CONCURRENCY < vfFiles.length) process.stdout.write(".");
  }
  console.log(`\n[rescan] vF read complete`);

  // ── Build discrepancy categories ──
  type JvbMismatch = { tikr: string; officialName: string; rowNum: number; field: "sector" | "subsector" | "both"; currentSector: string; currentSubsector: string; expectedSector: string; expectedSubsector: string; };
  type JvbEmpty   = { tikr: string; officialName: string; rowNum: number; emptySector: boolean; emptySubsector: boolean; };
  type JvbUncovered = { tikr: string; officialName: string; rowNum: number; currentSector: string; currentSubsector: string; };
  type VfMismatch  = { canonicalTikr: string; file: string; field: "sector" | "subsector" | "both"; currentSector: string; currentSubsector: string; expectedSector: string; expectedSubsector: string; };
  type VfUnresolved = { file: string; rawTikr: string; };
  type JvbVfDisagreement = { tikr: string; officialName: string; jvbSector: string; jvbSubsector: string; vfSector: string; vfSubsector: string; file: string; disagreements: string[]; };
  type StaleEntry = { tikr: string; expectedSector: string; expectedSubsector: string; };

  const catA: JvbMismatch[] = [];
  const catB: JvbEmpty[] = [];
  const catC: JvbUncovered[] = [];

  for (const s of jvbStocks) {
    const proposed = TIKR_TO_SECTOR[s.tikr];
    if (!proposed) {
      catC.push({ tikr: s.tikr, officialName: s.officialName, rowNum: s.rowNum, currentSector: s.sector, currentSubsector: s.subsector });
      continue;
    }
    const secMatch = s.sector === proposed.sector;
    const subMatch = s.subsector === proposed.subsector;
    if (!secMatch || !subMatch) {
      catA.push({
        tikr: s.tikr, officialName: s.officialName, rowNum: s.rowNum,
        field: !secMatch && !subMatch ? "both" : !secMatch ? "sector" : "subsector",
        currentSector: s.sector, currentSubsector: s.subsector,
        expectedSector: proposed.sector, expectedSubsector: proposed.subsector,
      });
    }
    if (!s.sector || !s.subsector) {
      catB.push({ tikr: s.tikr, officialName: s.officialName, rowNum: s.rowNum, emptySector: !s.sector, emptySubsector: !s.subsector });
    }
  }

  const catD: VfMismatch[] = [];
  const catE: VfUnresolved[] = [];
  const seenVfTikrs = new Set<string>();

  for (const r of vfResults) {
    if (r.readError || !r.cells) continue;
    if (!r.cells.tikr) continue;
    if (!r.canonicalTikr) {
      catE.push({ file: r.file.name, rawTikr: r.cells.tikr });
      continue;
    }
    seenVfTikrs.add(r.canonicalTikr);
    const proposed = TIKR_TO_SECTOR[r.canonicalTikr];
    if (!proposed) continue;
    const secMatch = r.cells.sector === proposed.sector;
    const subMatch = r.cells.subsector === proposed.subsector;
    if (!secMatch || !subMatch) {
      catD.push({
        canonicalTikr: r.canonicalTikr, file: r.file.name,
        field: !secMatch && !subMatch ? "both" : !secMatch ? "sector" : "subsector",
        currentSector: r.cells.sector, currentSubsector: r.cells.subsector,
        expectedSector: proposed.sector, expectedSubsector: proposed.subsector,
      });
    }
  }

  const catF: JvbVfDisagreement[] = [];
  const jvbTikrSet = new Set(jvbStocks.map((s) => s.tikr));
  for (const r of vfResults) {
    if (!r.cells?.tikr || !r.canonicalTikr) continue;
    const jvb = jvbByTikr.get(r.canonicalTikr);
    if (!jvb) continue;
    const disagreements: string[] = [];
    if (jvb.sector !== r.cells.sector && r.cells.sector !== "") disagreements.push(`sector: JVB="${jvb.sector}" vs vF="${r.cells.sector}"`);
    if (jvb.subsector !== r.cells.subsector && r.cells.subsector !== "") disagreements.push(`subsector: JVB="${jvb.subsector}" vs vF="${r.cells.subsector}"`);
    if (disagreements.length > 0) {
      catF.push({
        tikr: r.canonicalTikr, officialName: jvb.officialName,
        jvbSector: jvb.sector, jvbSubsector: jvb.subsector,
        vfSector: r.cells.sector, vfSubsector: r.cells.subsector,
        file: r.file.name, disagreements,
      });
    }
  }

  const catG: StaleEntry[] = [];
  for (const [tikr, props] of Object.entries(TIKR_TO_SECTOR)) {
    if (!jvbTikrSet.has(tikr) && !seenVfTikrs.has(tikr)) {
      // Check aliases: maybe the JVB has the alias key
      const aliasValues = Object.values(TIKR_ALIAS);
      const aliasKeys = Object.keys(TIKR_ALIAS);
      const aliasKey = aliasKeys.find((k) => TIKR_ALIAS[k] === tikr);
      const inJvbViaAlias = aliasKey ? jvbTikrSet.has(aliasKey) : false;
      const inVfViaAlias = aliasKey ? seenVfTikrs.has(aliasKey) : false;
      if (!inJvbViaAlias && !inVfViaAlias) {
        catG.push({ tikr, expectedSector: props.sector, expectedSubsector: props.subsector });
      }
    }
  }

  // ── Print summary ──
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║            SECTOR / SUBSECTOR RESCAN REPORT                 ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  JVB stocks read:         ${jvbStocks.length}`);
  console.log(`  vF files read:           ${vfFiles.length}`);
  console.log(`  Canonical map entries:   ${Object.keys(TIKR_TO_SECTOR).length}`);
  console.log("");
  console.log(`  a. JVB mismatch vs map:  ${catA.length}`);
  console.log(`  b. JVB empty sector/sub: ${catB.length}`);
  console.log(`  c. JVB uncovered TIKRs:  ${catC.length}  ← REQUIRES HUMAN CLASSIFICATION`);
  console.log(`  d. vF mismatch vs map:   ${catD.length}`);
  console.log(`  e. vF unresolved TIKRs:  ${catE.length}  ← REQUIRES HUMAN CLASSIFICATION`);
  console.log(`  f. JVB ↔ vF disagreement:${catF.length}  ← vF will override JVB on next sync`);
  console.log(`  g. Stale map entries:    ${catG.length}  ← not in JVB or vF any more`);
  console.log("");

  const printTop = <T>(label: string, items: T[], fmt: (x: T) => string, max = 20) => {
    if (items.length === 0) { console.log(`  ✓ ${label}: none`); return; }
    console.log(`  ✗ ${label} (${items.length} total, showing ${Math.min(items.length, max)}):`);
    for (const item of items.slice(0, max)) console.log(`      ${fmt(item)}`);
    if (items.length > max) console.log(`      … and ${items.length - max} more (see report JSON)`);
  };

  printTop("a. JVB mismatches", catA, (x) =>
    `Row ${x.rowNum} ${x.tikr}: ${x.field} — cur="${x.currentSector}/${x.currentSubsector}" exp="${x.expectedSector}/${x.expectedSubsector}"`);
  console.log("");
  printTop("b. JVB empty cells", catB, (x) =>
    `Row ${x.rowNum} ${x.tikr} "${x.officialName}": empty ${[x.emptySector ? "sector" : "", x.emptySubsector ? "subsector" : ""].filter(Boolean).join("+")}`);
  console.log("");
  printTop("c. JVB uncovered", catC, (x) =>
    `Row ${x.rowNum} ${x.tikr} "${x.officialName}" (cur: "${x.currentSector}/${x.currentSubsector}") — ADD TO data/sector-mapping.json`);
  console.log("");
  printTop("d. vF mismatches", catD, (x) =>
    `${x.canonicalTikr} (${x.file}): ${x.field} — cur="${x.currentSector}/${x.currentSubsector}" exp="${x.expectedSector}/${x.expectedSubsector}"`);
  console.log("");
  printTop("e. vF unresolved", catE, (x) =>
    `${x.file}: rawTIKR="${x.rawTikr}" — ADD ALIAS TO data/sector-mapping.json or update B2`);
  console.log("");
  printTop("f. JVB ↔ vF disagree", catF, (x) =>
    `${x.tikr} (${x.file}): ${x.disagreements.join("; ")}`);
  console.log("");
  printTop("g. Stale map entries", catG, (x) =>
    `${x.tikr} (${x.expectedSector} / ${x.expectedSubsector}) — not in live JVB or vF`);
  console.log("");

  // ── Write report JSON ──
  const dataDir = path.resolve(__dirname, "..", "data");
  const reportPath = path.join(dataDir, "sector-rescan-report.json");
  const report = {
    ranAt: new Date().toISOString(),
    summary: {
      jvbCount: jvbStocks.length,
      vfCount: vfFiles.length,
      mappingCount: Object.keys(TIKR_TO_SECTOR).length,
      a_jvbMismatches: catA.length,
      b_jvbEmpty: catB.length,
      c_jvbUncovered: catC.length,
      d_vfMismatches: catD.length,
      e_vfUnresolved: catE.length,
      f_jvbVfDisagreement: catF.length,
      g_staleMapEntries: catG.length,
    },
    a_jvbMismatches: catA,
    b_jvbEmpty: catB,
    c_jvbUncovered: catC,
    d_vfMismatches: catD,
    e_vfUnresolved: catE,
    f_jvbVfDisagreement: catF,
    g_staleMapEntries: catG,
    vfReadErrors: vfResults.filter((r) => r.readError).map((r) => ({ file: r.file.name, error: r.readError })),
    vfNoSummarySheet: vfResults.filter((r) => !r.readError && !r.cells).map((r) => r.file.name),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[rescan] Report written: ${reportPath}`);

  // ── Regenerate sector-classification.csv from LIVE JVB values ──
  interface CsvRow { tikr: string; official: string; curSec: string; curSub: string; newSec: string; newSub: string; sectorChanged: string; subsectorChanged: string; status: string; notes: string; }
  const csvRows: CsvRow[] = [];
  for (const s of jvbStocks) {
    const proposed = TIKR_TO_SECTOR[s.tikr];
    if (!proposed) {
      csvRows.push({ tikr: s.tikr, official: s.officialName, curSec: s.sector, curSub: s.subsector, newSec: "", newSub: "", sectorChanged: "", subsectorChanged: "", status: "UNCOVERED", notes: "Not in canonical mapping — classify before applying" });
      continue;
    }
    const sectorChanged = s.sector !== proposed.sector;
    const subsectorChanged = s.subsector !== proposed.subsector;
    const anyChange = sectorChanged || subsectorChanged;
    const note = MAPPING.substantiveNotes[s.tikr] || "";
    csvRows.push({
      tikr: s.tikr, official: s.officialName,
      curSec: s.sector, curSub: s.subsector,
      newSec: proposed.sector, newSub: proposed.subsector,
      sectorChanged: sectorChanged ? "Y" : "",
      subsectorChanged: subsectorChanged ? "Y" : "",
      status: anyChange ? (note ? "CORRECTION" : "rename") : "no-change",
      notes: note,
    });
  }
  csvRows.sort((a, b) => {
    const sa = SECTOR_ORDER[a.newSec] ?? 99;
    const sb = SECTOR_ORDER[b.newSec] ?? 99;
    if (sa !== sb) return sa - sb;
    const statusOrder: Record<string, number> = { CORRECTION: 0, rename: 1, "no-change": 2, UNCOVERED: 3 };
    const sta = statusOrder[a.status] ?? 9;
    const stb = statusOrder[b.status] ?? 9;
    if (sta !== stb) return sta - stb;
    return a.tikr.localeCompare(b.tikr);
  });
  const csvHeader = ["TIKR", "Official Name", "Current Sector (JVB live)", "Current Subsector (JVB live)", "New Sector (F5)", "New Subsector (G5)", "Sector Changed", "Subsector Changed", "Status", "Notes"];
  const csvLines = [csvHeader.map(csvField).join(",")];
  for (const r of csvRows) {
    csvLines.push([r.tikr, r.official, r.curSec, r.curSub, r.newSec, r.newSub, r.sectorChanged, r.subsectorChanged, r.status, r.notes].map(csvField).join(","));
  }
  const csvPath = path.join(dataDir, "sector-classification.csv");
  fs.writeFileSync(csvPath, csvLines.join("\n") + "\n");
  console.log(`[rescan] Regenerated CSV: ${csvPath} (${csvRows.length} rows from live JVB)`);

  const totalDiscrepancies = catA.length + catB.length + catC.length + catD.length + catE.length + catF.length + catG.length;
  console.log(`\n[rescan] Done. ${totalDiscrepancies} total discrepancy item(s).`);
  if (totalDiscrepancies > 0) {
    console.log("[rescan] Next steps:");
    if (catC.length > 0 || catE.length > 0) {
      console.log("  1. Classify uncovered TIKRs in data/sector-mapping.json (categories c/e above)");
    }
    if (catG.length > 0) {
      console.log(`  2. Prune ${catG.length} stale entry/entries from data/sector-mapping.json (category g)`);
    }
    if (catA.length > 0 || catD.length > 0 || catF.length > 0) {
      console.log("  3. Apply corrections: npx tsx scripts/update-sectors-in-excel.ts --backup --apply");
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[rescan] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
