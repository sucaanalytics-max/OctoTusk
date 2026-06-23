/**
 * NSE / macro index symbols rendered on the Octopus dashboard's top strip.
 *
 * Each entry has a primary Yahoo Finance symbol and an optional fallback;
 * the indices route tries the primary first and falls back if the response
 * lacks `regularMarketPrice`. Tiles that fail BOTH render `—`.
 */

export interface IndexSymbol {
  /** Short display name on the wall display (e.g. "NIFTY 50") */
  label: string;
  /** Preferred Yahoo Finance symbol */
  primary: string;
  /** Fallback symbol if primary doesn't return a price */
  fallback?: string;
}

// Row 1 — broad market + macro context.
export const OCTOPUS_INDICES_BROAD: IndexSymbol[] = [
  { label: "NIFTY 50",           primary: "^NSEI",      fallback: "^CNX_NIFTY" },
  { label: "NIFTY NEXT 50",      primary: "^NSMIDCP",   fallback: "^CNXNXT50" },
  { label: "NIFTY MIDCAP 100",   primary: "^CNXMIDCAP", fallback: "NIFTY_MIDCAP_100.NS" },
  { label: "NIFTY SMALLCAP 100", primary: "^CNXSC",     fallback: "NIFTY_SMLCAP_100.NS" },
  { label: "SENSEX",             primary: "^BSESN" },
  { label: "INDIA VIX",          primary: "^INDIAVIX",  fallback: "INDIAVIX.NS" },
  { label: "USD / INR",          primary: "USDINR=X",   fallback: "INR=X" },
];

// Row 2 — NSE sectoral indices the firm actively tracks.
export const OCTOPUS_INDICES_SECTOR: IndexSymbol[] = [
  { label: "BANK",       primary: "^NSEBANK",   fallback: "^CNXBANK" },
  { label: "FIN SVCS",   primary: "^CNXFIN",    fallback: "NIFTY_FIN_SERVICE.NS" },
  { label: "IT",         primary: "^CNXIT",     fallback: "^NSEIT" },
  { label: "AUTO",       primary: "^CNXAUTO",   fallback: "^NSEAUTO" },
  { label: "PHARMA",     primary: "^CNXPHARMA", fallback: "^NSEPHARMA" },
  { label: "FMCG",       primary: "^CNXFMCG",   fallback: "^NSEFMCG" },
  { label: "REALTY",     primary: "^CNXREALTY", fallback: "^NSEREALTY" },
  { label: "METAL",      primary: "^CNXMETAL",  fallback: "^NSEMETAL" },
  { label: "ENERGY",     primary: "^CNXENERGY", fallback: "^NSEENERGY" },
  { label: "HEALTHCARE", primary: "^CNXHEALTH",  fallback: "NIFTY_HEALTHCARE.NS" },
];

// Combined list — the indices route fetches this; IndexStrip renders the two
// arrays as separate rows.
//
// ⚠️ DO NOT reorder/extend OCTOPUS_INDICES / OCTOPUS_INDICES_BROAD / OCTOPUS_INDICES_SECTOR:
// the frozen Telegram pipeline (app/api/alerts/check/route.ts) slices buildIndicesPayload()'s
// output positionally by OCTOPUS_INDICES_BROAD.length. The expanded wall-display strip lives
// in the separate OCTOPUS_STRIP_* config below, served only via the /api/indices GET handler.
export const OCTOPUS_INDICES: IndexSymbol[] = [
  ...OCTOPUS_INDICES_BROAD,
  ...OCTOPUS_INDICES_SECTOR,
];

// ───────────────────────────────────────────────────────────────────────────
// Expanded wall-display strip (NOT consumed by the alerts pipeline).
// Rendered by app/octopus/IndexStrip.tsx as labelled grouped rows; fetched by
// the /api/indices GET handler via buildStripPayload(). Symbols validated live
// 2026-06-22 (working symbol as `primary`, prior symbol kept as `fallback`).
// ───────────────────────────────────────────────────────────────────────────

/** A commodity tile: USD from a Yahoo future, INR from a Dhan MCX front-month (optional). */
export interface CommoditySymbol {
  /** Short display name (e.g. "GOLD") */
  label: string;
  /** Yahoo Finance futures symbol for the USD price (e.g. "GC=F") */
  usdSymbol: string;
  /** USD unit suffix (e.g. "/oz", "/bbl", "/t") */
  usdUnit: string;
  /** Key into data/mcx-commodities.json for the INR (MCX) leg; omit for no INR (e.g. Brent) */
  mcxKey?: string;
  /** INR unit suffix (e.g. "/10g", "/kg", "/bbl") */
  inrUnit?: string;
}

/** One rendered row of the strip — either market indices or commodities. */
export type IndexGroup =
  | { kind: "index"; variant: "broad" | "sector"; label: string; indices: IndexSymbol[] }
  | { kind: "commodity"; label: string; commodities: CommoditySymbol[] };

export const OCTOPUS_STRIP_GROUPS: IndexGroup[] = [
  {
    kind: "index", variant: "broad", label: "BROAD MARKET",
    indices: [
      { label: "NIFTY 50",      primary: "^NSEI",      fallback: "^CNX_NIFTY" },
      { label: "NIFTY NEXT 50", primary: "^NSMIDCP",   fallback: "^CNXNXT50" },
      { label: "NIFTY 100",     primary: "^CNX100" },
      { label: "NIFTY 200",     primary: "^CNX200" },
      { label: "NIFTY 500",     primary: "^CRSLDX" },
      { label: "SENSEX",        primary: "^BSESN" },
      { label: "INDIA VIX",     primary: "^INDIAVIX",  fallback: "INDIAVIX.NS" },
      { label: "USD / INR",     primary: "USDINR=X",   fallback: "INR=X" },
    ],
  },
  {
    kind: "index", variant: "broad", label: "MARKET CAP",
    indices: [
      { label: "MIDCAP 50",    primary: "^NSEMDCP50" },
      { label: "MIDCAP 100",   primary: "NIFTY_MIDCAP_100.NS", fallback: "^CNXMIDCAP" },
      { label: "MIDCAP 150",   primary: "NIFTY_MIDCAP_150.NS" },
      { label: "SMALLCAP 100", primary: "^CNXSC",              fallback: "NIFTY_SMLCAP_100.NS" },
      { label: "SMALLCAP 250", primary: "NIFTY_SMLCAP_250.NS" },
      { label: "MIDSMALL 400", primary: "NIFTY_MIDSML_400.NS" },
      { label: "MICROCAP 250", primary: "NIFTY_MICROCAP250.NS" },
    ],
  },
  {
    kind: "index", variant: "sector", label: "BANKS & FINANCIALS",
    indices: [
      { label: "BANK",      primary: "^NSEBANK",   fallback: "^CNXBANK" },
      { label: "FIN SVCS",  primary: "^CNXFIN",    fallback: "NIFTY_FIN_SERVICE.NS" },
      { label: "FIN 25/50", primary: "NIFTY_FINSRV25_50.NS" },
      { label: "PSU BANK",  primary: "^CNXPSUBANK", fallback: "NIFTY_PSU_BANK.NS" },
      { label: "PVT BANK",  primary: "NIFTY_PVT_BANK.NS" },
    ],
  },
  {
    kind: "index", variant: "sector", label: "SECTORS",
    indices: [
      { label: "IT",         primary: "^CNXIT",      fallback: "^NSEIT" },
      { label: "AUTO",       primary: "^CNXAUTO",    fallback: "^NSEAUTO" },
      { label: "PHARMA",     primary: "^CNXPHARMA",  fallback: "^NSEPHARMA" },
      { label: "HEALTHCARE", primary: "NIFTY_HEALTHCARE.NS", fallback: "^CNXHEALTH" },
      { label: "FMCG",       primary: "^CNXFMCG",    fallback: "^NSEFMCG" },
      { label: "METAL",      primary: "^CNXMETAL",   fallback: "^NSEMETAL" },
      { label: "REALTY",     primary: "^CNXREALTY",  fallback: "^NSEREALTY" },
      { label: "ENERGY",     primary: "^CNXENERGY",  fallback: "^NSEENERGY" },
    ],
  },
  {
    kind: "index", variant: "sector", label: "THEMES",
    indices: [
      { label: "OIL & GAS",      primary: "NIFTY_OIL_AND_GAS.NS" },
      { label: "INFRA",          primary: "^CNXINFRA" },
      { label: "MEDIA",          primary: "^CNXMEDIA",  fallback: "^NSEMEDIA" },
      { label: "CONSUMPTION",    primary: "^CNXCONSUM" },
      { label: "CONSR DURABLES", primary: "NIFTY_CONSR_DURBL.NS" },
      { label: "PSE",            primary: "^CNXPSE" },
      { label: "MNC",            primary: "^CNXMNC" },
      { label: "COMMODITIES",    primary: "^CNXCMDT" },
    ],
  },
  {
    kind: "commodity", label: "COMMODITIES",
    commodities: [
      { label: "GOLD",      usdSymbol: "GC=F",  usdUnit: "/oz",  mcxKey: "gold",      inrUnit: "/10g" },
      { label: "SILVER",    usdSymbol: "SI=F",  usdUnit: "/oz",  mcxKey: "silver",    inrUnit: "/kg" },
      { label: "ALUMINIUM", usdSymbol: "ALI=F", usdUnit: "/t",   mcxKey: "aluminium", inrUnit: "/kg" },
      { label: "CRUDE",     usdSymbol: "CL=F",  usdUnit: "/bbl", mcxKey: "crude",     inrUnit: "/bbl" },
      { label: "BRENT",     usdSymbol: "BZ=F",  usdUnit: "/bbl" },
    ],
  },
];

/** Flat index-symbol list for the GET builder's Yahoo batch. */
export const OCTOPUS_STRIP_INDICES: IndexSymbol[] = OCTOPUS_STRIP_GROUPS.flatMap((g) =>
  g.kind === "index" ? g.indices : []
);

/** Flat commodity list for the GET builder's USD (Yahoo) + INR (Dhan MCX) legs. */
export const OCTOPUS_STRIP_COMMODITIES: CommoditySymbol[] = OCTOPUS_STRIP_GROUPS.flatMap((g) =>
  g.kind === "commodity" ? g.commodities : []
);

// The strip lookup in IndexStrip.tsx is keyed by label — labels must be globally unique.
// Warn loudly (don't crash prod) if a duplicate slips in.
{
  const labels = [
    ...OCTOPUS_STRIP_INDICES.map((i) => i.label),
    ...OCTOPUS_STRIP_COMMODITIES.map((c) => c.label),
  ];
  const dup = labels.find((l, i) => labels.indexOf(l) !== i);
  if (dup) console.warn(`[indices] duplicate OCTOPUS_STRIP label "${dup}" — strip lookup will collide`);
}
