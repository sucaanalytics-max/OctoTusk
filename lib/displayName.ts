/**
 * Treemap-tile display name.
 *
 * Goal: a single, readable label per stock that works for both clean trading
 * symbols (HDFCBANK, MCX) and ugly raw BSE codes (533278) by preferring the
 * official_name when it's informative.
 */

const NOISE_SUFFIX = /\s*(?:LIMITED|LTD\.?|CORPORATION|CORP\.?|PLC|LLP|\(INDIA\))\s*$/i;
const TRAILING_INDIA = /\s+INDIA\s*$/i;
const PUREDIGIT = /^\d+$/;

// Acronyms / brand abbreviations that should NOT be title-cased.
const ALLCAPS = new Set([
  "SBI", "HDFC", "ICICI", "NTPC", "ONGC", "GAIL", "BPCL", "IOC", "HPCL",
  "LIC", "L&T", "TCS", "ITC", "MCX", "BSE", "NSE", "PFC", "REC", "RBL",
  "IDFC", "IDBI", "PNB", "UCO", "DLF", "JSW", "PVR", "INOX", "ABB",
  "TVS", "MRF", "AIA", "GMR", "GVK", "HCL", "M&M", "J&K", "NMDC", "SAIL",
  "GSPL", "GSEC", "IRCTC", "IRFC", "RVNL", "PSU", "FMCG", "REIT", "ETF",
  "AMC", "NBFC", "HFC", "BFSI", "IT", "API", "EV",
]);

function titleCaseWord(w: string): string {
  if (!w) return w;
  if (ALLCAPS.has(w.toUpperCase())) return w.toUpperCase();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function isReadable(name: string): boolean {
  if (!name) return false;
  if (PUREDIGIT.test(name.trim())) return false;
  // Names that are <2 chars or look like exchange-prefixed numeric codes
  if (name.length < 2) return false;
  return true;
}

export function displayName(tikr: string, officialName?: string | null): string {
  const raw = (officialName ?? "").trim();
  if (!isReadable(raw)) {
    // Fall back to TIKR. Strip exchange prefixes (XBOM:, XNSE:) for cleanliness.
    return tikr.replace(/^X(?:BOM|NSE):/, "");
  }
  // Strip suffix noise, then trailing " INDIA"
  let cleaned = raw.replace(NOISE_SUFFIX, "").trim();
  cleaned = cleaned.replace(TRAILING_INDIA, "").trim();
  if (!cleaned) return tikr;
  // Title-case but preserve ALLCAPS acronyms
  return cleaned.split(/\s+/).map(titleCaseWord).join(" ");
}
