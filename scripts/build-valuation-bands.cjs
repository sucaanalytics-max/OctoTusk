/**
 * build-valuation-bands.cjs — one-off build-time data fetch for the
 * "Neutral Base Valuation Bands" artifact (Nuvama vs Motilal Oswal).
 *
 * Spec: docs/superpowers/specs/2026-06-24-neutral-base-valuation-bands-design.md
 *
 * Canonical pipeline for BOTH stocks (apples-to-apples):
 *   - Weekly closes  : yahoo-finance2 chart (interval 1wk)
 *   - Fundamentals   : Yahoo fundamentals-timeseries REST (annual, FY23-FY26)
 *                      fetched raw to bypass yahoo-finance2 v3 schema throws.
 * Ratios are reconstructed in RAW ABSOLUTE INR units (never Cr) so a 1e7 error
 * cannot silently cancel. Fundamentals are stepped by ANNOUNCEMENT date
 * (FY-end + 75d reporting lag) to avoid look-ahead bias.
 *
 * Build-time validation (red-team F6/F8): derived mcap / P/B / trailing-PE are
 * asserted against live Yahoo fields; MC/Sales & EV/EBITDA are report-only
 * (definitional differences for financials). Build FAILS on a hard-assert miss.
 *
 * Output: scripts/valuation-bands-data.json  (embedded into the artifact).
 */
const path = require("path");
const fs = require("fs");
const ROOT = "/Users/tusk-jvb/Claude Projects/OctoTemplate/OctoTusk";
const YF = require(path.join(ROOT, "node_modules/yahoo-finance2")).default
  || require(path.join(ROOT, "node_modules/yahoo-finance2"));
const yf = new YF({ suppressNotices: ["yahooSurvey"], validation: { logErrors: false } });

const STOCKS = [
  { symbol: "NUVAMA.NS",     name: "Nuvama Wealth Management",        short: "Nuvama" },
  { symbol: "MOTILALOFS.NS", name: "Motilal Oswal Financial Services", short: "Motilal Oswal" },
];
const REPORT_LAG_DAYS = 75;            // FY-end -> results announcement
const FUND_KEYS = ["TotalRevenue","NetIncome","EBITDA","StockholdersEquity","NetDebt","OrdinarySharesNumber"];

const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// ---- fundamentals via raw REST (annual) -----------------------------------
async function fetchAnnualFundamentals(symbol) {
  const types = FUND_KEYS.map(k => "annual" + k).join(",");
  const p1 = Math.floor(new Date("2018-01-01").getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}`
    + `?symbol=${symbol}&type=${types}&period1=${p1}&period2=${p2}&merge=false`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
  if (!res.ok) throw new Error(`FTS HTTP ${res.status} for ${symbol}`);
  const arr = (await res.json())?.timeseries?.result || [];
  // collapse into { 'YYYY-03-31': {TotalRevenue, NetIncome, ...} }
  const byDate = {};
  for (const s of arr) {
    const type = s.meta?.type?.[0];
    if (!type) continue;
    const key = type.replace("annual", "");
    for (const pt of (s[type] || [])) {
      if (!pt || pt.reportedValue?.raw == null) continue;
      (byDate[pt.asOfDate] ||= { asOfDate: pt.asOfDate })[key] = pt.reportedValue.raw;
    }
  }
  // keep only fiscal years that have the core fields, sorted ascending
  return Object.values(byDate)
    .filter(r => r.NetIncome != null && r.StockholdersEquity != null && r.OrdinarySharesNumber != null)
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate))
    .map(r => ({
      fyEnd: r.asOfDate,
      effectiveFrom: iso(addDays(new Date(r.asOfDate), REPORT_LAG_DAYS)),
      label: "FY" + String(new Date(r.asOfDate).getUTCFullYear()).slice(2),
      revenue: r.TotalRevenue ?? null,
      netIncome: r.NetIncome,
      ebitda: r.EBITDA ?? null,
      equity: r.StockholdersEquity,
      netDebt: r.NetDebt ?? null,
      shares: r.OrdinarySharesNumber,
    }));
}

// ---- weekly closes ---------------------------------------------------------
async function fetchWeekly(symbol) {
  const c = await yf.chart(symbol, { period1: "2019-01-01", interval: "1wk" });
  return c.quotes
    .filter(q => q.close != null && q.date != null)
    .map(q => ({ t: iso(new Date(q.date)), close: q.close }));
}

// pick the fundamental FY in effect on date t (latest whose results were out)
function fundForDate(fys, t) {
  let chosen = null;
  for (const fy of fys) if (fy.effectiveFrom <= t) chosen = fy;
  return chosen;
}

function build(stock, weekly, fys, yahooSpot) {
  const series = weekly.map(({ t, close }) => {
    const f = fundForDate(fys, t);
    const row = { t, price: close, pe: null, pb: null, mcs: null, ev: null };
    if (!f) return row;                                   // clip: no fundamentals yet
    const mcap = close * f.shares;                        // raw INR
    row.pe  = f.netIncome > 0 ? mcap / f.netIncome : null;
    row.pb  = f.equity   > 0 ? mcap / f.equity     : null;
    row.mcs = f.revenue  > 0 ? mcap / f.revenue    : null;
    row.ev  = (f.ebitda != null && f.ebitda > 0) ? (mcap + (f.netDebt ?? 0)) / f.ebitda : null; // gated
    return row;
  });

  // current/spot from latest weekly close + latest FY
  const last = weekly[weekly.length - 1];
  const f = fys[fys.length - 1];
  const mcap = last.close * f.shares;
  const spot = {
    price: last.close,
    mcap,
    pe: f.netIncome > 0 ? mcap / f.netIncome : null,
    pb: f.equity > 0 ? mcap / f.equity : null,
    mcs: f.revenue > 0 ? mcap / f.revenue : null,
    ev: (f.ebitda != null && f.ebitda > 0) ? (mcap + (f.netDebt ?? 0)) / f.ebitda : null,
    netDebt: f.netDebt,
    ebitdaPositive: f.ebitda != null && f.ebitda > 0,
    netDebtNegative: (f.netDebt ?? 0) < 0,
  };

  // ---- validation vs Yahoo --------------------------------------------------
  const checks = [];
  const pct = (a, b) => Math.abs(a - b) / Math.abs(b) * 100;
  const hard = (name, got, exp, tol) => {
    const d = pct(got, exp); checks.push({ name, got, exp, drift: d, tol, hard: true, pass: d <= tol });
  };
  const soft = (name, got, exp) => {
    const d = pct(got, exp); checks.push({ name, got, exp, drift: d, hard: false, pass: true });
  };
  hard("mcap",        mcap,    yahooSpot.marketCap,   2);
  hard("priceToBook", spot.pb, yahooSpot.priceToBook, 5);
  hard("trailingPE",  spot.pe, yahooSpot.trailingPE,  6);
  if (spot.mcs != null) soft("priceToSales", spot.mcs, yahooSpot.priceToSales);

  return { series, spot, checks, fys };
}

(async () => {
  const out = { meta: { asOf: iso(new Date()), source: "Yahoo Finance (yahoo-finance2 + fundamentals-timeseries REST)", reportLagDays: REPORT_LAG_DAYS }, stocks: [] };
  let failed = false;

  for (const st of STOCKS) {
    process.stdout.write(`\n=== ${st.short} (${st.symbol}) ===\n`);
    const [weekly, fys, qs] = await Promise.all([
      fetchWeekly(st.symbol),
      fetchAnnualFundamentals(st.symbol),
      yf.quoteSummary(st.symbol, { modules: ["price", "summaryDetail", "defaultKeyStatistics"] }),
    ]);
    const num = v => (v && typeof v === "object" && "raw" in v) ? v.raw : v;
    const yahooSpot = {
      marketCap: num(qs.price?.marketCap) ?? num(qs.summaryDetail?.marketCap),
      priceToBook: num(qs.defaultKeyStatistics?.priceToBook),
      trailingPE: num(qs.summaryDetail?.trailingPE),
      priceToSales: num(qs.summaryDetail?.priceToSalesTrailing12Months),
    };
    const { series, spot, checks, fys: fyTable } = build(st, weekly, fys, yahooSpot);

    console.log(`  weekly pts: ${series.length} (${series[0].t} -> ${series[series.length-1].t})`);
    console.log(`  fundamentals: ${fyTable.map(f => f.label).join(",")} | ratio starts ${fyTable[0].effectiveFrom}`);
    console.log(`  spot: price ${spot.price.toFixed(1)} | PE ${spot.pe?.toFixed(1)} | PB ${spot.pb?.toFixed(2)} | MC/S ${spot.mcs?.toFixed(1)} | EV/EBITDA ${spot.ev?.toFixed(1)} | netDebt ${(spot.netDebt/1e7).toFixed(0)}Cr`);
    for (const c of checks) {
      const tag = c.pass ? "OK " : "FAIL";
      const lim = c.hard ? ` (tol ${c.tol}%)` : " [report-only]";
      console.log(`    [${tag}] ${c.name}: derived ${c.got.toFixed(2)} vs yahoo ${c.exp?.toFixed?.(2)} -> drift ${c.drift.toFixed(2)}%${lim}`);
      if (c.hard && !c.pass) failed = true;
    }

    out.stocks.push({
      symbol: st.symbol, name: st.name, short: st.short,
      ratioStart: fyTable[0].effectiveFrom,
      fundamentals: fyTable,
      spot, checks, series,
    });
  }

  const dest = path.join(ROOT, "scripts/valuation-bands-data.json");
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`\nwrote ${dest} (${(fs.statSync(dest).size/1024).toFixed(0)} KB)`);
  if (failed) { console.error("\n*** BUILD VALIDATION FAILED — hard assert(s) drifted beyond tolerance ***"); process.exit(1); }
  console.log("validation: all hard asserts passed.");
})().catch(e => { console.error("FATAL", e); process.exit(1); });
