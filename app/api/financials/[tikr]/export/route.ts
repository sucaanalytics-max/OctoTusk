import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadFinancials } from "@/lib/mobile/financials";
import { STATEMENT_ORDER, STATEMENT_LABEL } from "@/lib/mobile/financialsTypes";

export const dynamic = "force-dynamic";

// Excel sheet names: ≤31 chars, none of \ / ? * [ ] :
const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);

/**
 * GET /api/financials/[tikr]/export
 * Auth-gated. Builds a multi-tab .xlsx (one sheet per statement) from the cached financials and
 * returns it as an attachment download. Reads the same cache seam as the screen — no upstream call.
 */
export async function GET(_req: Request, { params }: { params: { tikr: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tikr = decodeURIComponent(params.tikr);
  const { payload } = await loadFinancials(tikr);
  if (!payload) {
    return NextResponse.json({ error: "No financials to export" }, { status: 404 });
  }

  const unit = payload.unit || "Cr";
  const wb = new ExcelJS.Workbook();
  wb.creator = "OctoTusk";

  for (const key of STATEMENT_ORDER) {
    const st = payload.statements[key];
    if (!st || st.rows.length === 0) continue;
    const ws = wb.addWorksheet(sheetName(STATEMENT_LABEL[key]));
    ws.addRow([`Line Item (₹ ${unit})`, ...st.periods]);
    for (const r of st.rows) {
      ws.addRow([r.label, ...st.periods.map((_, i) => r.values[i] ?? null)]);
    }
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
    ws.getColumn(1).width = 42;
    for (let c = 2; c <= st.periods.length + 1; c++) ws.getColumn(c).width = 13;
  }

  if (wb.worksheets.length === 0) {
    return NextResponse.json({ error: "No statements to export" }, { status: 404 });
  }

  const data = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const filename = `${payload.symbol || tikr}_financials.xlsx`;
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
