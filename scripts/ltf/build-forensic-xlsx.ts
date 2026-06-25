/**
 * Builds LTF_Forensic.xlsx — a forensic financial analysis workbook for L&T Finance (FY26).
 * Reads: scripts/ltf/extracted/anchor_facts.json (audited, orchestrator-verified)
 *        scripts/ltf/forensic_findings.json        (synthesised findings + red-team)
 *        scripts/ltf/extracted/screener_cons.json  (long-horizon trend / reconciliation)
 * Writes: ~/Downloads/L&T Finance Docs/LTF_Forensic.xlsx
 *
 * Run: npx tsx scripts/ltf/build-forensic-xlsx.ts
 * tsc-clean: no Map/Set spread iteration; plain arrays only.
 */
import ExcelJS from 'exceljs'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const ROOT = path.join(__dirname, '..', '..')
const EXTR = path.join(__dirname, 'extracted')
const anchors = JSON.parse(fs.readFileSync(path.join(EXTR, 'anchor_facts.json'), 'utf8'))
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'forensic_findings.json'), 'utf8'))
const screener = JSON.parse(fs.readFileSync(path.join(EXTR, 'screener_cons.json'), 'utf8'))
const AR = JSON.parse(fs.readFileSync(path.join(EXTR, 'annual_report_facts.json'), 'utf8'))

const OUT = path.join(os.homedir(), 'Downloads', 'L&T Finance Docs', 'LTF_Forensic.xlsx')

// ---------- palette ----------
const NAVY = 'FF0B2545', BLUE = 'FF13315C', STEEL = 'FF8DA9C4', PALE = 'FFEEF4FA'
const RED = 'FFC0392B', AMBER = 'FFE67E22', YELLOW = 'FFF1C40F', GREEN = 'FF1E8449', GREY = 'FF7F8C8D'
const WHITE = 'FFFFFFFF', INK = 'FF1A1A1A', LIGHT = 'FFF7F9FC'

const sevColor: Record<string, string> = { critical: RED, high: AMBER, medium: YELLOW, low: STEEL, info: GREEN }
const dirColor: Record<string, string> = { 'red-flag': RED, positive: GREEN, neutral: GREY }
const verdictColor: Record<string, string> = { REFUTED: RED, 'PARTIALLY-CONFIRMED': AMBER, CONFIRMED: GREEN, UNVERIFIABLE: GREY }

const wb = new ExcelJS.Workbook()
wb.creator = 'OctoTusk Forensic'
wb.created = new Date(2026, 5, 16)

// ---------- helpers ----------
function fill(cell: ExcelJS.Cell, color: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
}
function setCols(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
}
function titleBlock(ws: ExcelJS.Worksheet, title: string, sub: string, span: string) {
  ws.mergeCells(span.replace(/\d+/g, '1'))
  const t = ws.getCell('A1')
  t.value = title
  t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: WHITE } }
  fill(t, NAVY)
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30
  const lastCol = span.replace(/[0-9]/g, '').split(':')[1]
  ws.mergeCells(`A2:${lastCol}2`)
  const s = ws.getCell('A2')
  s.value = sub
  s.font = { name: 'Calibri', size: 10, italic: true, color: { argb: WHITE } }
  fill(s, BLUE)
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(2).height = 18
}
function headerRow(ws: ExcelJS.Worksheet, rowIdx: number, cols: string[], color = BLUE) {
  const r = ws.getRow(rowIdx)
  cols.forEach((c, i) => {
    const cell = r.getCell(i + 1)
    cell.value = c
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 }
    fill(cell, color)
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: STEEL } } }
  })
  r.height = 26
}
function zebra(ws: ExcelJS.Worksheet, fromRow: number, toRow: number, ncols: number) {
  for (let r = fromRow; r <= toRow; r++) {
    if ((r - fromRow) % 2 === 1) {
      for (let c = 1; c <= ncols; c++) {
        const cell = ws.getRow(r).getCell(c)
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor === undefined) fill(cell, LIGHT)
      }
    }
  }
}
const num2 = '#,##0.00'
const num0 = '#,##0'
const pct1 = '0.0%'
const pct2 = '0.00'

// ===================================================================
// SHEET 1 — COVER & VERDICT
// ===================================================================
function cover() {
  const ws = wb.addWorksheet('Verdict', { properties: { tabColor: { argb: NAVY } }, views: [{ showGridLines: false }] })
  setCols(ws, [26, 20, 20, 20, 20, 20])
  titleBlock(ws, F._meta.title, F._meta.subtitle, 'A1:F2')

  let r = 4
  ws.getCell(`A${r}`).value = 'FORENSIC VERDICT'
  ws.getCell(`A${r}`).font = { bold: true, size: 11, color: { argb: NAVY } }
  r++
  ws.mergeCells(`A${r}:F${r + 3}`)
  const v = ws.getCell(`A${r}`)
  v.value = F.verdict_headline
  v.alignment = { wrapText: true, vertical: 'top' }
  v.font = { size: 10.5, color: { argb: INK } }
  fill(v, PALE)
  v.border = { left: { style: 'thick', color: { argb: RED } } }
  r += 5

  ws.getCell(`A${r}`).value = 'STANCE'
  ws.getCell(`A${r}`).font = { bold: true, size: 11, color: { argb: NAVY } }
  r++
  ws.mergeCells(`A${r}:F${r + 2}`)
  const st = ws.getCell(`A${r}`)
  st.value = F.stance
  st.alignment = { wrapText: true, vertical: 'top' }
  st.font = { size: 10.5, color: { argb: INK }, bold: true }
  fill(st, PALE)
  st.border = { left: { style: 'thick', color: { argb: AMBER } } }
  r += 4

  // KPI strip
  ws.getCell(`A${r}`).value = 'KEY VERIFIED METRICS (FY26, consolidated unless noted)'
  ws.getCell(`A${r}`).font = { bold: true, size: 11, color: { argb: NAVY } }
  r++
  const val = F.valuation
  const kpis: [string, string][] = [
    ['CMP', `Rs ${val.cmp}`],
    ['P/B (trailing)', `${val.pb.toFixed(2)}x`],
    ['P/E', `${val.pe_consol.toFixed(1)}x`],
    ['RoE', `${val.roe_fy26.toFixed(1)}%`],
    ['RoA (avg assets)', `${val.roa_fy26.toFixed(2)}%`],
    ['BVPS', `Rs ${val.bvps_consol.toFixed(0)}`],
    ['PAT owners', `Rs ${anchors.consolidated_PL_INRcr.PAT_owners.FY26.toLocaleString('en-IN')} cr`],
    ['PAT YoY', '+12.8%'],
    ['Loans', `Rs ${anchors.consolidated_balance_sheet_INRcr.loans.FY26.toLocaleString('en-IN')} cr`],
    ['Loan growth', '+25.6%'],
    ['GS3 / NS3', '2.88% / 0.96%'],
    ['Stage-3 PCR', '68.1% (from 73.0%)'],
    ['CRAR', '18.34%'],
    ['NIM+fees', '10.33% (-26bps)'],
    ['Auditor opinion', 'Unmodified'],
    ['Red-team', '4 of 7 pillars REFUTED'],
  ]
  // KPI grid: 4 across, label-over-value in one cell
  const kr = r
  for (let i = 0; i < kpis.length; i++) {
    const col = (i % 4) + 1
    const rowN = kr + Math.floor(i / 4)
    const cell = ws.getRow(rowN).getCell(col)
    const [k, vv] = kpis[i]
    cell.value = { richText: [
      { text: `${k}\n`, font: { size: 8, color: { argb: GREY }, bold: false } },
      { text: vv, font: { size: 11, color: { argb: NAVY }, bold: true } },
    ] }
    cell.alignment = { wrapText: true, vertical: 'middle' }
    fill(cell, LIGHT)
    cell.border = { top: { style: 'thin', color: { argb: STEEL } }, left: { style: 'thin', color: { argb: STEEL } }, right: { style: 'thin', color: { argb: STEEL } }, bottom: { style: 'thin', color: { argb: STEEL } } }
    ws.getRow(rowN).height = 30
  }
  r = kr + Math.ceil(kpis.length / 4) + 1

  ws.getCell(`A${r}`).value = 'Red-team scorecard: ' + F._meta.redteam_scorecard
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: GREY } }
  r += 2
  ws.mergeCells(`A${r}:F${r + 2}`)
  const m = ws.getCell(`A${r}`)
  m.value = 'Methodology: ' + F._meta.methodology
  m.alignment = { wrapText: true, vertical: 'top' }
  m.font = { size: 8.5, italic: true, color: { argb: GREY } }
}

// ===================================================================
// SHEET 2 — RED-FLAG REGISTER
// ===================================================================
function register() {
  const ws = wb.addWorksheet('Red-Flag Register', { properties: { tabColor: { argb: RED } }, views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }] })
  setCols(ws, [6, 40, 11, 60, 40, 16])
  titleBlock(ws, 'Red-Flag Register', 'Severity-ranked forensic findings (red flags) + offsetting positives — every item primary-doc sourced', 'A1:F2')
  headerRow(ws, 4, ['ID', 'Finding', 'Severity', 'Detail', 'Evidence', 'Source'])
  const order = ['critical', 'high', 'medium', 'low']
  const flags = (F.red_flags as any[]).slice().sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
  let r = 5
  for (const f of flags) {
    const row = ws.getRow(r)
    row.getCell(1).value = f.id
    row.getCell(2).value = f.title
    row.getCell(2).font = { bold: true, size: 10, color: { argb: INK } }
    const sev = row.getCell(3)
    sev.value = f.severity.toUpperCase()
    sev.font = { bold: true, color: { argb: WHITE }, size: 9 }
    fill(sev, sevColor[f.severity] || GREY)
    sev.alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(4).value = f.detail
    row.getCell(5).value = f.evidence
    row.getCell(6).value = f.source
    ;[2, 4, 5, 6].forEach(c => { row.getCell(c).alignment = { wrapText: true, vertical: 'top' } })
    row.getCell(4).font = { size: 9.5 }
    row.getCell(5).font = { size: 9, color: { argb: BLUE } }
    row.getCell(6).font = { size: 9, italic: true, color: { argb: GREY } }
    row.height = Math.max(46, Math.ceil(f.detail.length / 55) * 14)
    r++
  }
  // positives section
  r++
  ws.mergeCells(`A${r}:F${r}`)
  const ph = ws.getCell(`A${r}`)
  ph.value = 'OFFSETTING POSITIVES'
  ph.font = { bold: true, color: { argb: WHITE } }
  fill(ph, GREEN)
  ph.alignment = { indent: 1, vertical: 'middle' }
  ws.getRow(r).height = 22
  r++
  for (const p of F.positives as any[]) {
    const row = ws.getRow(r)
    row.getCell(1).value = p.id
    row.getCell(2).value = p.title
    row.getCell(2).font = { bold: true, size: 10, color: { argb: GREEN } }
    const sev = row.getCell(3)
    sev.value = 'POSITIVE'
    sev.font = { bold: true, color: { argb: WHITE }, size: 9 }
    fill(sev, GREEN)
    sev.alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(4).value = p.detail
    row.getCell(5).value = p.evidence
    row.getCell(6).value = p.source
    ;[2, 4, 5, 6].forEach(c => { row.getCell(c).alignment = { wrapText: true, vertical: 'top' } })
    row.getCell(4).font = { size: 9.5 }
    row.getCell(5).font = { size: 9, color: { argb: BLUE } }
    row.getCell(6).font = { size: 9, italic: true, color: { argb: GREY } }
    row.height = Math.max(40, Math.ceil(p.detail.length / 55) * 14)
    r++
  }
}

// ===================================================================
// SHEET 3 — RESTATED P&L (NBFC FORMAT) + PAT BRIDGE
// ===================================================================
function restatedPL() {
  const ws = wb.addWorksheet('Restated P&L', { properties: { tabColor: { argb: BLUE } }, views: [{ showGridLines: false }] })
  setCols(ws, [44, 16, 16, 12, 52])
  titleBlock(ws, 'Restated P&L — NBFC format', 'Re-cast into a lender P&L (NII / PPOP / true credit cost). Screener.in manufacturing-template lines discarded. Rs crore.', 'A1:E2')
  headerRow(ws, 4, ['Line item', 'FY26', 'FY25', 'YoY %', 'Forensic note'])

  const c = anchors.consolidated_PL_INRcr
  const g = (k: string, y: string) => c[k][y] as number
  const NII26 = g('interest_income', 'FY26') - g('finance_costs', 'FY26')
  const NII25 = g('interest_income', 'FY25') - g('finance_costs', 'FY25')
  const tni26 = NII26 + g('fees_commission', 'FY26') + g('net_gain_fair_value', 'FY26') + g('dividend_income', 'FY26') + g('other_income', 'FY26')
  const tni25 = NII25 + g('fees_commission', 'FY25') + g('net_gain_fair_value', 'FY25') + g('dividend_income', 'FY25') + g('other_income', 'FY25')
  const opex26 = g('employee_benefits', 'FY26') + g('depreciation_amort', 'FY26') + g('other_expenses', 'FY26')
  const opex25 = g('employee_benefits', 'FY25') + g('depreciation_amort', 'FY25') + g('other_expenses', 'FY25')
  const ppop26 = tni26 - opex26, ppop25 = tni25 - opex25
  const cc26 = g('impairment_fin_instruments', 'FY26') + g('net_loss_derecognition_amortised_cost', 'FY26')
  const cc25 = g('impairment_fin_instruments', 'FY25') + g('net_loss_derecognition_amortised_cost', 'FY25')

  type Row = [string, number | null, number | null, string, boolean?]
  const rows: Row[] = [
    ['Interest income', g('interest_income', 'FY26'), g('interest_income', 'FY25'), ''],
    ['Less: Finance costs', -g('finance_costs', 'FY26'), -g('finance_costs', 'FY25'), ''],
    ['= Net Interest Income (NII)', NII26, NII25, 'Core spread +14.2%; outpaced funding-cost growth', true],
    ['Fees & commission income', g('fees_commission', 'FY26'), g('fees_commission', 'FY25'), '+14.5% — LAGS loan growth +25.6%; fee yield compressing'],
    ['Net gain on fair value (treasury)', g('net_gain_fair_value', 'FY26'), g('net_gain_fair_value', 'FY25'), 'Treasury tailwind FADED (-65%)'],
    ['Dividend + other income', g('dividend_income', 'FY26') + g('other_income', 'FY26'), g('dividend_income', 'FY25') + g('other_income', 'FY25'), ''],
    ['= Total net income', tni26, tni25, '', true],
    ['Employee benefits', -g('employee_benefits', 'FY26'), -g('employee_benefits', 'FY25'), ''],
    ['Depreciation & amortisation', -g('depreciation_amort', 'FY26'), -g('depreciation_amort', 'FY25'), '+51% — gold/branch/tech buildout'],
    ['Other expenses', -g('other_expenses', 'FY26'), -g('other_expenses', 'FY25'), ''],
    ['= Pre-provision operating profit (PPOP)', ppop26, ppop25, '', true],
    ['Impairment on financial instruments', -g('impairment_fin_instruments', 'FY26'), -g('impairment_fin_instruments', 'FY25'), 'FLAT YoY despite +25.6% loans — the headline'],
    ['Net loss on derecognition (write-offs)', -g('net_loss_derecognition_amortised_cost', 'FY26'), -g('net_loss_derecognition_amortised_cost', 'FY25'), 'DOUBLED — true credit cost routed off the impairment line'],
    ['= TRUE combined credit cost', -cc26, -cc25, 'ROSE +11.2% (2.60% vs 2.06% of avg loans)', true],
    ['= PBT before exceptional', g('PBT_before_exceptional', 'FY26'), g('PBT_before_exceptional', 'FY25'), '', true],
    ['Exceptional (New Labour Codes)', g('exceptional_items', 'FY26'), g('exceptional_items', 'FY25'), 'One-time CHARGE (conservative), net of tax -21.33'],
    ['= Profit before tax', g('PBT', 'FY26'), g('PBT', 'FY25'), '', true],
    ['Tax', -g('tax_total', 'FY26'), -g('tax_total', 'FY25'), 'Eff. rate ~25.4% (up from ~24.3%)'],
    ['= Profit after tax', g('PAT', 'FY26'), g('PAT', 'FY25'), '', true],
    ['PAT attributable to owners', c.PAT_owners.FY26, c.PAT_owners.FY25, '+12.8%', true],
  ]
  let r = 5
  for (const [label, v26, v25, note, isSub] of rows) {
    const row = ws.getRow(r)
    row.getCell(1).value = label
    row.getCell(1).font = { bold: !!isSub, size: 10, color: { argb: isSub ? NAVY : INK } }
    if (isSub) fill(row.getCell(1), PALE)
    if (v26 !== null) { row.getCell(2).value = v26; row.getCell(2).numFmt = num0 }
    if (v25 !== null) { row.getCell(3).value = v25; row.getCell(3).numFmt = num0 }
    if (v26 !== null && v25 !== null && v25 !== 0) {
      const yoy = (Math.abs(v26) - Math.abs(v25)) / Math.abs(v25)
      row.getCell(4).value = yoy
      row.getCell(4).numFmt = '+0.0%;-0.0%'
      row.getCell(4).font = { size: 9, color: { argb: yoy >= 0 ? GREEN : RED } }
    }
    row.getCell(5).value = note
    row.getCell(5).font = { size: 9, italic: true, color: { argb: note.includes('DOUBLED') || note.includes('ROSE') || note.includes('FLAT') || note.includes('LAGS') || note.includes('FADED') ? RED : GREY } }
    row.getCell(5).alignment = { wrapText: true, vertical: 'middle' }
    ;[2, 3].forEach(cc => { if (isSub) row.getCell(cc).font = { bold: true, size: 10, color: { argb: NAVY } } })
    if (isSub) { fill(row.getCell(2), PALE); fill(row.getCell(3), PALE); fill(row.getCell(4), PALE); fill(row.getCell(5), PALE) }
    row.height = 18
    r++
  }
  r++
  ws.getCell(`A${r}`).value = 'PAT-before-exceptional (owners): Rs 3,002.51 cr vs 2,643.66 cr = +13.6%. The clean number grew faster than reported PAT because the exceptional is a charge.'
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: GREY } }
  ws.mergeCells(`A${r}:E${r}`)
  ws.getCell(`A${r}`).alignment = { wrapText: true }
}

// ===================================================================
// SHEET 4 — DuPont / RETURNS BRIDGE
// ===================================================================
function dupont() {
  const ws = wb.addWorksheet('DuPont & Returns', { properties: { tabColor: { argb: BLUE } }, views: [{ showGridLines: false }] })
  setCols(ws, [46, 16, 16, 14, 46])
  titleBlock(ws, 'DuPont decomposition (RoA → RoE)', 'As % of average total assets. RoA × leverage = RoE. Reconciles exactly to reported returns.', 'A1:E2')
  headerRow(ws, 4, ['Component (% of avg total assets)', 'FY26', 'FY25', 'Δ bps', 'Note'])

  const c = anchors.consolidated_PL_INRcr, bs = anchors.consolidated_balance_sheet_INRcr
  const avgA = (bs.total_assets.FY26 + bs.total_assets.FY25) / 2
  const avgA25 = bs.total_assets.FY25 // approx prior avg unavailable; use FY25 as denom proxy for FY25 ratios
  const g = (k: string, y: string) => c[k][y] as number
  const NII26 = g('interest_income', 'FY26') - g('finance_costs', 'FY26')
  const NII25 = g('interest_income', 'FY25') - g('finance_costs', 'FY25')
  const opex26 = g('employee_benefits', 'FY26') + g('depreciation_amort', 'FY26') + g('other_expenses', 'FY26')
  const opex25 = g('employee_benefits', 'FY25') + g('depreciation_amort', 'FY25') + g('other_expenses', 'FY25')
  const cc26 = g('impairment_fin_instruments', 'FY26') + g('net_loss_derecognition_amortised_cost', 'FY26')
  const cc25 = g('impairment_fin_instruments', 'FY25') + g('net_loss_derecognition_amortised_cost', 'FY25')
  const fees26 = g('fees_commission', 'FY26') + g('net_gain_fair_value', 'FY26') + g('dividend_income', 'FY26') + g('other_income', 'FY26')
  const fees25 = g('fees_commission', 'FY25') + g('net_gain_fair_value', 'FY25') + g('dividend_income', 'FY25') + g('other_income', 'FY25')

  type DR = [string, number, number, string]
  const a26 = avgA, a25 = avgA25
  const rows: DR[] = [
    ['NII / avg assets', NII26 / a26, NII25 / a25, 'Core spread'],
    ['Fees + treasury + other / avg assets', fees26 / a26, fees25 / a25, 'Treasury faded'],
    ['Operating expenses / avg assets', -opex26 / a26, -opex25 / a25, 'Opex-to-AUM ~4.15%'],
    ['True credit cost (incl. write-offs) / avg assets', -cc26 / a26, -cc25 / a25, 'Combined cost rose +11%'],
    ['Exceptional / avg assets', g('exceptional_items', 'FY26') / a26, 0, 'One-time'],
    ['Tax / avg assets', -g('tax_total', 'FY26') / a26, -g('tax_total', 'FY25') / a25, ''],
    ['= Return on Assets (RoA)', c.PAT_owners.FY26 / a26, c.PAT_owners.FY25 / a25, 'On avg total assets'],
  ]
  let r = 5
  for (const [label, v26, v25, note] of rows) {
    const row = ws.getRow(r)
    const isRoA = label.includes('RoA')
    row.getCell(1).value = label
    row.getCell(1).font = { bold: isRoA, color: { argb: isRoA ? NAVY : INK }, size: 10 }
    row.getCell(2).value = v26; row.getCell(2).numFmt = pct2 + '%'
    row.getCell(3).value = v25; row.getCell(3).numFmt = pct2 + '%'
    row.getCell(4).value = (v26 - v25) * 10000; row.getCell(4).numFmt = '+0;-0'
    row.getCell(4).font = { size: 9, color: { argb: (v26 - v25) >= 0 ? GREEN : RED } }
    row.getCell(5).value = note; row.getCell(5).font = { italic: true, size: 9, color: { argb: GREY } }
    if (isRoA) { [1, 2, 3, 4, 5].forEach(cc => fill(row.getCell(cc), PALE)) }
    r++
  }
  r++
  const avgNW = (bs.networth_consol.FY26 + bs.networth_consol.FY25) / 2
  const lev = avgA / avgNW
  const roe = c.PAT_owners.FY26 / avgNW
  ws.getCell(`A${r}`).value = 'Leverage (avg assets / avg equity)'
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } }
  ws.getCell(`B${r}`).value = lev; ws.getCell(`B${r}`).numFmt = '0.00"x"'
  ws.getCell(`E${r}`).value = 'D/E 3.93x'; ws.getCell(`E${r}`).font = { italic: true, size: 9, color: { argb: GREY } }
  r++
  ws.getCell(`A${r}`).value = '= Return on Equity (RoE) = RoA × leverage'
  ws.getCell(`A${r}`).font = { bold: true, size: 11, color: { argb: NAVY } }
  ws.getCell(`B${r}`).value = roe; ws.getCell(`B${r}`).numFmt = pct2 + '%'; ws.getCell(`B${r}`).font = { bold: true, size: 11, color: { argb: NAVY } }
  ;[1, 2].forEach(cc => fill(ws.getRow(r).getCell(cc), PALE))
  ws.getCell(`E${r}`).value = 'Below ~13-14% cost of equity → franchise value-neutral at current returns'
  ws.getCell(`E${r}`).font = { italic: true, size: 9, color: { argb: RED } }
  ws.getCell(`E${r}`).alignment = { wrapText: true }
  r += 2
  ws.getCell(`A${r}`).value = 'Note: FY25 ratios use the FY25 closing asset base as denominator proxy (single-year file); FY26 uses the 2-point average. The RoA on avg total assets (2.27%) sits ~10bps below management’s reported 2.37% (different denominator) and ~50bps below the 2.8% target.'
  ws.getCell(`A${r}`).font = { italic: true, size: 8.5, color: { argb: GREY } }
  ws.mergeCells(`A${r}:E${r + 1}`)
  ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' }
}

// ===================================================================
// SHEET 5 — ASSET QUALITY & PROVISIONING
// ===================================================================
function assetQuality() {
  const ws = wb.addWorksheet('Asset Quality & Provisioning', { properties: { tabColor: { argb: AMBER } }, views: [{ showGridLines: false }] })
  setCols(ws, [40, 18, 18, 60])
  titleBlock(ws, 'Asset Quality & Provisioning', 'The forensic core: coverage was RELEASED, not strengthened, into a rising unsecured mix.', 'A1:D2')
  headerRow(ws, 4, ['Metric', 'FY26 / latest', 'Prior', 'Forensic read'])
  type AR = [string, string, string, string, string?]
  const rows: AR[] = [
    ['Gross Stage 3 (standalone)', '2.88%', '3.29% (Q4FY25)', 'Ratio down BUT absolute gross Stage-3 rose +9.5% on +25.6% book; flattered by write-offs', 'amber'],
    ['Net Stage 3', '0.96%', '0.92% (QoQ)', 'Absolute net Stage-3 rose +29% (746.83->965.39cr, audited) — net stress UP', 'red'],
    ['Stage-3 PCR (audited)', '68.1%', '72.97%', 'CUT — AR Note 45: Stage-3 ECL 2,062 vs gross 3,027; overlay release', 'red'],
    ['Total ECL allowance (audited)', 'Rs 3,458cr (2.89%)', 'Rs 3,537cr (3.72%)', 'FELL on a +25.6% gross book — coverage materially thinner', 'red'],
    ['Macro-prudential buffer (RGL & MFI, audited)', 'Rs NIL', 'Rs 575cr', 'ENTIRE buffer unwound to zero — AR p.357 footnote', 'red'],
    ['Stage-1 PCR (performing 96%)', '0.80%', '0.52%', 'RAISED — forward day-1 buffer (positive, but not impaired-book coverage)', 'green'],
    ['Loans written off (audited)', 'Rs 2,413cr', 'Rs 2,382cr', '~2% of gross — the charge-off lever holding GS3 at 2.88%', 'red'],
    ['Impairment (P&L)', 'Rs 2,184cr', 'Rs 2,193cr', 'FLAT despite +25.6% loans — headline "credit cost falling"', 'amber'],
    ['Net loss on derecognition (write-offs)', 'Rs 562cr', 'Rs 275cr', 'DOUBLED — true credit cost routed here', 'red'],
    ['TRUE combined credit cost', 'Rs 2,746cr (2.60%)', 'Rs 2,468cr (2.49%)', 'ROSE +11.2%; impairment-only (2.06%) hides 54bps', 'red'],
    ['Unsecured retail loans (audited)', 'Rs 62,013cr (~53%)', 'Rs 51,579cr', 'Grew +20% — coverage cut INTO a riskier mix', 'amber'],
    ['NPA sold to ARCs', 'Rs 128cr principal', '—', 'Immaterial; sold ABOVE book at a gain — not the lever', 'green'],
    ['Contingent liabilities (audited)', 'Rs 308cr', 'Rs 326cr', 'Small & flat — no hidden off-B/S exposure', 'green'],
    ['Project finance under implementation', 'Rs 1,006cr', '—', 'Of which resolution plan FAILED on Rs 219cr', 'amber'],
    ['SR / wholesale tail (now FVTPL)', '~Rs 7,000cr', '—', 'Carried at fair value through P&L; 3-4 yr drag; excl. from RoA target', 'amber'],
  ]
  let r = 5
  for (const [m, v, p, note, tag] of rows) {
    const row = ws.getRow(r)
    row.getCell(1).value = m; row.getCell(1).font = { bold: true, size: 10 }
    row.getCell(2).value = v; row.getCell(2).font = { bold: true, size: 10, color: { argb: NAVY } }
    row.getCell(3).value = p; row.getCell(3).font = { size: 9, color: { argb: GREY } }
    row.getCell(4).value = note; row.getCell(4).alignment = { wrapText: true, vertical: 'middle' }
    row.getCell(4).font = { size: 9.5 }
    const col = tag === 'red' ? RED : tag === 'amber' ? AMBER : tag === 'green' ? GREEN : STEEL
    const bar = row.getCell(2)
    bar.border = { left: { style: 'thick', color: { argb: col } } }
    row.height = 30
    r++
  }
}

// ===================================================================
// SHEET 5b — ECL STAGE MOVEMENT (AUDITED, from annual report)
// ===================================================================
function eclMovement() {
  const ws = wb.addWorksheet('ECL Movement (Audited)', { properties: { tabColor: { argb: AMBER } }, views: [{ showGridLines: false }] })
  setCols(ws, [40, 16, 16, 16, 16])
  titleBlock(ws, 'ECL Stage 1/2/3 movement — AUDITED', 'Consolidated, from Annual Report Note 45 (pp.357-358). Rs crore. This is the gap the results pack could not show.', 'A1:E2')
  const ec = AR.ecl_loans_consolidated
  const gc = ec.gross_carrying_by_stage, al = ec.ecl_allowance_by_stage

  // Block 1: gross + ECL + PCR by stage
  headerRow(ws, 4, ['As at 31-Mar', 'Stage 1', 'Stage 2', 'Stage 3', 'Total'])
  let r = 5
  const block: [string, any][] = [
    ['Gross carrying — FY26', gc.FY26],
    ['Gross carrying — FY25', gc.FY25],
    ['ECL allowance — FY26', al.FY26],
    ['ECL allowance — FY25', al.FY25],
  ]
  for (const [label, obj] of block) {
    const row = ws.getRow(r)
    row.getCell(1).value = label; row.getCell(1).font = { bold: true, size: 10 }
    row.getCell(2).value = obj.stage1; row.getCell(3).value = obj.stage2; row.getCell(4).value = obj.stage3; row.getCell(5).value = obj.total
    ;[2, 3, 4, 5].forEach(c => { row.getCell(c).numFmt = num0; row.getCell(c).font = { size: 10 } })
    if (label.includes('FY26')) [1, 2, 3, 4, 5].forEach(c => fill(row.getCell(c), LIGHT))
    r++
  }
  // PCR row
  const pcr26 = al.FY26.stage3 / gc.FY26.stage3, pcr25 = al.FY25.stage3 / gc.FY25.stage3
  const pr = ws.getRow(r)
  pr.getCell(1).value = 'Stage-3 PCR (ECL/gross)'; pr.getCell(1).font = { bold: true, color: { argb: NAVY } }
  pr.getCell(4).value = pcr26; pr.getCell(4).numFmt = '0.0%'; pr.getCell(4).font = { bold: true, color: { argb: RED } }
  ;[1, 2, 3, 4, 5].forEach(c => fill(pr.getCell(c), PALE))
  pr.getCell(5).value = `FY25: ${(pcr25 * 100).toFixed(1)}% → FY26: ${(pcr26 * 100).toFixed(1)}%`
  pr.getCell(5).font = { size: 9, italic: true, color: { argb: RED } }
  r += 2

  // Block 2: key movement / forensic levers
  ws.mergeCells(`A${r}:E${r}`)
  const mh = ws.getCell(`A${r}`); mh.value = 'KEY MOVEMENT (FY26) — the forensic levers'; mh.font = { bold: true, color: { argb: WHITE } }; fill(mh, AMBER); mh.alignment = { indent: 1, vertical: 'middle' }
  ws.getRow(r).height = 20
  r++
  const levers: [string, string, string][] = [
    ['Macro-prudential provision (RGL & MFI)', `Rs ${ec.macro_prudential_provision.FY25}cr → Rs NIL`, 'Entire MFI buffer unwound to zero (footnote p.357)'],
    ['Provision release on existing assets (net of recovery)', `Rs ${Math.abs(ec.provision_release_on_existing_assets_net_of_recovery_FY26)}cr released`, 'Direct boost to FY26 PBT'],
    ['Loans written off', `Rs ${ec.write_off_FY26.toLocaleString('en-IN')}cr (FY25 ${ec.write_off_FY25.toLocaleString('en-IN')})`, '~2% charge-off — holds GS3 at 2.88%'],
    ['Total ECL allowance', `Rs ${al.FY25.total.toLocaleString('en-IN')} → ${al.FY26.total.toLocaleString('en-IN')}cr`, `FELL though gross loans +25.6% (coverage ${ec.derived.total_ECL_coverage_FY25_pct}% → ${ec.derived.total_ECL_coverage_FY26_pct}%)`],
    ['Absolute gross Stage-3', `+${ec.derived.gross_stage3_yoy_pct}%`, 'Rupee stress rose even as the ratio fell'],
    ['Absolute net Stage-3', `+${ec.derived.net_stage3_yoy_pct}%`, 'Net of provisions, bad loans up sharply'],
    ['Gold acquisition added to Stage-1 gross', `Rs ${ec.business_combination_gold_added_to_stage1_gross.toLocaleString('en-IN')}cr`, 'Inorganic (Paul Merchants slump sale)'],
  ]
  for (const [k, v, note] of levers) {
    const row = ws.getRow(r)
    row.getCell(1).value = k; row.getCell(1).font = { bold: true, size: 9.5 }
    ws.mergeCells(`B${r}:C${r}`)
    row.getCell(2).value = v; row.getCell(2).font = { bold: true, size: 10, color: { argb: NAVY } }
    ws.mergeCells(`D${r}:E${r}`)
    row.getCell(4).value = note; row.getCell(4).font = { size: 9, italic: true, color: { argb: GREY } }; row.getCell(4).alignment = { wrapText: true, vertical: 'middle' }
    row.height = 26
    r++
  }
  r++
  ws.mergeCells(`A${r}:E${r + 2}`)
  const kb = ws.getCell(`A${r}`)
  kb.value = `Auditor view: ECL (incl. the management overlay) is a formal KEY AUDIT MATTER (${AR.kams.page}); joint auditors tested PD/LGD, staging and macro overlays and issued an UNMODIFIED opinion. Related-party with parent L&T is modest/transparent (brand-license fee Rs${AR.related_party_LandT.brand_license_fee_to_LT.FY26}cr). The provisioning choices are aggressive but made within an audited, scrutinised framework.`
  kb.alignment = { wrapText: true, vertical: 'top' }; kb.font = { size: 9.5, color: { argb: INK } }; fill(kb, LIGHT)
}

// ===================================================================
// SHEET 6 — MGMT vs AUDITED  +  SELL-SIDE & VALUATION
// ===================================================================
function mgmtVsAudited() {
  const ws = wb.addWorksheet('Claimed vs Audited', { properties: { tabColor: { argb: RED } }, views: [{ showGridLines: false }] })
  setCols(ws, [26, 34, 44, 36])
  titleBlock(ws, 'Management headline vs Verified reality', 'Where the narrative and the audited/forensic numbers diverge.', 'A1:D2')
  headerRow(ws, 4, ['Metric', 'Management headline', 'Forensic / audited reality', 'Read'])
  let r = 5
  for (const m of F.mgmt_vs_audited as any[]) {
    const row = ws.getRow(r)
    row.getCell(1).value = m.metric; row.getCell(1).font = { bold: true, size: 10 }
    row.getCell(2).value = m.headline; row.getCell(2).font = { size: 9.5, color: { argb: GREY } }
    row.getCell(3).value = m.verified; row.getCell(3).font = { size: 9.5, color: { argb: RED } }
    row.getCell(4).value = m.read; row.getCell(4).font = { size: 9.5, italic: true }
    ;[2, 3, 4].forEach(cc => row.getCell(cc).alignment = { wrapText: true, vertical: 'top' })
    row.height = 40
    r++
  }
  r += 1
  ws.mergeCells(`A${r}:D${r}`)
  const sh = ws.getCell(`A${r}`)
  sh.value = 'SELL-SIDE TRIANGULATION & VALUATION'
  sh.font = { bold: true, color: { argb: WHITE } }; fill(sh, NAVY); sh.alignment = { indent: 1, vertical: 'middle' }
  ws.getRow(r).height = 22
  r++
  headerRow(ws, r, ['House / rating', 'TP & basis', 'RoA path', 'RoE path / note'])
  r++
  for (const s of F.sellside as any[]) {
    const row = ws.getRow(r)
    row.getCell(1).value = `${s.house} — ${s.rating}`
    row.getCell(1).font = { bold: true, size: 10, color: { argb: s.rating === 'BUY' ? GREEN : AMBER } }
    row.getCell(2).value = `Rs ${s.tp} (+${s.upside_pct}%) · ${s.target_basis}`
    row.getCell(3).value = s.roa_path
    row.getCell(4).value = `${s.roe_path}. ${s.note}`
    ;[2, 3, 4].forEach(cc => { row.getCell(cc).alignment = { wrapText: true, vertical: 'top' }; row.getCell(cc).font = { size: 9 } })
    row.height = 48
    r++
  }
  r++
  ws.mergeCells(`A${r}:D${r + 3}`)
  const vbox = ws.getCell(`A${r}`)
  vbox.value = `VALUATION VERDICT — ${F.valuation.gordon_note}\n\n${F.valuation.read}`
  vbox.alignment = { wrapText: true, vertical: 'top' }
  vbox.font = { size: 10, color: { argb: INK } }
  fill(vbox, PALE)
  vbox.border = { left: { style: 'thick', color: { argb: RED } } }
}

// ===================================================================
// SHEET 7 — RED-TEAM VERDICTS
// ===================================================================
function redteam() {
  const ws = wb.addWorksheet('Red-Team Verdicts', { properties: { tabColor: { argb: NAVY } }, views: [{ showGridLines: false }] })
  setCols(ws, [50, 22, 56, 50])
  titleBlock(ws, 'Adversarial Red-Team — bull pillars stress-tested', '3 independent skeptics per pillar refute using only primary docs; majority verdict shown. ' + F._meta.redteam_scorecard, 'A1:D2')
  headerRow(ws, 4, ['Bull pillar', 'Majority verdict', 'Why it fails / survives', 'Strongest refutation'])
  let r = 5
  for (const p of F.pillars as any[]) {
    const row = ws.getRow(r)
    row.getCell(1).value = p.pillar; row.getCell(1).font = { bold: true, size: 10 }
    const vd = row.getCell(2)
    vd.value = `${p.verdict}\n(${p.votes})`
    vd.font = { bold: true, color: { argb: WHITE }, size: 9 }
    fill(vd, verdictColor[p.verdict] || GREY)
    vd.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    row.getCell(3).value = p.summary
    row.getCell(4).value = p.refutation
    ;[1, 3, 4].forEach(cc => row.getCell(cc).alignment = { wrapText: true, vertical: 'top' })
    row.getCell(3).font = { size: 9.5 }
    row.getCell(4).font = { size: 9, color: { argb: RED } }
    row.height = Math.max(56, Math.ceil(p.summary.length / 50) * 13)
    r++
  }
}

// ===================================================================
// SHEET 7b — AUDIT, CONTROLS & REGULATORY STANDING
// ===================================================================
function governance() {
  const ws = wb.addWorksheet('Audit · Controls · Regulatory', { properties: { tabColor: { argb: GREEN } }, views: [{ showGridLines: false }] })
  setCols(ws, [34, 14, 64, 24])
  titleBlock(ws, 'Audit, Controls & Regulatory Standing', 'From the annual report: CARO, Internal Financial Controls, RBI inspection, penalties, ratings, fraud. The integrity counterweight.', 'A1:D2')
  // framing callout
  ws.mergeCells('A4:D6')
  const fv = ws.getCell('A4')
  fv.value = F.governance_verdict
  fv.alignment = { wrapText: true, vertical: 'top' }
  fv.font = { size: 10, color: { argb: INK }, bold: false }
  fill(fv, PALE)
  fv.border = { left: { style: 'thick', color: { argb: GREEN } } }
  headerRow(ws, 8, ['Item', 'Status', 'Detail', 'Source'])
  const statusColor: Record<string, string> = { CLEAN: GREEN, STRONG: GREEN, MINOR: STEEL, WATCH: AMBER, ADVERSE: RED }
  let r = 9
  for (const g of F.governance_controls as any[]) {
    const row = ws.getRow(r)
    row.getCell(1).value = g.item; row.getCell(1).font = { bold: true, size: 9.5 }
    const sc = row.getCell(2)
    sc.value = g.status
    sc.font = { bold: true, color: { argb: WHITE }, size: 9 }
    fill(sc, statusColor[g.status] || GREY)
    sc.alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(3).value = g.detail; row.getCell(3).font = { size: 9.5 }
    row.getCell(4).value = g.source; row.getCell(4).font = { size: 9, italic: true, color: { argb: GREY } }
    ;[1, 3, 4].forEach(c => row.getCell(c).alignment = { wrapText: true, vertical: 'top' })
    row.height = Math.max(34, Math.ceil(g.detail.length / 62) * 14)
    r++
  }
}

// ===================================================================
// SHEET 8 — RECONCILIATION & DATA-INTEGRITY LOG
// ===================================================================
function reconciliation() {
  const ws = wb.addWorksheet('Reconciliation & Integrity', { properties: { tabColor: { argb: GREEN } }, views: [{ showGridLines: false }] })
  setCols(ws, [34, 18, 18, 14, 40])
  titleBlock(ws, 'Reconciliation & Data-Integrity Log', 'Audited vs screener.in cross-check, plus the integrity findings.', 'A1:E2')

  // reconciliation table: audited vs screener (Mar 2026)
  headerRow(ws, 4, ['Metric (FY26)', 'Audited', 'Screener.in', 'Match', 'Note'])
  function screenerVal(sheet: string, label: string, col: number): number | null {
    const rows = screener[sheet] as any[][]
    if (!rows) return null
    for (const row of rows) {
      if (row && typeof row[0] === 'string' && row[0].trim() === label) {
        const v = row[col]
        return typeof v === 'number' ? v : null
      }
    }
    return null
  }
  // Mar 2026 is the last column. header row index 0: [dates, Mar2017..Mar2026] -> Mar2026 at index 10
  const COL26 = 10
  const recos: [string, number, string, string, string][] = [
    ['Net Profit (PAT)', anchors.consolidated_PL_INRcr.PAT.FY26, 'Profit&Loss', 'Net Profit', ''],
    ['Total income', anchors.consolidated_PL_INRcr.total_income.FY26, 'Profit&Loss', 'Net Sales', 'screener "Net Sales" = total revenue from ops'],
  ]
  let r = 5
  for (const [metric, audited, sheet, label, note] of recos) {
    const sv = screenerVal(sheet, label, COL26)
    const row = ws.getRow(r)
    row.getCell(1).value = metric; row.getCell(1).font = { bold: true, size: 10 }
    row.getCell(2).value = audited; row.getCell(2).numFmt = num0
    row.getCell(3).value = sv === null ? 'n/a' : sv; if (sv !== null) row.getCell(3).numFmt = num0
    const match = sv !== null && Math.abs(sv - audited) / audited < 0.02
    const mc = row.getCell(4)
    mc.value = sv === null ? '—' : match ? 'OK' : 'CHECK'
    mc.font = { bold: true, color: { argb: WHITE }, size: 9 }
    fill(mc, sv === null ? GREY : match ? GREEN : AMBER)
    mc.alignment = { horizontal: 'center' }
    row.getCell(5).value = note; row.getCell(5).font = { size: 9, italic: true, color: { argb: GREY } }; row.getCell(5).alignment = { wrapText: true }
    r++
  }
  r++
  ws.getCell(`A${r}`).value = 'screener.in uses a MANUFACTURING template force-fit on an NBFC → Inventory Days, Power & Fuel, EV/EBITDA, OPM%, Current/Quick Ratio, Fixed-Asset Turnover are INVALID for a lender and were discarded. Only PAT/equity/borrowings/total-assets/dividend used.'
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: RED } }
  ws.mergeCells(`A${r}:E${r + 1}`); ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' }
  r += 3
  ws.mergeCells(`A${r}:E${r}`)
  const lh = ws.getCell(`A${r}`); lh.value = 'DATA-INTEGRITY LOG'; lh.font = { bold: true, color: { argb: WHITE } }; fill(lh, GREEN); lh.alignment = { indent: 1, vertical: 'middle' }
  ws.getRow(r).height = 20
  r++
  for (const item of F.data_integrity_log as string[]) {
    ws.mergeCells(`A${r}:E${r}`)
    const cell = ws.getCell(`A${r}`)
    cell.value = '• ' + item
    cell.font = { size: 9.5, color: { argb: INK } }
    cell.alignment = { wrapText: true, vertical: 'top' }
    ws.getRow(r).height = Math.max(16, Math.ceil(item.length / 110) * 14)
    r++
  }
}

// ===================================================================
// SHEET 9 — SOURCE INDEX & MONITORABLES
// ===================================================================
function sourcesSheet() {
  const ws = wb.addWorksheet('Sources & Monitorables', { properties: { tabColor: { argb: GREY } }, views: [{ showGridLines: false }] })
  setCols(ws, [50, 30, 22])
  titleBlock(ws, 'Source Index & Key Monitorables', 'Document provenance + what to watch next.', 'A1:C2')
  headerRow(ws, 4, ['Document', 'Role', 'Type'])
  let r = 5
  for (const s of F.sources as any[]) {
    const row = ws.getRow(r)
    row.getCell(1).value = s.doc; row.getCell(1).font = { size: 10 }
    row.getCell(2).value = s.role; row.getCell(2).font = { size: 9.5 }
    const tc = row.getCell(3); tc.value = s.type
    tc.font = { size: 9, bold: true, color: { argb: WHITE } }
    fill(tc, s.type === 'audited' ? GREEN : s.type === 'sell-side' ? AMBER : s.type.indexOf('mgmt') >= 0 ? STEEL : GREY)
    tc.alignment = { horizontal: 'center' }
    ;[1, 2].forEach(cc => row.getCell(cc).alignment = { wrapText: true, vertical: 'middle' })
    row.height = 26
    r++
  }
  r += 1
  ws.mergeCells(`A${r}:C${r}`)
  const mh = ws.getCell(`A${r}`); mh.value = 'KEY MONITORABLES'; mh.font = { bold: true, color: { argb: WHITE } }; fill(mh, NAVY); mh.alignment = { indent: 1, vertical: 'middle' }
  ws.getRow(r).height = 20
  r++
  for (const m of F.monitorables as string[]) {
    ws.mergeCells(`A${r}:C${r}`)
    const cell = ws.getCell(`A${r}`)
    cell.value = '▸ ' + m
    cell.font = { size: 10, color: { argb: INK } }
    cell.alignment = { wrapText: true, vertical: 'top' }
    ws.getRow(r).height = Math.max(18, Math.ceil(m.length / 90) * 14)
    r++
  }
}

cover()
register()
restatedPL()
dupont()
assetQuality()
eclMovement()
mgmtVsAudited()
redteam()
governance()
reconciliation()
sourcesSheet()

wb.xlsx.writeFile(OUT).then(() => {
  console.log('WROTE:', OUT)
  console.log('Sheets:', wb.worksheets.map(w => w.name).join(' | '))
}).catch(e => { console.error('FAILED:', e); process.exit(1) })
