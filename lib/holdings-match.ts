// Shared, deterministic resolver: holding `asset_name` → stock `tikr`.
//
// Single source of truth for BOTH the sync pipeline (scripts/sync-to-supabase.ts,
// app/api/sync/route.ts) and the holdings tab (app/dashboard/DashboardClient.tsx),
// so the mapping never drifts between server and client.
//
// Resolution order (curated → exact → conservative fuzzy):
//   1. HOLDING_TIKR_OVERRIDES — curated, normalized `asset_name` → `tikr`. Deterministic.
//   2. exact match on stock `official_name` (light-normalized).
//   3. conservative fuzzy — substring containment with ≥50% length ratio (mirrors the
//      original client logic exactly, so it adds no new false matches).
// Non-override/non-exact matches are FLAGGED by the caller (never silently trusted);
// holdings with no match at all (true data gaps) are reported as `unmatched`.
//
// Isomorphic: plain JS only (no Node- or browser-specific APIs).

export interface MatchableStock {
  tikr: string;
  official_name?: string | null;
}

export type MatchMethod = "override" | "exact" | "fuzzy" | "none";

export interface MatchResult {
  tikr: string | null;
  method: MatchMethod;
  ratio?: number; // present for fuzzy matches (0–1)
}

/** Strong normalization for OVERRIDE-map keys: case/punctuation-insensitive,
 *  strips a trailing "limited"/"ltd". Robust to DeMAT export casing variants. */
export function normalizeKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/\s+(limited|ltd)\.?$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Light normalization used by the fuzzy step — identical to the original
 *  DashboardClient logic so existing fuzzy matches are preserved exactly. */
function lightNorm(s: string): string {
  return (s || "").toLowerCase().replace(/\s+limited$/, "").replace(/\s+ltd$/, "").trim();
}

// Curated overrides. Readable keys here; normalized once at module load.
// Ported from the original DashboardClient `nameToTikr` map, PLUS audit-derived
// hard cases (Motherson, Vedanta demerger entities) and promotions of names that
// previously only resolved via fragile fuzzy (now deterministic).
const RAW_OVERRIDES: Record<string, string> = {
  "Kilburn Engineering": "XBOM:522101",
  "Vedanta Limited": "VEDL",
  "Nexus Select Trust": "NXST",
  "Multi Commodity Exchange of India": "MCX",
  "Tips Music": "TIPSMUSIC",
  "Apeejay Surrendra Park Hotels": "PARKHOTELS",
  "Aditya Birla Sun Life AMC": "ABSLAMC",
  "Bajaj Finserv": "BAJAJFINSV",
  "SPML Infra": "SPMLINFRA",
  "JM Financial": "JMFINANCIL",
  "IIFL Capital Services": "IIFLCAPS",
  "Godawari Power & Ispat": "GPIL",
  "Manappuram Finance": "MANAPPURAM",
  "Canara Robeco Asset Management Company": "CRAMC",
  "Suraksha Diagnostic": "SURAKSHA",
  "Annapurna Swadisht": "ANNAPURNA",
  "Smartworks Coworking Spaces": "Smartworks",
  "ICICI Prudential Asset Management Company": "ICICIAMC",
  "E2E Networks": "E2E",
  "Wework India Management": "Wework",
  "Duroply Industries": "XBOM:516003",
  "State Bank Of India": "SBIN",
  "GPT Infraprojects": "GPTINFRA",
  "Virtuoso Optoelectronics": "VIRTUOSO OPTOELECTRONICS LIMITED (XBOM:543597)",
  "BSE Ltd": "BSE",
  "GPT Healthcare": "GPTHEALTH",
  "Motilal Oswal Financial": "MOTILALOFS",
  "KFin Technologies": "KFINTECH",
  "360 One Wam": "360ONE",
  "Nippon India ETF Nifty PSU Bank BeES": "XBOM:590108",
  "National Stock Exchange of India": "National Stock Exchange (NSE)",
  "Can Fin Homes": "CANFINHOME",
  "HDFC Asset Management Company": "HDFCAMC",
  "HDFC Asset Management": "HDFCAMC",
  "HDFC AMC": "HDFCAMC",
  "Bank Of India": "BANKINDIA",
  "Bank Of Baroda": "BANKBARODA",
  "Punjab National Bank": "PNB",
  // ── audit-derived additions (15 Jun 2026 holdings audit) ──
  "Samvardhana Motherson International": "MOTHERSON",
  "Saregama India": "SAREGAMA",
  "Prestige Estates Projects": "PRESTIGE",
  "Brigade Enterprises": "Brigade",
  "Aditya Birla Real Estate": "ABREL",
  "Interarch Building Solutions": "INTERARCH",
  "Karnataka Bank": "KTKBANK",
  "AXIS Bank": "AXISBANK",
  "ICICI Bank": "ICICIBANK",
  "IIFL Finance": "IIFL",
  "Vedanta Oil and Gas": "VOGL",
  "Vedanta Power": "VEDPOWER",
  "Vedanta Aluminium Metal": "VAML",
};

export const HOLDING_TIKR_OVERRIDES: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_OVERRIDES).map(([k, v]) => [normalizeKey(k), v])
);

/** Resolve a holding's display name to a stock tikr. */
export function resolveHoldingTikr(assetName: string, stocks: MatchableStock[]): MatchResult {
  const override = HOLDING_TIKR_OVERRIDES[normalizeKey(assetName)];
  if (override) return { tikr: override, method: "override" };

  const nl = lightNorm(assetName);
  if (!nl) return { tikr: null, method: "none" };
  let best: { tikr: string; ratio: number } | null = null;
  for (const s of stocks) {
    const ol = lightNorm(s.official_name || "");
    if (!ol) continue;
    if (ol === nl) return { tikr: s.tikr, method: "exact" };
    if (
      (ol.includes(nl) || nl.includes(ol)) &&
      Math.min(nl.length, ol.length) / Math.max(nl.length, ol.length) >= 0.5
    ) {
      const ratio = Math.min(nl.length, ol.length) / Math.max(nl.length, ol.length);
      if (!best || ratio > best.ratio) best = { tikr: s.tikr, ratio };
    }
  }
  if (best) return { tikr: best.tikr, method: "fuzzy", ratio: best.ratio };
  return { tikr: null, method: "none" };
}

export interface AttachReport {
  /** Holdings that resolved to no existing stock row (true data gaps — show "—"). */
  unmatched: string[];
  /** Holdings resolved only via fuzzy (verify; consider promoting to an override). */
  lowConfidence: { asset_name: string; tikr: string; ratio: number }[];
}

/** Attach a resolved `tikr` to each holding (for persistence at sync time) and
 *  return a report of data gaps + low-confidence matches for logging. */
export function attachHoldingTikrs<T extends { asset_name: string }>(
  holdings: T[],
  stocks: MatchableStock[]
): { holdings: (T & { tikr?: string })[]; report: AttachReport } {
  const tikrSet = new Set(stocks.map((s) => s.tikr));
  const unmatched: string[] = [];
  const lowConfidence: { asset_name: string; tikr: string; ratio: number }[] = [];
  const out = holdings.map((h) => {
    const r = resolveHoldingTikr(h.asset_name, stocks);
    if (!r.tikr || !tikrSet.has(r.tikr)) {
      unmatched.push(h.asset_name);
      return { ...h, tikr: undefined };
    }
    if (r.method === "fuzzy") {
      lowConfidence.push({ asset_name: h.asset_name, tikr: r.tikr, ratio: Math.round((r.ratio ?? 0) * 100) });
    }
    return { ...h, tikr: r.tikr };
  });
  return { holdings: out, report: { unmatched, lowConfidence } };
}
