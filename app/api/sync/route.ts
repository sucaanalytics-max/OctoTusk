import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ── OneDrive file coordinates ──
const DRIVE_ID =
  "b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH";
const ITEM_ID = "01XUUXNQ72HPRIFGFYLVGID3Y3UPXXUV4H"; // Octopus Dashboard_.xlsx
const SHEET_NAME = "JVB Output";

// ── Column index → database.json field mapping ──
const COL_MAP: Record<number, string> = {
  41: "tikr", // "Ticker" col (internal name like "Smartworks")
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

// Numeric fields that should be parsed as numbers (not strings)
const NUMERIC_FIELDS = new Set([
  "holding_cash_lakhs",
  "holding_pct",
  "abs_leverage",
  "leverage_pct",
  "bear_current",
  "base_current",
  "bull_current",
  "target_1y",
  "target_2y",
  "div_yield",
  "cmp",
  "upside_bear",
  "upside_base",
  "upside_bull",
  "upside_1y",
  "upside_2y",
  "base_pe",
  "base_pe_2sd",
  "base_pb",
  "base_pb_2sd",
  "base_evebitda",
  "base_evebitda_2sd",
  "reviewed_pranay",
  "conviction",
  "understanding",
  "score",
  "score_adj_1y",
  "exp_profit_fy27",
  "exp_profit_fy28",
]);

/** Convert Excel serial date (e.g. 45986) to ISO date string (2025-11-25) */
function excelDateToISO(serial: number | string): string {
  if (typeof serial === "string") {
    // Already a date string
    if (/\d{4}-\d{2}-\d{2}/.test(serial)) return serial;
    const n = Number(serial);
    if (isNaN(n)) return serial;
    serial = n;
  }
  if (typeof serial !== "number" || serial < 1) return "";
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().split("T")[0];
}

/** Get Graph API access token via client_credentials */
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

/** Read the JVB Output sheet from the Octopus Dashboard via Graph API */
async function readJVBOutput(token: string): Promise<unknown[][]> {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ITEM_ID}/workbook/worksheets('${encodeURIComponent(SHEET_NAME)}')/usedRange(valuesOnly=true)`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Graph Excel error: ${data.error.message || JSON.stringify(data.error)}`);
  }
  return data.values || [];
}

/** Parse raw Excel rows into the stocks array */
function parseStocks(rows: unknown[][]): Record<string, unknown>[] {
  if (rows.length < 2) return [];

  const stocks: Record<string, unknown>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const stock: Record<string, unknown> = {};

    for (const [colStr, field] of Object.entries(COL_MAP)) {
      const col = Number(colStr);
      let val = col < row.length ? row[col] : null;

      // Skip empty / #VALUE! / #REF! cells
      if (val === "" || val === null || val === undefined) {
        val = null;
      } else if (typeof val === "string" && val.startsWith("#")) {
        val = null;
      }

      // Convert numeric fields
      if (NUMERIC_FIELDS.has(field) && val !== null) {
        const n = Number(val);
        val = isNaN(n) ? null : n;
      }

      // Convert Excel serial date
      if (field === "last_updated" && val !== null) {
        val = excelDateToISO(val as number | string);
      }

      // Convert subsector "0" to string
      if (field === "subsector" && val !== null) {
        val = String(val);
      }

      stock[field] = val;
    }

    // Skip rows without a valid ticker
    if (!stock.tikr || typeof stock.tikr !== "string" || stock.tikr.trim() === "") {
      continue;
    }

    stocks.push(stock);
  }

  return stocks;
}

export async function POST() {
  try {
    // Step 1: Get Graph API token
    const token = await getGraphToken();

    // Step 2: Read the JVB Output sheet
    const rows = await readJVBOutput(token);

    // Step 3: Parse into stocks array
    const stocks = parseStocks(rows);

    if (stocks.length === 0) {
      return NextResponse.json(
        { error: "No valid stocks found in JVB Output sheet" },
        { status: 422 }
      );
    }

    // Step 4: Load existing ticker_map and holdings from static database.json
    // (These don't change via Excel — they're maintained separately)
    const fs = await import("fs");
    const path = await import("path");
    const dbPath = path.join(process.cwd(), "data", "database.json");
    const staticDb = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

    // Step 5: Return the merged result
    const uniqueStocks = new Set(stocks.map((s) => s.tikr));

    return NextResponse.json({
      stocks,
      holdings: staticDb.holdings,
      ticker_map: staticDb.ticker_map,
      metadata: {
        source: "Octopus Dashboard - JVB Output (Live OneDrive)",
        extracted_at: new Date().toISOString(),
        total_stocks: stocks.length,
        unique_stocks: uniqueStocks.size,
        total_holdings: staticDb.holdings?.length || 0,
      },
      refreshedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/sync] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
