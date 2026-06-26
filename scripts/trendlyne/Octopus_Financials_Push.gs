/**
 * Octopus_Financials_Push.gs — add to the SAME Apps Script project as your Fetch scripts.
 *
 * Adds an "Octopus" menu. After you select a stock in G5 and run "Fetch Raw Financials"
 * (so the Annual/Quarterly P&L, Balance Sheet, Cash Flow tabs are populated), click
 * Octopus → "Push current stock to Octopus". It reads those structured tabs, builds the
 * statements, and POSTs them to Octopus's secret-gated ingest endpoint. Octopus writes the
 * Supabase cache server-side (the sheet never holds Supabase credentials).
 *
 * SETUP: set INGEST_URL + INGEST_SECRET below (the same secret you set in Vercel as
 * FINANCIALS_INGEST_SECRET). No web-app deployment needed — this is an outbound call.
 */

// ── CONFIG ──────────────────────────────────────────────────────────────────
var INGEST_URL = "https://YOUR-OCTOPUS-DOMAIN/api/financials/ingest";
var INGEST_SECRET = "PASTE-FINANCIALS_INGEST_SECRET-HERE";
// ─────────────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Octopus")
    .addItem("Push current stock to Octopus", "pushCurrentToOctopus")
    .addItem("Test connection", "testOctopusConnection")
    .addToUi();
}

/**
 * Pings the ingest route with no data — confirms INGEST_URL + INGEST_SECRET are correct without
 * writing anything. A correct secret + reachable route returns 400 "no_valid_items" (it got past
 * the auth + db checks but had nothing to write), which we treat as success.
 */
function testOctopusConnection() {
  var ui = SpreadsheetApp.getUi();
  if (!INGEST_URL || INGEST_URL.indexOf("YOUR-OCTOPUS-DOMAIN") !== -1) { ui.alert("Set INGEST_URL at the top of the script first."); return; }
  if (!INGEST_SECRET || INGEST_SECRET.indexOf("PASTE-") === 0) { ui.alert("Set INGEST_SECRET at the top of the script first."); return; }
  var res = UrlFetchApp.fetch(INGEST_URL, {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ secret: INGEST_SECRET, items: [] }),
  });
  var code = res.getResponseCode();
  var body = res.getContentText() || "";
  if (code === 400 && body.indexOf("no_valid_items") !== -1) ui.alert("✅ Connection OK — URL and secret are valid. You can push stocks now.");
  else if (code === 200) ui.alert("✅ Connection OK.");
  else if (code === 401) ui.alert("❌ Secret mismatch.\nINGEST_SECRET here must equal FINANCIALS_INGEST_SECRET in Vercel — and redeploy Vercel after setting it.");
  else if (code === 404) ui.alert("❌ URL not found (404).\nCheck INGEST_URL — it should end in /api/financials/ingest and use your app's domain.");
  else if (code === 503) ui.alert("⚠️ Reached Octopus and the secret is OK, but Supabase isn't configured on that deployment.");
  else ui.alert("Unexpected response (HTTP " + code + "):\n" + body.slice(0, 300));
}

function pushCurrentToOctopus() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = String(ss.getSheetByName("Main Dashboard").getRange("G5").getValue() || "").trim();
  if (!name) { ui.alert("Pick a stock in G5 and run Fetch Raw Financials first."); return; }

  var sym = resolveSymbol_(ss, name);
  if (!sym) { ui.alert('Could not find "' + name + '" in the Stock Master List.'); return; }

  var statements = {};
  add_(statements, "pnl_annual", buildStatement_(ss.getSheetByName("Annual - P&L"), fyAnnual_));
  add_(statements, "pnl_quarterly", buildStatement_(ss.getSheetByName("Quarterly - P&L"), fyQuarter_));
  add_(statements, "balance_sheet", buildStatement_(ss.getSheetByName("Balance Sheet"), fyAnnual_));
  add_(statements, "cash_flow", buildStatement_(ss.getSheetByName("Cash Flow"), fyAnnual_));
  if (Object.keys(statements).length === 0) { ui.alert("No statement data found — fetch the stock first."); return; }

  var payload = { symbol: sym.symbol, exchange: sym.exchange, name: name, currency: "INR", unit: "Cr", statements: statements };
  var res = UrlFetchApp.fetch(INGEST_URL, {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ secret: INGEST_SECRET, symbol: sym.symbol, exchange: sym.exchange, payload: payload }),
  });
  var code = res.getResponseCode();
  if (code === 200) ui.alert("Pushed " + sym.symbol + " to Octopus ✓");
  else ui.alert("Push failed (HTTP " + code + "):\n" + res.getContentText().slice(0, 300));
}

/* ── Stock Master List: name → {symbol, exchange} (cols: A ISIN, B NSE, C BSE, D Name, E hash) ── */
function resolveSymbol_(ss, name) {
  var sh = ss.getSheetByName("Stock Master List");
  if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  var n = name.toLowerCase();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][3] || "").trim().toLowerCase() === n) {
      var nse = String(v[i][1] || "").trim().toUpperCase();
      var bse = String(v[i][2] || "").trim().toUpperCase();
      if (nse) return { symbol: nse, exchange: "NSE" };
      if (bse) return { symbol: bse, exchange: "BSE" };
    }
  }
  return null;
}

/* ── Statement extraction (prefers Consolidated; trims sparse period columns) ── */
function buildStatement_(sheet, fmt) {
  if (!sheet) return null;
  var values = sheet.getDataRange().getValues();
  var cons = trim_(extractBlock_(values, "Consolidated", fmt));
  var stand = trim_(extractBlock_(values, "Standalone", fmt));
  var score = function (b) { return b ? b.rows.reduce(function (s, r) { return s + r.values.filter(function (x) { return x !== null; }).length; }, 0) : 0; };
  if (cons && score(cons) >= 0.5 * score(stand)) return cons;
  return stand || cons;
}

function extractBlock_(values, sectionKw, fmt) {
  var start = -1, kw = sectionKw.toLowerCase();
  for (var r = 0; r < values.length; r++) {
    var a = values[r][0];
    if (typeof a === "string" && a.toLowerCase().indexOf(kw) === 0) { start = r; break; }
  }
  if (start < 0) return null;
  var pr = -1;
  for (var r2 = start; r2 < Math.min(values.length, start + 4); r2++) {
    var a2 = values[r2][0];
    if (typeof a2 === "string" && a2.toLowerCase().indexOf("parameter") === 0) { pr = r2; break; }
  }
  if (pr < 0) return null;
  var cols = [], periods = [];
  for (var c = 1; c < values[pr].length; c++) {
    var d = values[pr][c];
    if (Object.prototype.toString.call(d) === "[object Date]") {
      var lbl = fmt(d);
      if (lbl) { cols.push(c); periods.push(lbl); }
    }
  }
  if (!cols.length) return null;
  var rows = [];
  for (var rr = pr + 1; rr < values.length; rr++) {
    var label = values[rr][0];
    if (label === null || label === "") break;
    if (typeof label === "string" && /^you can add/i.test(label)) break;
    if (typeof label === "string" && /^(standalone|consolidated)/i.test(label)) break;
    var vals = cols.map(function (cc) { var x = values[rr][cc]; return (typeof x === "number" && isFinite(x)) ? x : null; });
    if (vals.every(function (x) { return x === null; })) continue;
    rows.push({ label: String(label).trim(), values: vals });
  }
  return rows.length ? { periods: periods, rows: rows } : null;
}

function trim_(st) {
  if (!st) return null;
  var minC = Math.max(2, Math.ceil(0.25 * st.rows.length));
  var keep = st.periods.map(function (_, i) {
    var cnt = 0; st.rows.forEach(function (r) { if (r.values[i] !== null) cnt++; });
    return cnt >= minC;
  });
  var periods = st.periods.filter(function (_, i) { return keep[i]; });
  var rows = st.rows.map(function (r) { return { label: r.label, values: r.values.filter(function (_, i) { return keep[i]; }) }; })
    .filter(function (r) { return r.values.some(function (x) { return x !== null; }); });
  return (periods.length && rows.length) ? { periods: periods, rows: rows } : null;
}

function add_(obj, key, st) { if (st) obj[key] = st; }
function pad2_(n) { return ("0" + n).slice(-2); }
function fyAnnual_(d) { return "FY" + pad2_(d.getFullYear() % 100); }
function fyQuarter_(d) {
  var m = d.getMonth();
  var q = (m === 2) ? 4 : (m === 5) ? 1 : (m === 8) ? 2 : (m === 11) ? 3 : null;
  if (q === null) return null;
  var fy = (m === 2) ? d.getFullYear() : d.getFullYear() + 1;
  return "Q" + q + "FY" + pad2_(fy % 100);
}
