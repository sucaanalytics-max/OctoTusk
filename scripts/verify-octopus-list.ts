#!/usr/bin/env npx tsx
/**
 * Read-only verifier: reads live JVB Output + vF folder via Graph,
 * compares against data/database.json + the §3 classification mapping,
 * and prints any discrepancies (added, missing, unclassified).
 *
 * No writes anywhere. Useful when "is X in the octopus?" / "did anything drift?".
 */
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnvLocal();

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

const _sectorMapping = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "data", "sector-mapping.json"), "utf8")
) as { tikrToSector: Record<string, unknown>; tikrAlias: Record<string, string> };
const CLASSIFIED_TIKRS = new Set(Object.keys(_sectorMapping.tikrToSector));

const TIKR_ALIAS: Record<string, string> = _sectorMapping.tikrAlias;

async function getGraphToken(): Promise<string> {
  if (!AZURE_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error("Missing AZURE_TENANT_ID, GRAPH_CLIENT_ID, or GRAPH_CLIENT_SECRET. Run `vercel env pull .env.local`.");
  }
  const res = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Graph token error: ${data.error_description || data.error || "unknown"}`);
  return data.access_token;
}

async function readJVBUsedRange(token: string): Promise<unknown[][]> {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${OCTOPUS_ITEM_ID}/workbook/worksheets('${encodeURIComponent(SHEET_NAME)}')/usedRange(valuesOnly=true)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Graph Excel error: ${data.error.message || JSON.stringify(data.error)}`);
  return (data.values || []) as unknown[][];
}

interface VFFile { id: string; name: string; size: number; }

async function listVFFiles(token: string): Promise<VFFile[]> {
  let url: string | null;
  if (VF_FOLDER_PATH) {
    const encodedPath = encodeURIComponent(VF_FOLDER_PATH);
    const pathUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children?$top=200&$select=id,name,size,file`;
    const testRes = await fetch(pathUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (testRes.ok) {
      url = pathUrl;
    } else if (VF_FOLDER_ID_FALLBACK) {
      url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,file`;
    } else {
      throw new Error("Could not resolve vF folder");
    }
  } else if (VF_FOLDER_ID_FALLBACK) {
    url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,file`;
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
      allFiles.push({ id: item.id, name, size: item.size || 0 });
    }
    url = data["@odata.nextLink"] || null;
  }
  return allFiles;
}

async function main() {
  console.log("[verify] Reading live state from OneDrive + database.json...");
  const token = await getGraphToken();

  const dbPath = path.resolve(__dirname, "..", "data", "database.json");
  const db = JSON.parse(fs.readFileSync(dbPath, "utf8")) as { stocks: { tikr: string; official_name?: string }[] };
  const dbTikrs = new Set(db.stocks.map((s) => s.tikr));

  const jvbRows = await readJVBUsedRange(token);
  console.log(`[verify] JVB usedRange: ${jvbRows.length} rows total`);

  interface JvbStock { tikr: string; officialName: string; sector: string; subsector: string; rowNum: number; }
  const jvbStocks: JvbStock[] = [];
  for (let r = 1; r < jvbRows.length; r++) {
    const row = jvbRows[r];
    const tikrRaw = row[JVB_COL_TIKR];
    if (!tikrRaw || typeof tikrRaw !== "string" || !tikrRaw.trim()) continue;
    jvbStocks.push({
      tikr: tikrRaw.trim(),
      officialName: String(row[JVB_COL_OFFICIAL_NAME] ?? "").trim(),
      sector: String(row[JVB_COL_SECTOR] ?? "").trim(),
      subsector: String(row[JVB_COL_SUBSECTOR] ?? "").trim(),
      rowNum: r + 1,
    });
  }
  const jvbTikrs = new Set(jvbStocks.map((s) => s.tikr));
  console.log(`[verify] JVB stocks (with non-empty TIKR): ${jvbStocks.length}`);
  console.log(`[verify] database.json stocks:               ${dbTikrs.size}`);
  console.log(`[verify] §3 classified mapping:              ${CLASSIFIED_TIKRS.size}`);

  // ── Discrepancy reports ──
  const inJvbNotInDb = jvbStocks.filter((s) => !dbTikrs.has(s.tikr));
  const inDbNotInJvb = Array.from(dbTikrs).filter((t) => !jvbTikrs.has(t));
  const inJvbNotClassified = jvbStocks.filter((s) => !CLASSIFIED_TIKRS.has(s.tikr));

  console.log(`\n=== JVB Output rows NOT in database.json (${inJvbNotInDb.length}) ===`);
  if (inJvbNotInDb.length === 0) console.log("  (none — database.json is up to date with JVB)");
  for (const s of inJvbNotInDb) {
    console.log(`  + Row ${s.rowNum}: TIKR="${s.tikr}" name="${s.officialName}" sector="${s.sector}" subsector="${s.subsector}"`);
  }

  console.log(`\n=== database.json TIKRs NOT in JVB Output (${inDbNotInJvb.length}) ===`);
  if (inDbNotInJvb.length === 0) console.log("  (none)");
  for (const t of inDbNotInJvb) console.log(`  - ${t} (orphan in database.json)`);

  console.log(`\n=== JVB stocks NOT covered by §3 classification (${inJvbNotClassified.length}) ===`);
  if (inJvbNotClassified.length === 0) console.log("  (none — every JVB stock has a proposed sector/subsector)");
  for (const s of inJvbNotClassified) {
    console.log(`  ! Row ${s.rowNum}: TIKR="${s.tikr}" name="${s.officialName}" current="${s.sector}/${s.subsector}"`);
  }

  // ── Search for Angel One specifically ──
  const angelMatches = jvbStocks.filter((s) =>
    /angel/i.test(s.tikr) || /angel/i.test(s.officialName)
  );
  console.log(`\n=== Search: "Angel" in JVB ===`);
  if (angelMatches.length === 0) console.log("  (no rows mention 'angel')");
  for (const s of angelMatches) console.log(`  Row ${s.rowNum}: TIKR="${s.tikr}" name="${s.officialName}"`);

  // ── vF folder scan ──
  console.log(`\n[verify] Listing vF folder...`);
  const vfFiles = await listVFFiles(token);
  console.log(`[verify] vF folder: ${vfFiles.length} xlsx/xlsm files`);
  const vfAngel = vfFiles.filter((f) => /angel/i.test(f.name));
  console.log(`\n=== Search: "Angel" in vF folder ===`);
  if (vfAngel.length === 0) console.log("  (no vF file mentions 'angel')");
  for (const f of vfAngel) console.log(`  ${f.name}  (${Math.round(f.size / 1024)}KB)`);

  // ── Peek at Angel One vF B2 via binary download (Graph workbook API often 504s here) ──
  for (const f of vfAngel) {
    console.log(`\n[verify] Downloading ${f.name} to read B2 directly...`);
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${f.id}/content`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
    if (!res.ok) { console.log(`  HTTP ${res.status} downloading binary`); continue; }
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: "array" });
    console.log(`  Sheets in workbook: ${wb.SheetNames.join(" | ")}`);
    const summary = wb.SheetNames.find((s) => s.toLowerCase().replace(/\s+/g, " ").trim() === "tusk - summary");
    if (!summary) { console.log(`  (no "Tusk - Summary" sheet)`); continue; }
    const ws = wb.Sheets[summary];
    const cell = (addr: string) => { const c = ws[addr]; return c ? c.v : null; };
    console.log(`  Summary sheet: "${summary}"`);
    console.log(`  B2 (TIKR):    ${JSON.stringify(cell("B2"))}`);
    console.log(`  F5 (sector):  ${JSON.stringify(cell("F5"))}`);
    console.log(`  G5 (subsec):  ${JSON.stringify(cell("G5"))}`);
  }

  console.log(`\n[verify] Done.`);
}

main().catch((err) => {
  console.error(`[verify] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
