#!/usr/bin/env npx tsx
/**
 * build-allocation-workbook.ts
 * ---------------------------------------------------------------------------
 * Compiles team portfolio allocation suggestions (8 screenshots) into a single
 * styled, auditable multi-sheet .xlsx. One-off analytical deliverable.
 *
 *   Run from repo root:  npx tsx scripts/build-allocation-workbook.ts
 *   Output:              ./Team_Allocation_Consolidated.xlsx
 *
 * DATA INTEGRITY RULES (per plan):
 *   - Every transcribed value lives in the DATA BLOCK below — single source of truth.
 *   - Gaps (e.g. Anup's unreadable GPIL) are `null` → EXCLUDED + FLAGGED, never guessed.
 *   - Unmapped stock names throw (forces an explicit normalization decision).
 *   - Enrichment is pulled live from data/database.json; sector uses a CURATED canonical
 *     map (database.json's top-level sector mislabels e.g. Interarch as "Real Estate").
 *
 * To correct data later (Anup GPIL, Abhishek Biyani/B names, AB entity): edit the DATA BLOCK /
 * NORMALIZE / SECTOR maps and re-run. Nothing else needs to change.
 */

import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════════════
// DATA BLOCK — transcribed verbatim from screenshots (₹ Cr)
// ═══════════════════════════════════════════════════════════════════════════

type Line = { name: string; cr: number | null; note?: string };
type Book = { member: string; kind: "team" | "benchmark"; image: string; lines: Line[] };

const BOOKS: Book[] = [
  {
    member: "Sid Kanodia (Octopus model)", kind: "team", image: "Sid Kanodia (Octopus-model based)",
    lines: [
      { name: "Motherson", cr: 30 }, { name: "Nifty Bank ETF", cr: 30 },
      { name: "Karnataka Bank", cr: 20 }, { name: "Five Star Business", cr: 15 },
      { name: "Hindustan Petroleum", cr: 15 }, { name: "Suraksha", cr: 15 },
      { name: "GPIL", cr: 15 }, { name: "Interarch Building", cr: 10 },
    ],
  },
  {
    member: "Abhishek Biyani", kind: "team", image: "Abhishek Biyani (WeWork/Saregama list)",
    lines: [
      { name: "Smartworks", cr: 10 }, { name: "WeWork", cr: 11.5 }, { name: "Motherson", cr: 25 },
      { name: "Manappuram Finance", cr: 10 }, { name: "CRAMC", cr: 5 }, { name: "Nuvama", cr: 10 },
      { name: "Saregama", cr: 23 }, { name: "ICICI Bank", cr: 12 }, { name: "Axis Bank", cr: 12 },
      { name: "Nuvama", cr: 10, note: "2nd Nuvama line → combined to ₹20 Cr" },
      { name: "Prestige", cr: 7 }, { name: "ABREL", cr: 7 }, { name: "GPIL", cr: 7.5 },
    ],
  },
  {
    member: "Prachi Khaitan", kind: "team", image: "Prachi Khaitan (sector-tagged list)",
    lines: [
      { name: "BOB", cr: 12 }, { name: "BOI", cr: 12 }, { name: "SBI", cr: 12 },
      { name: "Axis", cr: 12.5 }, { name: "ICICI", cr: 12.5 }, { name: "HDFC AMC", cr: 20 },
      { name: "JM Financial", cr: 10 }, { name: "GPIL", cr: 15 }, { name: "Interarch", cr: 10 },
      { name: "Aptus", cr: 10 }, { name: "Prestige", cr: 12 }, { name: "IIFL Finance", cr: 12 },
    ],
  },
  {
    member: "Debanjan", kind: "team", image: "Img4",
    lines: [
      { name: "SBI", cr: 20 }, { name: "Bajaj Finserv", cr: 20 }, { name: "Axis Bank", cr: 10 },
      { name: "ICICI Bank", cr: 10 }, { name: "Suraksha", cr: 10 }, { name: "HDFC AMC", cr: 10 },
      { name: "Nuvama", cr: 10 }, { name: "GPIL", cr: 10 },
    ],
  },
  {
    member: "Jay", kind: "team", image: "Img5",
    lines: [
      { name: "Motherson", cr: 23 }, { name: "CRAMC", cr: 20 }, { name: "MCX", cr: 9 },
      { name: "Nifty PSU Bank ETF", cr: 8.7 }, { name: "IIFL Finance", cr: 8 },
      { name: "Prestige Estates", cr: 7.5 }, { name: "Axis Bank", cr: 6 },
      { name: "ICICI Bank", cr: 6 }, { name: "Smartworks", cr: 2.5 },
    ],
  },
  {
    member: "Mayecha", kind: "team", image: "Img6",
    lines: [
      { name: "KFIN", cr: 10 }, { name: "CRAMC", cr: 20 }, { name: "HDFC AMC", cr: 20 },
      { name: "MO", cr: 20 }, { name: "JM Financial", cr: 10 },
      { name: "PSU Bank Index", cr: 30 }, { name: "Prestige", cr: 10 },
    ],
  },
  {
    member: "Shreevar", kind: "team", image: "Img7",
    lines: [
      { name: "SBI", cr: 25 }, { name: "Prestige", cr: 25 }, { name: "Brookfield REIT", cr: 25 },
      { name: "Aditya Birla", cr: 20, note: "label partly cut off — assumed Aditya Birla Real Estate" },
      { name: "ICICI", cr: 20 }, { name: "WeWork", cr: 15 }, { name: "Smartworks", cr: 10 },
      { name: "Motilal", cr: 10 },
    ],
  },
  {
    member: "Saket", kind: "team", image: "Img8",
    lines: [
      { name: "GPIL", cr: 20 }, { name: "JM Financial", cr: 20 }, { name: "SBI", cr: 20 },
      { name: "Park Hotels", cr: 15 }, { name: "CRAMC", cr: 15 }, { name: "MOSL", cr: 15 },
      { name: "Saregama", cr: 10 }, { name: "Interarch", cr: 10 }, { name: "CSB", cr: 10 },
      { name: "HDFC AMC", cr: 10 },
    ],
  },
  {
    member: "Anup", kind: "team", image: "Img9",
    lines: [
      { name: "PSU Bees", cr: 15, note: "PSU Bees = Nifty PSU Bank ETF — corrected per Jay (Anup's ETF is PSU Bank, distinct from Sid's Nifty Bank ETF)" }, { name: "Karnataka Bank", cr: 15 }, { name: "Motherson", cr: 15 },
      { name: "GPIL", cr: 10, note: "GPIL ₹10 Cr — confirmed by Jay (was cut off in screenshot)" },
      { name: "JM Financial", cr: 10 }, { name: "IIFL Finance", cr: 10 }, { name: "CRAMC", cr: 10 },
      { name: "WeWork", cr: 5 }, { name: "Smartworks", cr: 5 }, { name: "Interarch", cr: 5 },
      { name: "Axis Bank", cr: 5 }, { name: "ICICI Bank", cr: 5 }, { name: "KFIN", cr: 5 },
    ],
  },
];

const TARGET_BOOK = 150; // ₹ Cr — each team book normalized to this for equal-weight consensus

// ── original (as written) → canonical company name. Keyed by lowercased/trimmed. ──
const NORMALIZE: Record<string, string> = {
  "motherson": "Motherson",
  "nifty bank etf": "Nifty Bank ETF",
  "karnataka bank": "Karnataka Bank",
  "five star business": "Five Star Business",
  "hindustan petroleum": "Hindustan Petroleum",
  "suraksha": "Suraksha Diagnostic",
  "gpil": "GPIL",
  "interarch building": "Interarch", "interarch": "Interarch",
  "smartworks": "Smartworks",
  "wework": "WeWork",
  "manappuram finance": "Manappuram", "manappuram": "Manappuram",
  "cramc": "CRAMC",
  "nuvama": "Nuvama",
  "saregama": "Saregama",
  "icici bank": "ICICI Bank", "icici": "ICICI Bank",
  "axis bank": "Axis Bank", "axis": "Axis Bank",
  "prestige": "Prestige Estates", "prestige estates": "Prestige Estates", "prestige esta": "Prestige Estates",
  "abrel": "Aditya Birla Real Estate", "aditya birla": "Aditya Birla Real Estate",
  "sbi": "SBI",
  "bajaj finserv": "Bajaj Finserv", "bajaj finsrv": "Bajaj Finserv",
  "hdfc amc": "HDFC AMC",
  "jm financial": "JM Financial", "jm": "JM Financial",
  "iifl finance": "IIFL Finance",
  "aptus": "Aptus",
  "bob": "Bank of Baroda",
  "boi": "Bank of India",
  "mcx": "MCX",
  "kfin": "KFIN",
  "mo": "Motilal Oswal", "mosl": "Motilal Oswal", "motilal": "Motilal Oswal", "motilal oswal": "Motilal Oswal",
  "park hotels": "Park Hotels",
  "csb": "CSB Bank",
  "brookfield reit": "Brookfield India REIT", "brookfield re": "Brookfield India REIT",
  "nifty psu bank etf": "Nifty PSU Bank ETF", "psu bank index": "Nifty PSU Bank ETF",
  "psu bees": "Nifty PSU Bank ETF", "nifty psu bank bees": "Nifty PSU Bank ETF", "psu bank bees": "Nifty PSU Bank ETF",
};

function canonical(name: string): string {
  const c = NORMALIZE[name.trim().toLowerCase()];
  if (!c) throw new Error(`Unmapped stock name "${name}" — add it to NORMALIZE`);
  return c;
}

// ── curated canonical sector (authoritative; overrides database.json top-level) ──
const SECTOR: Record<string, string> = {
  "Motherson": "Auto Components",
  "Nifty Bank ETF": "Banking ETF",
  "Nifty PSU Bank ETF": "Banking ETF",
  "Karnataka Bank": "Banks",
  "Five Star Business": "NBFC",
  "Hindustan Petroleum": "Oil & Gas",
  "Suraksha Diagnostic": "Healthcare",
  "GPIL": "Metals & Mining",
  "Interarch": "Building Materials",
  "Smartworks": "Real Estate (Coworking)",
  "WeWork": "Real Estate (Coworking)",
  "Manappuram": "NBFC",
  "CRAMC": "Asset Management",
  "Nuvama": "Capital Markets",
  "Saregama": "Media & Entertainment",
  "ICICI Bank": "Banks",
  "Axis Bank": "Banks",
  "Prestige Estates": "Real Estate",
  "Aditya Birla Real Estate": "Real Estate",
  "SBI": "Banks",
  "Bajaj Finserv": "NBFC / Financials",
  "HDFC AMC": "Asset Management",
  "JM Financial": "Capital Markets",
  "IIFL Finance": "NBFC",
  "Aptus": "Housing Finance",
  "Bank of Baroda": "Banks",
  "Bank of India": "Banks",
  "MCX": "Capital Markets",
  "KFIN": "Capital Markets",
  "Motilal Oswal": "Capital Markets",
  "Park Hotels": "Hospitality",
  "CSB Bank": "Banks",
  "Brookfield India REIT": "REITs",
};

// ── canonical → database.json `tikr` key (verified by red-team audit) ──
const DB_TIKR: Record<string, string> = {
  "Five Star Business": "FIVESTAR", "Hindustan Petroleum": "Hindpetro", "Suraksha Diagnostic": "SURAKSHA",
  "GPIL": "GPIL", "Interarch": "INTERARCH", "Smartworks": "Smartworks", "WeWork": "Wework",
  "Manappuram": "MANAPPURAM", "CRAMC": "CRAMC", "ICICI Bank": "ICICIBANK", "Axis Bank": "AXISBANK",
  "SBI": "SBIN", "Bajaj Finserv": "BAJAJFINSV", "HDFC AMC": "HDFCAMC", "JM Financial": "JMFINANCIL",
  "IIFL Finance": "IIFL", "Bank of Baroda": "BANKBARODA", "Bank of India": "BANKINDIA", "MCX": "MCX",
  "KFIN": "KFINTECH", "Motilal Oswal": "MOTILALOFS", "Park Hotels": "PARKHOTELS", "CSB Bank": "CSBBANK",
  "Brookfield India REIT": "BIRET",
};

// ── canonical → Yahoo symbol (best-effort; ETF symbols indicative) ──
const YAHOO: Record<string, string> = {
  "Motherson": "MOTHERSON.NS", "Nifty Bank ETF": "BANKBEES.NS", "Nifty PSU Bank ETF": "PSUBNKBEES.NS",
  "Karnataka Bank": "KTKBANK.NS", "Five Star Business": "FIVESTAR.NS", "Hindustan Petroleum": "HINDPETRO.NS",
  "Suraksha Diagnostic": "SURAKSHA.NS", "GPIL": "GPIL.NS", "Interarch": "INTERARCH.NS",
  "Smartworks": "SMARTWORKS.NS", "WeWork": "WEWORK.NS", "Manappuram": "MANAPPURAM.NS", "CRAMC": "CRAMC.NS",
  "Nuvama": "NUVAMA.NS", "Saregama": "SAREGAMA.NS", "ICICI Bank": "ICICIBANK.NS", "Axis Bank": "AXISBANK.NS",
  "Prestige Estates": "PRESTIGE.NS", "Aditya Birla Real Estate": "ABREL.NS", "SBI": "SBIN.NS",
  "Bajaj Finserv": "BAJAJFINSV.NS", "HDFC AMC": "HDFCAMC.NS", "JM Financial": "JMFINANCIL.NS",
  "IIFL Finance": "IIFL.NS", "Aptus": "APTUS.NS", "Bank of Baroda": "BANKBARODA.NS",
  "Bank of India": "BANKINDIA.NS", "MCX": "MCX.NS", "KFIN": "KFINTECH.NS", "Motilal Oswal": "MOTILALOFS.NS",
  "Park Hotels": "PARKHOTELS.NS", "CSB Bank": "CSBBANK.NS", "Brookfield India REIT": "BIRET.BO",
};

// ── screenshot-sourced fallback (only for names absent from database.json) ──
// The full Bear/Base/Bull/1Y/2Y spectrum lives only in DB; here we keep whatever single
// upsides the screenshots disclosed (Octopus = base-case; Jay = 1Y/2Y). Missing → null.
type Ref = { cmp: number | null; upBear: number | null; upBase: number | null; upBull: number | null; up1y: number | null; up2y: number | null; source: string };
const SCREENSHOT_REF: Record<string, Ref> = {
  "Motherson":                { cmp: 148.6,  upBear: null, upBase: 0.25, upBull: null, up1y: 0.48, up2y: 0.74, source: "Octopus base; Jay 1Y/2Y" },
  "Nifty Bank ETF":           { cmp: 57500,  upBear: null, upBase: 0.33, upBull: null, up1y: null, up2y: null, source: "Octopus base" },
  "Nifty PSU Bank ETF":       { cmp: 95.9,   upBear: null, upBase: null, upBull: null, up1y: 0.30, up2y: 0.55, source: "Jay 1Y/2Y" },
  "Karnataka Bank":           { cmp: 278,    upBear: null, upBase: 0.41, upBull: null, up1y: null, up2y: null, source: "Octopus base" },
  "Prestige Estates":         { cmp: 1435.1, upBear: null, upBase: null, upBull: null, up1y: 0.27, up2y: 0.50, source: "Jay 1Y/2Y" },
  "Nuvama":                   { cmp: null,   upBear: null, upBase: null, upBull: null, up1y: null, up2y: null, source: "—" },
  "Saregama":                 { cmp: null,   upBear: null, upBase: null, upBull: null, up1y: null, up2y: null, source: "—" },
  "Aptus":                    { cmp: null,   upBear: null, upBase: null, upBull: null, up1y: null, up2y: null, source: "—" },
  "Aditya Birla Real Estate": { cmp: null,   upBear: null, upBase: null, upBull: null, up1y: null, up2y: null, source: "—" },
};

// ═══════════════════════════════════════════════════════════════════════════
// LOAD ENRICHMENT SOURCE (database.json)
// ═══════════════════════════════════════════════════════════════════════════

const ROOT = process.cwd();
const db = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "database.json"), "utf-8"));
const dbStocks: any[] = Array.isArray(db.stocks) ? db.stocks : [];
const tickerMap: Record<string, string> = db.ticker_map || {};

function findDb(canon: string): any | null {
  const tikr = DB_TIKR[canon];
  if (!tikr) return null;
  return dbStocks.find((s) => String(s.tikr).toLowerCase() === tikr.toLowerCase()) || null;
}
function yahooFor(canon: string): string {
  if (YAHOO[canon]) return YAHOO[canon];
  const t = DB_TIKR[canon];
  if (t) {
    const k = Object.keys(tickerMap).find((key) => key.toLowerCase() === t.toLowerCase());
    if (k) return tickerMap[k];
  }
  return "";
}
const numOrNull = (v: any): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);

type Enrich = { inDb: string; cmp: number | null; upBear: number | null; upBase: number | null; upBull: number | null; up1y: number | null; up2y: number | null; yahoo: string; source: string };
function enrich(canon: string): Enrich {
  const row = findDb(canon);
  if (row) {
    return {
      inDb: "Yes", cmp: numOrNull(row.cmp),
      upBear: numOrNull(row.upside_bear), upBase: numOrNull(row.upside_base), upBull: numOrNull(row.upside_bull),
      up1y: numOrNull(row.upside_1y), up2y: numOrNull(row.upside_2y),
      yahoo: yahooFor(canon), source: "Octopus model (DB)",
    };
  }
  const ref = SCREENSHOT_REF[canon];
  return {
    inDb: "No", cmp: ref?.cmp ?? null,
    upBear: ref?.upBear ?? null, upBase: ref?.upBase ?? null, upBull: ref?.upBull ?? null,
    up1y: ref?.up1y ?? null, up2y: ref?.up2y ?? null,
    yahoo: yahooFor(canon), source: ref?.source ?? "—",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AGGREGATION & CONSENSUS MATH
// ═══════════════════════════════════════════════════════════════════════════

const teamBooks = BOOKS.filter((b) => b.kind === "team");
const N = teamBooks.length; // 9 — all submissions are equal-weight team books (Sid Kanodia incl.)

// per book: canonical → aggregated ₹Cr (null lines skipped)
function aggregate(book: Book): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of book.lines) {
    if (l.cr == null) continue;
    const c = canonical(l.name);
    m.set(c, (m.get(c) || 0) + l.cr);
  }
  return m;
}
const agg: Record<string, Map<string, number>> = {};
for (const b of BOOKS) agg[b.member] = aggregate(b);

const rawTotal: Record<string, number> = {};
for (const b of BOOKS) rawTotal[b.member] = Array.from(agg[b.member].values()).reduce((a, c) => a + c, 0);

const scale: Record<string, number> = {};
for (const b of teamBooks) scale[b.member] = TARGET_BOOK / rawTotal[b.member];

const universeSet = new Set<string>();
for (const b of BOOKS) Array.from(agg[b.member].keys()).forEach((c) => universeSet.add(c));
const universe = Array.from(universeSet);

const consensus: Record<string, number> = {}; // equal-weight mean of normalized books
const scaledSum: Record<string, number> = {};
const backers: Record<string, number> = {};
const rawSumTeam: Record<string, number> = {};
for (const c of universe) {
  let s = 0, n = 0, raw = 0;
  for (const b of teamBooks) {
    const cr = agg[b.member].get(c) || 0;
    if (cr > 0) { s += cr * scale[b.member]; n++; raw += cr; }
  }
  scaledSum[c] = s; backers[c] = n; rawSumTeam[c] = raw; consensus[c] = s / N;
}

// ── METHOD A: equal-weight consensus (each analyst scaled to 150, then averaged) ──
const consR: Record<string, number> = {};
for (const c of universe) consR[c] = Math.round(consensus[c] * 10) / 10;
const sortedByCons = universe.slice().sort((a, b) => consensus[b] - consensus[a] || (backers[b] || 0) - (backers[a] || 0) || a.localeCompare(b));
{
  const sumR = universe.reduce((a, c) => a + consR[c], 0);
  const residual = Math.round((TARGET_BOOK - sumR) * 10) / 10;
  if (residual !== 0 && sortedByCons.length) consR[sortedByCons[0]] = Math.round((consR[sortedByCons[0]] + residual) * 10) / 10;
}

// ── METHOD B: capital-weighted "WACC" (Σ raw ₹Cr per stock ÷ total deployed, ×150) ──
// Each rupee gets equal weight → analysts who deployed more capital have proportionally more say.
// No scale-up of sub-₹150 books (no fabricated conviction). This is the PRIMARY consensus.
const totalDeployed = teamBooks.reduce((a, b) => a + rawTotal[b.member], 0);
const wacc: Record<string, number> = {};   // exact ₹Cr on a 150 book
const waccR: Record<string, number> = {};  // rounded to 1dp, sums to exactly 150
for (const c of universe) {
  wacc[c] = (rawSumTeam[c] / totalDeployed) * TARGET_BOOK;
  waccR[c] = Math.round(wacc[c] * 10) / 10;
}
const sortedByWACC = universe.slice().sort((a, b) => wacc[b] - wacc[a] || (backers[b] || 0) - (backers[a] || 0) || a.localeCompare(b));
{
  const sumW = universe.reduce((a, c) => a + waccR[c], 0);
  const residualW = Math.round((TARGET_BOOK - sumW) * 10) / 10;
  if (residualW !== 0 && sortedByWACC.length) waccR[sortedByWACC[0]] = Math.round((waccR[sortedByWACC[0]] + residualW) * 10) / 10;
}

// (no separate benchmark — all 9 submissions are team books)

// ═══════════════════════════════════════════════════════════════════════════
// STYLING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const NAVY = "FF1F3A5F", PEACH = "FFF6E0CE", ZEBRA = "FFF7F9FB", TOTAL = "FFE8EEF5";
const GREEN = "FF1B7F3B", RED = "FFB3261E", AMBER = "FF9A6700";

const thinBorder = () => {
  const s = { style: "thin" as const, color: { argb: "FFDDDDDD" } };
  return { top: s, left: s, right: s, bottom: s };
};

type Col = { key: string; header: string; width: number; numFmt?: string; align?: "left" | "center" | "right" };

function addSheet(wb: ExcelJS.Workbook, name: string, title: string, cols: Col[], rows: any[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 2 }] });
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));

  // title row
  ws.mergeCells(1, 1, 1, cols.length);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 13, color: { argb: NAVY } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PEACH } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;

  // header row
  const h = ws.getRow(2);
  cols.forEach((c, i) => (h.getCell(i + 1).value = c.header));
  h.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = thinBorder();
  });
  h.height = 30;

  // data rows
  rows.forEach((r, idx) => {
    const row = ws.addRow(r);
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      const col = cols[colNo - 1];
      cell.border = thinBorder();
      cell.alignment = { vertical: "middle", horizontal: col?.align || "left", wrapText: false };
      if (col?.numFmt) cell.numFmt = col.numFmt;
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    });
  });
  return ws;
}

function styleTotalRow(ws: ExcelJS.Worksheet, row: ExcelJS.Row, cols: Col[]) {
  row.eachCell({ includeEmpty: true }, (cell, colNo) => {
    const col = cols[colNo - 1];
    cell.font = { bold: true, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL } };
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle", horizontal: col?.align || "left" };
    if (col?.numFmt) cell.numFmt = col.numFmt;
  });
  row.height = 22;
}

const cr1 = "#,##0.0";       // ₹Cr, 1 decimal
const pct1 = "0.0%";          // percentage
const px = "#,##0";          // price/target
const blank = (v: number | null) => (v == null ? "" : v);
// risk-reward = base upside ÷ |bear downside|. "↑bear" = bear case already above CMP; "—" = base ≤ 0.
function riskReward(upBase: number | null, upBear: number | null): number | string {
  if (upBase == null || upBear == null) return "";
  if (upBase <= 0) return "—";
  if (upBear >= 0) return "↑bear";
  return Math.round((upBase / -upBear) * 10) / 10;
}

const wb = new ExcelJS.Workbook();
wb.creator = "OctoTusk allocation compiler";
wb.created = new Date();

// per-stock flags (shared by the CIO Summary and Consensus sheets)
const stockFlags: Record<string, string> = {
  "Nifty Bank ETF": "Banking-index ETF (BANKBEES) — Sid Kanodia only. Distinct from 'PSU Bees'.",
  "Nifty PSU Bank ETF": "'PSU Bees' (PSUBNKBEES) — Jay, Mayecha, Anup. Distinct from Sid's Nifty Bank ETF.",
  "Nuvama": "Abhishek Biyani: two ₹10 Cr lines combined to ₹20 Cr.",
  "Aditya Birla Real Estate": "ABREL (Abhishek Biyani) + Shreevar 'Aditya Birla' merged; label cut off; absent from DB.",
  "Interarch": "Sector = Building Materials (DB top-level mislabels as Real Estate).",
};

// ═══════════════════════════════════════════════════════════════════════════
// SHEET 1 — CIO SUMMARY (clean, conditionally-formatted executive one-pager)
// ═══════════════════════════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("CIO Summary");
  const NC = 12;
  [4, 22, 19, 9, 8, 6, 8, 8, 8, 8, 8, 8].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const Ec: Record<string, Enrich> = {};
  for (const c of universe) Ec[c] = enrich(c);
  const blended = (f: "upBase" | "up1y") => {
    let g = 0, cov = 0;
    for (const c of universe) { const u = Ec[c][f]; if (u != null) { g += (waccR[c] || 0) * u; cov += (waccR[c] || 0); } }
    return cov > 0 ? g / cov : 0;
  };
  const bBase = blended("upBase"), b1y = blended("up1y");
  const top5 = sortedByWACC.slice(0, 5).reduce((a, c) => a + (waccR[c] || 0), 0);
  const noCovN = universe.filter((c) => Ec[c].upBase == null && (waccR[c] || 0) > 0).length;

  let R = 1;
  // Title
  ws.mergeCells(R, 1, R, NC);
  { const c = ws.getCell(R, 1); c.value = "CIO SUMMARY — Consensus (₹150 Cr) vs Octopus Upside"; c.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; c.alignment = { vertical: "middle", horizontal: "left", indent: 1 }; ws.getRow(R).height = 26; }
  R++;

  // KPI cards: 4 × (label row + value row)
  const cards: [string, string][] = [
    ["CAPITAL", "₹150 Cr · 9 analysts"],
    ["BLENDED BASE UPSIDE", `${(bBase * 100).toFixed(1)}%`],
    ["BLENDED 1Y UPSIDE", `${(b1y * 100).toFixed(1)}%`],
    ["TOP-5 CONCENTRATION", `${(top5 / TARGET_BOOK * 100).toFixed(0)}%`],
  ];
  const labR = R, valR = R + 1;
  cards.forEach(([lab, val], k) => {
    const a = k * 3 + 1, b = a + 2;
    ws.mergeCells(labR, a, labR, b); const l = ws.getCell(labR, a); l.value = lab; l.font = { bold: true, size: 9, color: { argb: "FF6B7280" } }; l.alignment = { horizontal: "center", vertical: "middle" }; l.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };
    ws.mergeCells(valR, a, valR, b); const v = ws.getCell(valR, a); v.value = val; v.font = { bold: true, size: 16, color: { argb: NAVY } }; v.alignment = { horizontal: "center", vertical: "middle" }; v.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };
    for (const rr of [labR, valR]) for (let cc = a; cc <= b; cc++) ws.getCell(rr, cc).border = thinBorder();
  });
  ws.getRow(labR).height = 15; ws.getRow(valR).height = 28;
  R = valR + 1;

  // colour-key / how-to-read line
  ws.mergeCells(R, 1, R, NC);
  { const c = ws.getCell(R, 1); c.value = "Weight bars = conviction · Base/1Y shaded red→green (low→high), negative Base in red. Long bar + red Base = crowded & low-upside; short bar + green = under-owned."; c.font = { italic: true, size: 9, color: { argb: "FF6B7280" } }; c.alignment = { horizontal: "left", indent: 1, vertical: "middle", wrapText: true }; ws.getRow(R).height = 26; }
  R++;

  // table header
  const heads = ["#", "Stock", "Sector", "₹Cr", "Wt %", "Bk", "Bear", "Base", "Bull", "1Y", "2Y", "R:R"];
  heads.forEach((h, i) => { const cell = ws.getCell(R, i + 1); cell.value = h; cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; cell.alignment = { vertical: "middle", horizontal: "center" }; cell.border = thinBorder(); });
  ws.getRow(R).height = 20;
  const firstRow = R + 1;

  // data rows (sorted by WACC)
  sortedByWACC.forEach((c) => {
    R++;
    const e = Ec[c];
    const row: [number, any, string?, string?][] = [
      [1, R - firstRow + 1, undefined, "center"], [2, c, undefined, "left"], [3, SECTOR[c] || "?", undefined, "left"],
      [4, waccR[c] || 0, cr1, "right"], [5, (waccR[c] || 0) / TARGET_BOOK, pct1, "right"], [6, backers[c] || 0, undefined, "center"],
      [7, blank(e.upBear), pct1, "right"], [8, blank(e.upBase), pct1, "right"], [9, blank(e.upBull), pct1, "right"],
      [10, blank(e.up1y), pct1, "right"], [11, blank(e.up2y), pct1, "right"], [12, riskReward(e.upBase, e.upBear), "0.0", "right"],
    ];
    for (const [col, v, f, a] of row) { const cell = ws.getCell(R, col); cell.value = v; cell.border = thinBorder(); cell.font = { size: 10 }; cell.alignment = { vertical: "middle", horizontal: (a as any) || "left" }; if (f) cell.numFmt = f as string; }
  });
  const lastRow = R;

  // TOTAL / blended row
  R++;
  for (let cc = 1; cc <= NC; cc++) { const cell = ws.getCell(R, cc); cell.border = thinBorder(); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL } }; cell.font = { bold: true, color: { argb: NAVY } }; }
  const tot: [number, any, string?, string?][] = [[2, "TOTAL / blended", undefined, "left"], [4, TARGET_BOOK, cr1, "right"], [5, 1, pct1, "right"], [8, bBase, pct1, "right"], [10, b1y, pct1, "right"]];
  for (const [col, v, f, a] of tot) { const cell = ws.getCell(R, col); cell.value = v; cell.alignment = { vertical: "middle", horizontal: (a as any) || "left" }; if (f) cell.numFmt = f as string; }

  // footnote
  R += 2; ws.mergeCells(R, 1, R, NC);
  { const c = ws.getCell(R, 1); c.value = `WACC = capital-weighted consensus (Σ raw ₹Cr ÷ ₹${totalDeployed.toFixed(0)} deployed × 150). Upsides = Octopus model: Bear/Base/Bull to fair value, 1Y/2Y target. R:R = Base ÷ |Bear|; "↑" = bear above CMP, "—" = base ≤ 0. Blanks = no Octopus coverage (${noCovN} names). Full detail on the Consensus (WACC) & Notes sheets.`; c.font = { size: 8.5, color: { argb: "FF6B7280" } }; c.alignment = { horizontal: "left", indent: 1, vertical: "top", wrapText: true }; ws.getRow(R).height = 30; }

  // ── conditional formatting ──
  const range = (col: string) => `${col}${firstRow}:${col}${lastRow}`;
  const rg = (lo: number, mid: number, hi: number, p: number): any => ({ type: "colorScale", priority: p, cfvo: [{ type: "num", value: lo }, { type: "num", value: mid }, { type: "num", value: hi }], color: [{ argb: "FFF8696B" }, { argb: "FFFFEB84" }, { argb: "FF63BE7B" }] });
  ws.addConditionalFormatting({ ref: range("D"), rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: { argb: "FF5B9BD5" }, gradient: false, showValue: true } as any] });
  ws.addConditionalFormatting({ ref: range("F"), rules: [{ type: "colorScale", priority: 2, cfvo: [{ type: "num", value: 1 }, { type: "num", value: 9 }], color: [{ argb: "FFFFFFFF" }, { argb: "FF63BE7B" }] } as any] });
  ws.addConditionalFormatting({ ref: range("G"), rules: [rg(-0.10, 0.05, 0.25, 3)] });
  ws.addConditionalFormatting({ ref: range("H"), rules: [rg(-0.05, 0.15, 0.40, 4), { type: "cellIs", priority: 5, operator: "lessThan", formulae: ["0"], style: { font: { bold: true, color: { argb: "FFB3261E" } } } } as any] });
  ws.addConditionalFormatting({ ref: range("I"), rules: [rg(0.00, 0.25, 0.60, 6)] });
  ws.addConditionalFormatting({ ref: range("J"), rules: [rg(0.00, 0.30, 0.70, 7)] });
  ws.addConditionalFormatting({ ref: range("K"), rules: [rg(0.00, 0.40, 1.00, 8)] });
  ws.addConditionalFormatting({ ref: range("L"), rules: [rg(0.5, 1.5, 3.0, 9)] });

  ws.views = [{ state: "frozen", ySplit: firstRow - 1 }];
}

// ═══════════════════════════════════════════════════════════════════════════
// SHEET 2 — RAW SUBMISSIONS
// ═══════════════════════════════════════════════════════════════════════════

const rawCols: Col[] = [
  { key: "member", header: "Contributor", width: 20 },
  { key: "image", header: "Source", width: 38 },
  { key: "orig", header: "Original Name", width: 22 },
  { key: "canon", header: "Normalized", width: 24 },
  { key: "sector", header: "Sector (curated)", width: 22 },
  { key: "cr", header: "₹ Cr", width: 10, numFmt: cr1, align: "right" },
  { key: "flag", header: "Flag / Note", width: 46 },
];
const rawRows: any[] = [];
for (const b of BOOKS) {
  for (const l of b.lines) {
    const canon = canonical(l.name);
    rawRows.push({
      member: b.member,
      image: b.image, orig: l.name, canon, sector: SECTOR[canon] || "?",
      cr: l.cr == null ? "" : l.cr, flag: l.note || "",
    });
  }
}
addSheet(wb, "Raw Submissions", "Raw Submissions — every line transcribed verbatim (₹ Cr)", rawCols, rawRows);

// ═══════════════════════════════════════════════════════════════════════════
// SHEET 2 — ALLOCATION MATRIX (stocks × contributors)
// ═══════════════════════════════════════════════════════════════════════════

const memberOrder = teamBooks.map((b) => b.member);
const matrixCols: Col[] = [
  { key: "stock", header: "Stock", width: 26 },
  { key: "sector", header: "Sector", width: 22 },
  ...memberOrder.map((m) => ({ key: `m_${m}`, header: m, width: 12, numFmt: cr1, align: "right" as const })),
  { key: "teamRaw", header: "Team Σ (raw)", width: 13, numFmt: cr1, align: "right" },
  { key: "nbackers", header: "# Backers", width: 11, align: "center" },
  { key: "wacc", header: "WACC ₹Cr", width: 12, numFmt: cr1, align: "right" },
  { key: "waccPct", header: "WACC %", width: 10, numFmt: pct1, align: "right" },
];
const matrixRows = sortedByWACC.map((c) => {
  const row: any = { stock: c, sector: SECTOR[c] || "?", teamRaw: rawSumTeam[c] || "", nbackers: backers[c] || 0, wacc: waccR[c] || "", waccPct: (waccR[c] || 0) / TARGET_BOOK };
  for (const m of memberOrder) {
    const v = agg[m].get(c) || 0;
    row[`m_${m}`] = v > 0 ? v : "";
  }
  return row;
});
const wsM = addSheet(wb, "Allocation Matrix", "Allocation Matrix — ₹ Cr per contributor (rows sorted by WACC, capital-weighted)", matrixCols, matrixRows);
// totals row
const mTotals: any = { stock: "TOTAL", sector: "", teamRaw: totalDeployed, nbackers: "", wacc: TARGET_BOOK, waccPct: 1 };
for (const m of memberOrder) mTotals[`m_${m}`] = rawTotal[m];
const mTotalRow = wsM.addRow(mTotals);
styleTotalRow(wsM, mTotalRow, matrixCols);
wsM.addRow({ stock: "WACC = capital-weighted consensus (each member's actual ₹Cr pooled ÷ total deployed × 150). See the Consensus sheet for the equal-weight comparison. Sid Kanodia (Image 3) is Octopus-model-derived." });
wsM.getRow(wsM.rowCount).font = { italic: true, color: { argb: AMBER } };

// ═══════════════════════════════════════════════════════════════════════════
// SHEET 3 — CONSENSUS / WACC (blended book + enrichment + Octopus deviation)
// ═══════════════════════════════════════════════════════════════════════════

// (stockFlags is defined earlier, before the CIO Summary sheet)

const consCols: Col[] = [
  { key: "rank", header: "#", width: 5, align: "center" },
  { key: "stock", header: "Stock", width: 26 },
  { key: "sector", header: "Sector", width: 22 },
  { key: "wacc", header: "WACC ₹Cr", width: 12, numFmt: cr1, align: "right" },
  { key: "waccPct", header: "WACC %", width: 9, numFmt: pct1, align: "right" },
  { key: "eqw", header: "Equal-wt ₹Cr", width: 12, numFmt: cr1, align: "right" },
  { key: "eqwPct", header: "Equal-wt %", width: 10, numFmt: pct1, align: "right" },
  { key: "delta", header: "Δ (WACC−Eq)", width: 12, numFmt: "+#,##0.0;-#,##0.0", align: "right" },
  { key: "nbackers", header: "# Backers /9", width: 11, align: "center" },
  { key: "avgBacked", header: "Avg ₹Cr when backed", width: 14, numFmt: cr1, align: "right" },
  { key: "inDb", header: "In DB?", width: 7, align: "center" },
  { key: "cmp", header: "CMP", width: 10, numFmt: px, align: "right" },
  { key: "bear", header: "Bear %", width: 8, numFmt: pct1, align: "right" },
  { key: "base", header: "Base %", width: 8, numFmt: pct1, align: "right" },
  { key: "bull", header: "Bull %", width: 8, numFmt: pct1, align: "right" },
  { key: "y1", header: "1Y %", width: 8, numFmt: pct1, align: "right" },
  { key: "y2", header: "2Y %", width: 8, numFmt: pct1, align: "right" },
  { key: "rr", header: "R:R", width: 8, numFmt: "0.0", align: "right" },
  { key: "yahoo", header: "Yahoo Sym", width: 15 },
  { key: "refsrc", header: "Ref Source", width: 14 },
  { key: "flag", header: "Flag / Note", width: 50 },
];
const consRows = sortedByWACC.map((c, i) => {
  const e = enrich(c);
  return {
    rank: i + 1, stock: c, sector: SECTOR[c] || "?",
    wacc: waccR[c] || 0, waccPct: (waccR[c] || 0) / TARGET_BOOK,
    eqw: consR[c] || 0, eqwPct: (consR[c] || 0) / TARGET_BOOK,
    delta: Math.round(((waccR[c] || 0) - (consR[c] || 0)) * 10) / 10,
    nbackers: backers[c] || 0,
    avgBacked: backers[c] ? scaledSum[c] / backers[c] : "",
    inDb: e.inDb, cmp: blank(e.cmp), bear: blank(e.upBear), base: blank(e.upBase), bull: blank(e.upBull), y1: blank(e.up1y), y2: blank(e.up2y), rr: riskReward(e.upBase, e.upBear),
    yahoo: e.yahoo, refsrc: e.source,
    flag: stockFlags[c] || "",
  };
});
const wsC = addSheet(wb, "Consensus (WACC)", "Consensus — WACC (capital-weighted, primary) vs Equal-weight; 9 books on a ₹150 Cr book", consCols, consRows);
const dCol = consCols.findIndex((c) => c.key === "delta") + 1;
for (let r = 3; r < 3 + consRows.length; r++) {
  const v = Number(wsC.getCell(r, dCol).value) || 0;
  wsC.getCell(r, dCol).font = { color: { argb: v > 0 ? GREEN : v < 0 ? RED : "FF666666" } };
}
const cTotals: any = { rank: "", stock: "TOTAL", sector: "", wacc: TARGET_BOOK, waccPct: 1, eqw: TARGET_BOOK, eqwPct: 1, delta: 0 };
const cTotalRow = wsC.addRow(cTotals);
styleTotalRow(wsC, cTotalRow, consCols);

// ═══════════════════════════════════════════════════════════════════════════
// SHEET 4 — SECTOR SUMMARY (consensus vs Octopus)
// ═══════════════════════════════════════════════════════════════════════════

const sectorWacc: Record<string, number> = {};
const sectorCons: Record<string, number> = {};
const sectorStocks: Record<string, number> = {};
for (const c of universe) {
  const sec = SECTOR[c] || "?";
  sectorWacc[sec] = (sectorWacc[sec] || 0) + (waccR[c] || 0);
  sectorCons[sec] = (sectorCons[sec] || 0) + (consR[c] || 0);
  if ((waccR[c] || 0) > 0) sectorStocks[sec] = (sectorStocks[sec] || 0) + 1;
}
const allSectors = Object.keys(sectorWacc).sort((a, b) => (sectorWacc[b] || 0) - (sectorWacc[a] || 0) || a.localeCompare(b));
const totalStocks = Object.values(sectorStocks).reduce((a, c) => a + c, 0);
const sectorCols: Col[] = [
  { key: "sector", header: "Sector", width: 26 },
  { key: "wacc", header: "WACC ₹Cr", width: 13, numFmt: cr1, align: "right" },
  { key: "waccPct", header: "WACC %", width: 10, numFmt: pct1, align: "right" },
  { key: "eqw", header: "Equal-wt ₹Cr", width: 13, numFmt: cr1, align: "right" },
  { key: "eqwPct", header: "Equal-wt %", width: 11, numFmt: pct1, align: "right" },
  { key: "nstocks", header: "# Stocks", width: 9, align: "center" },
];
const sectorRows = allSectors.map((s) => ({
  sector: s, wacc: sectorWacc[s] || 0, waccPct: (sectorWacc[s] || 0) / TARGET_BOOK,
  eqw: sectorCons[s] || 0, eqwPct: (sectorCons[s] || 0) / TARGET_BOOK, nstocks: sectorStocks[s] || 0,
}));
const wsS = addSheet(wb, "Sector Summary", "Sector Summary — WACC (capital-weighted) vs Equal-weight sector mix", sectorCols, sectorRows);
const sTotalRow = wsS.addRow({ sector: "TOTAL", wacc: TARGET_BOOK, waccPct: 1, eqw: TARGET_BOOK, eqwPct: 1, nstocks: totalStocks });
styleTotalRow(wsS, sTotalRow, sectorCols);

// ═══════════════════════════════════════════════════════════════════════════
// SHEET 5 — NOTES / FLAGS
// ═══════════════════════════════════════════════════════════════════════════

const scaleStr = teamBooks.map((b) => `${b.member} ₹${rawTotal[b.member]}→×${scale[b.member].toFixed(3)}`).join("   ·   ");
const notes: { h?: string; t?: string }[] = [
  { h: "METHODOLOGY — two consensus methods" },
  { t: `PRIMARY = WACC (capital-weighted): stock ₹Cr = Σ(raw ₹Cr each analyst gave the stock) ÷ total capital deployed (₹${totalDeployed.toFixed(1)} Cr across the 9 books) × 150. Each rupee counts equally → analysts who deployed more capital have proportionally more say; no scale-up of sub-₹150 books (no fabricated conviction). Sums to ₹150 by construction.` },
  { t: "SECONDARY = Equal-weight: scale each book to ₹150 first, then average across the 9 books — each ANALYST counts equally regardless of how much they deployed (sub-₹150 books are scaled up). Sums to ₹150. The 'Δ (WACC−Eq)' column on the Consensus sheet shows where the two diverge." },
  { t: `Equal-weight per-book scale factors (₹raw → ×): ${scaleStr}` },
  { t: `Cash variant: un-deployed capital = ₹${(N * TARGET_BOOK - totalDeployed).toFixed(1)} Cr of the ₹${N * TARGET_BOOK} Cr mandate. WACC here divides by DEPLOYED (₹${totalDeployed.toFixed(1)} Cr) → a fully-invested ₹150 book. To instead treat un-deployed as deliberate cash, divide by the ₹${N * TARGET_BOOK} Cr mandate → stock weights would sum to ${((totalDeployed / (N * TARGET_BOOK)) * 100).toFixed(1)}%, remainder = cash.` },
  { h: "DATA-INTEGRITY FLAGS" },
  { t: "• Abhishek Biyani (WeWork/Saregama list) & Prachi Khaitan (sector-tagged list): identities confirmed by Jay; both distinct contributors." },
  { t: "• Anup — GPIL: ₹10 Cr (value was cut off in the screenshot; confirmed by Jay). Anup's book total ₹115 Cr." },
  { t: "• ETFs are TWO distinct instruments: Nifty Bank ETF (BANKBEES — Sid Kanodia) vs Nifty PSU Bank ETF / 'PSU Bees' (PSUBNKBEES — Jay, Mayecha, Anup). Anup's ₹15 ETF reclassified from Nifty Bank → PSU Bees per Jay (book total unchanged)." },
  { t: "• Abhishek Biyani — Nuvama: appeared twice (₹10 + ₹10); both are part of the ₹150 total → combined into one ₹20 Cr position." },
  { t: "• Aditya Birla: Abhishek Biyani 'ABREL' (₹7) + Shreevar 'Aditya Birla' (₹20, label partly cut off) merged as 'Aditya Birla Real Estate'. NOT enriched from database.json's ABCAPITAL (Aditya Birla Capital, a different NBFC entity). Confirm entity." },
  { t: "• Book totals ≠ ₹150 Cr (raw — which is fine): Debanjan 100, Jay 90.7, Mayecha 120, Saket 145, Anup 115; Abhishek Biyani / Prachi Khaitan / Shreevar / Sid Kanodia = 150. Each is normalized to 150 only for the consensus blend." },
  { h: "ENRICHMENT (Ref CMP / Ref Base Tgt / Ref Upside)" },
  { t: "Pulled live from data/database.json (base_current as 'Base Tgt', upside_base, last-known cmp — which is STALE, not live). Names absent from database.json (Motherson, Prestige, both Nifty ETFs, Karnataka Bank, Nuvama, Saregama, Aptus, Aditya Birla Real Estate) are filled from the screenshots where available (Octopus / Jay), else blank." },
  { t: "Sector column is a CURATED canonical map, NOT database.json's top-level sector (which mislabels Interarch as 'Real Estate' — correct subsector is Building Materials)." },
  { t: "Yahoo symbols are best-effort; ETF symbols (Nifty Bank / PSU Bank) are indicative — verify before use." },
  { h: "CONTRIBUTORS (9 team books, equal weight)" },
  { t: "Abhishek Biyani, Prachi Khaitan, Debanjan, Jay, Mayecha, Shreevar, Saket, Anup, Sid Kanodia (Octopus-model based)." },
  { t: `Generated ${new Date().toISOString().slice(0, 10)} from screenshots Img1–Img9. Edit scripts/build-allocation-workbook.ts (DATA BLOCK) and re-run to update.` },
];
const wsN = wb.addWorksheet("Notes & Flags");
wsN.columns = [{ key: "x", width: 140 }];
wsN.mergeCells(1, 1, 1, 1);
const nt = wsN.getCell(1, 1);
nt.value = "Notes, Assumptions & Data-Integrity Flags";
nt.font = { bold: true, size: 13, color: { argb: NAVY } };
nt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PEACH } };
wsN.getRow(1).height = 26;
for (const n of notes) {
  if (n.h) {
    const r = wsN.addRow([n.h]);
    r.getCell(1).font = { bold: true, size: 11, color: { argb: NAVY } };
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL } };
    r.height = 20;
  } else {
    const r = wsN.addRow([n.t]);
    r.getCell(1).alignment = { wrapText: true, vertical: "top" };
    r.height = 32;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICATION (console) + WRITE
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── RECONCILIATION ──────────────────────────────────────────");
let ok = true;
for (const b of BOOKS) {
  const declared = b.lines.reduce((a, l) => a + (l.cr || 0), 0);
  const aggSum = rawTotal[b.member];
  const match = Math.abs(declared - aggSum) < 1e-6;
  if (!match) ok = false;
  const tag = b.kind === "benchmark" ? "[bench]" : "[team] ";
  console.log(`  ${tag} ${b.member.padEnd(18)} raw=₹${aggSum.toFixed(1).padStart(6)}  ${b.kind === "team" ? `→ ×${scale[b.member].toFixed(3)}` : "(benchmark)"}${match ? "" : "  ⚠ AGG≠DECLARED"}`);
}
const consTotal = universe.reduce((a, c) => a + (consR[c] || 0), 0);
const waccTotal = universe.reduce((a, c) => a + (waccR[c] || 0), 0);
console.log(`\n  Team books: ${N}   |   Total deployed: ₹${totalDeployed.toFixed(1)} Cr (of ₹${N * TARGET_BOOK} mandate)`);
console.log(`  WACC total: ₹${waccTotal.toFixed(1)}   |   Equal-wt total: ₹${consTotal.toFixed(1)}   (target ₹${TARGET_BOOK})`);
if (Math.abs(consTotal - TARGET_BOOK) > 0.05) { ok = false; console.log("  ⚠ EQUAL-WT TOTAL ≠ 150"); }
if (Math.abs(waccTotal - TARGET_BOOK) > 0.05) { ok = false; console.log("  ⚠ WACC TOTAL ≠ 150"); }
console.log(`  Universe: ${universe.length} stocks`);
console.log(`  Top WACC:     ${sortedByWACC.slice(0, 6).map((c) => `${c} ₹${waccR[c]}`).join(", ")}`);
console.log(`  Top Equal-wt: ${sortedByCons.slice(0, 6).map((c) => `${c} ₹${consR[c]}`).join(", ")}`);
console.log(`  ${ok ? "✅ All reconciliations passed." : "❌ Reconciliation failed — check flags above."}`);

const OUT = path.join(ROOT, "Team_Allocation_Consolidated.xlsx");
wb.xlsx.writeFile(OUT).then(() => {
  console.log(`\n✅ Wrote ${OUT}`);
  console.log("   Sheets: CIO Summary · Raw Submissions · Allocation Matrix · Consensus (WACC) · Sector Summary · Notes & Flags\n");
  if (!ok) process.exit(1);
}).catch((err) => {
  console.error("❌ Failed to write workbook:", err);
  process.exit(1);
});
