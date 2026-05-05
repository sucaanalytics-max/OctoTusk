import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import type * as XLSXTypes from "xlsx";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// TEMPORARY DIAGNOSTIC: no auth. Targets a single TIKR, downloads and parses
// only the matching vF file from OneDrive, returns the cell-level values for
// audit. Remove after verification is complete.

const DRIVE_ID = process.env.GRAPH_DRIVE_ID || "b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH";
const VF_FOLDER_PATH = process.env.GRAPH_VF_FOLDER_PATH || "Tusk Equity/Portfolio Stock Valuations - Bull Base Bear (Tusk Prop)";
const VF_FOLDER_ID_FALLBACK = process.env.GRAPH_VF_FOLDER_ID || "01XUUXNQYRQ7B5PBRKMZGLUVNKA5K5MXY5";

interface VFFile {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl: string;
}

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) throw new Error("Missing Graph env vars");
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Graph token error: ${data.error_description || data.error || "unknown"}`);
  return data.access_token;
}

async function resolveFolderUrl(token: string): Promise<string> {
  if (VF_FOLDER_PATH) {
    const encodedPath = encodeURIComponent(VF_FOLDER_PATH);
    const pathUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children?$top=200&$select=id,name,size,lastModifiedDateTime,file,webUrl`;
    const testRes = await fetch(pathUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (testRes.ok) return pathUrl;
  }
  return `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID_FALLBACK}/children?$top=200&$select=id,name,size,lastModifiedDateTime,file,webUrl`;
}

async function listVFFiles(token: string): Promise<VFFile[]> {
  const out: VFFile[] = [];
  let url: string | null = await resolveFolderUrl(token);
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.error) throw new Error(`Folder list error: ${data.error.message || JSON.stringify(data.error)}`);
    for (const item of data.value || []) {
      if (!item.file) continue;
      const name = item.name as string;
      if (!name.match(/\.(xlsx|xlsm)$/i)) continue;
      if (name.match(/Todos|Banking Results Tracker|Investment Dashboard|Sing grm|Octopus|updateMaster/i)) continue;
      if ((item.size || 0) > 20 * 1024 * 1024) continue;
      out.push({ id: item.id, name, size: item.size || 0, lastModifiedDateTime: item.lastModifiedDateTime || "", webUrl: item.webUrl || "" });
    }
    url = data["@odata.nextLink"] || null;
  }
  return out;
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
function excelDateToISO(serial: number | string): string {
  const n = typeof serial === "string" ? Number(serial) : serial;
  if (isNaN(n)) return String(serial);
  const ms = (n - 25569) * 86400 * 1000;
  return new Date(ms).toISOString().split("T")[0];
}

async function downloadAndParseB2(token: string, file: VFFile, XLSX: typeof import("xlsx")): Promise<{ tikr: string; ws: XLSXTypes.WorkSheet } | null> {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/content`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
  if (!res.ok) return null;
  const buffer = await res.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const summarySheet = wb.SheetNames.find(s => s.toLowerCase().replace(/\s+/g, " ").trim() === "tusk - summary");
  if (!summarySheet) return null;
  const ws = wb.Sheets[summarySheet];
  const tikr = strVal(ws, "B2");
  if (!tikr) return null;
  return { tikr, ws };
}

export async function GET(req: NextRequest) {
  noStore();
  const requested = (req.nextUrl.searchParams.get("tikr") || "").trim();
  if (!requested) return NextResponse.json({ error: "Missing ?tikr=" }, { status: 400 });
  const target = requested.toUpperCase();

  try {
    const token = await getGraphToken();
    const allFiles = await listVFFiles(token);

    // Optimisation: try files whose name suggests the target first.
    const hint = target.toLowerCase();
    const ranked = [...allFiles].sort((a, b) => {
      const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      const aHit = an.includes(hint) || an.includes("aditya") || an.includes("birla") || an.includes("absl");
      const bHit = bn.includes(hint) || bn.includes("aditya") || bn.includes("birla") || bn.includes("absl");
      if (aHit && !bHit) return -1;
      if (!aHit && bHit) return 1;
      return 0;
    });

    const XLSX = await import("xlsx");

    let scanned = 0;
    for (const file of ranked) {
      scanned++;
      const parsed = await downloadAndParseB2(token, file, XLSX);
      if (!parsed) continue;
      if (parsed.tikr.toUpperCase() !== target) continue;
      const ws = parsed.ws;
      return NextResponse.json({
        tikr_requested: requested,
        scanned_files: scanned,
        total_files: allFiles.length,
        matched_file: file.name,
        matched_web_url: file.webUrl,
        last_updated: (() => {
          const v = cellVal(ws, "A5");
          if (v === null || v === undefined) return "";
          if (typeof v === "number") return excelDateToISO(v);
          if (v instanceof Date) return v.toISOString().split("T")[0];
          return String(v);
        })(),
        B2_tikr: parsed.tikr,
        B5_vp: strVal(ws, "B5"),
        C5_sa: strVal(ws, "C5"),
        D5_conviction: numVal(ws, "D5"),
        E5_understanding: numVal(ws, "E5"),
        F5_sector: strVal(ws, "F5"),
        G5_subsector: strVal(ws, "G5"),
        B9_bear_current: numVal(ws, "B9"),
        C9_base_current: numVal(ws, "C9"),
        D9_bull_current: numVal(ws, "D9"),
        B10_upside_bear: numVal(ws, "B10"),
        C10_upside_base: numVal(ws, "C10"),
        D10_upside_bull: numVal(ws, "D10"),
        C11_target_1y: numVal(ws, "C11"),
        E11_upside_1y: numVal(ws, "E11"),
        C12_target_2y: numVal(ws, "C12"),
        E12_upside_2y: numVal(ws, "E12"),
        B16_bear_pe: numVal(ws, "B16"),
        C16_base_pe: numVal(ws, "C16"),
        D16_bull_pe: numVal(ws, "D16"),
        F16_base_pe_2sd: numVal(ws, "F16"),
        B17_bear_pb: numVal(ws, "B17"),
        C17_base_pb: numVal(ws, "C17"),
        D17_bull_pb: numVal(ws, "D17"),
        F17_base_pb_2sd: numVal(ws, "F17"),
        B18_bear_evebitda: numVal(ws, "B18"),
        C18_base_evebitda: numVal(ws, "C18"),
        D18_bull_evebitda: numVal(ws, "D18"),
        F18_base_evebitda_2sd: numVal(ws, "F18"),
        B21_comments: strVal(ws, "B21"),
      });
    }

    return NextResponse.json({
      tikr_requested: requested,
      scanned_files: scanned,
      total_files: allFiles.length,
      error: "TIKR not found in any vF file's cell B2",
    }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
