// READ-ONLY diagnostic: reads the Manappuram vF file directly from OneDrive (Graph) to
// find why it isn't mapping. Mirrors the sync's parse (Tusk - Summary sheet, B2 = TIKR).
// Run: node --env-file=.env.local scripts/diag-manappuram-vf.mjs
const TENANT = process.env.AZURE_TENANT_ID;
const CID = process.env.GRAPH_CLIENT_ID;
const SECRET = process.env.GRAPH_CLIENT_SECRET;
const DRIVE_ID = process.env.GRAPH_DRIVE_ID || "b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH";
const VF_FOLDER_ID = process.env.GRAPH_VF_FOLDER_ID || "01XUUXNQYRQ7B5PBRKMZGLUVNKA5K5MXY5";

async function getToken() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CID, client_secret: SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("token failed: " + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

const t = await getToken();
const H = { Authorization: `Bearer ${t}` };

const listUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID}/children?$top=400&$select=id,name,webUrl,lastModifiedDateTime`;
const list = await (await fetch(listUrl, { headers: H })).json();
if (list.error) throw new Error("folder list failed: " + list.error.message);
const all = list.value || [];
console.log(`vF folder: ${all.length} files total`);
const files = all.filter((f) => /manappuram/i.test(f.name));
console.log("Manappuram-matching files:", files.map((f) => f.name));

for (const f of files) {
  console.log("\n=== " + f.name + " ===");
  console.log("  webUrl present:", !!f.webUrl, "| lastModified:", f.lastModifiedDateTime);
  const base = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${f.id}/workbook`;
  const sess = await (await fetch(`${base}/createSession`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ persistChanges: false }) })).json();
  const SH = { ...H, "workbook-session-id": sess.id };
  const sheets = await (await fetch(`${base}/worksheets?$select=name`, { headers: SH })).json();
  const names = (sheets.value || []).map((s) => s.name);
  console.log("  sheets:", names);
  const summary = names.find((n) => n.toLowerCase().replace(/\s+/g, " ").trim() === "tusk - summary");
  console.log("  'Tusk - Summary' matched:", summary || "*** NONE — would cause no_sheet skip ***");
  if (summary) {
    const rng = await (await fetch(`${base}/worksheets('${encodeURIComponent(summary)}')/range(address='A1:G22')?$select=values`, { headers: SH })).json();
    const v = rng.values || [];
    const cell = (addr) => { const m = addr.match(/^([A-Z])(\d+)$/); const c = m[1].charCodeAt(0) - 65, r = +m[2] - 1; return v[r] ? v[r][c] : null; };
    console.log("  B2 (TIKR)      :", JSON.stringify(cell("B2")));
    console.log("  A5 (updated)   :", JSON.stringify(cell("A5")));
    console.log("  B9/C9/D9 b/b/b :", cell("B9"), cell("C9"), cell("D9"));
  }
}
console.log("\nBaseline tikr for Manappuram in DB = 'MANAPPURAM'. Compare against B2 above.");
