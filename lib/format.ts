// Centralized number formatting for the mobile UI (per docs/DASHBOARD-GUIDELINE.md §8).
// en-IN locale, a real minus sign (−, not a hyphen), ₹ prefix, "—" for empty.
// NOTE: the desktop (DashboardClient.tsx) keeps its own inline formatters; this module
// is consumed by app/m/** + lib/mobile/** only. Do not import the frozen monolith.

const MINUS = "−"; // U+2212 MINUS SIGN
const EMPTY = "—";

function group(n: number, decimals: number): string {
  return Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Plain number, en-IN grouped, real minus. `null`/non-finite → "—". */
export function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return EMPTY;
  return (n < 0 ? MINUS : "") + group(n, decimals);
}

/** ₹-prefixed amount. */
export function fmtRupee(n: number | null | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return EMPTY;
  return "₹" + fmtNum(n, decimals);
}

/** Fraction → signed percent (0.27 → "+27.0%"). */
export function fmtPct(frac: number | null | undefined, decimals = 1): string {
  if (frac == null || !Number.isFinite(frac)) return EMPTY;
  return fmtPctRaw(frac * 100, decimals);
}

/** Already-percent value → signed percent (2.4 → "+2.4%", -1.2 → "−1.2%"). */
export function fmtPctRaw(pct: number | null | undefined, decimals = 1): string {
  if (pct == null || !Number.isFinite(pct)) return EMPTY;
  const sign = pct > 0 ? "+" : pct < 0 ? MINUS : "";
  return sign + group(pct, decimals) + "%";
}

/** Rupees → "₹X Cr" (1 crore = 1e7). */
export function fmtCr(rupees: number | null | undefined, decimals = 0): string {
  if (rupees == null || !Number.isFinite(rupees)) return EMPTY;
  return "₹" + fmtNum(rupees / 1e7, decimals) + " Cr";
}
