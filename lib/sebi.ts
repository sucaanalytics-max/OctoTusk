export type SebiSegment = "large" | "mid" | "small" | "micro";

// Raw rupees — Yahoo Finance marketCap unit (1 Crore = 10_000_000)
const LARGE_CAP_MIN = 200_000_000_000; // ₹20,000 Cr
const MID_CAP_MIN   =  50_000_000_000; // ₹5,000 Cr
const SMALL_CAP_MIN =   5_000_000_000; // ₹500 Cr

export function getSebiSegment(marketCapRupees: number | null | undefined): SebiSegment | null {
  if (!marketCapRupees || marketCapRupees <= 0) return null;
  if (marketCapRupees >= LARGE_CAP_MIN) return "large";
  if (marketCapRupees >= MID_CAP_MIN)   return "mid";
  if (marketCapRupees >= SMALL_CAP_MIN) return "small";
  return "micro";
}

export const SEBI_LABELS: Record<SebiSegment, string> = {
  large: "Large Cap",
  mid:   "Mid Cap",
  small: "Small Cap",
  micro: "Micro Cap",
};

export const SEBI_THRESHOLDS: Record<SebiSegment, string> = {
  large: "≥ ₹20,000 Cr",
  mid:   "₹5,000 – ₹20,000 Cr",
  small: "₹500 – ₹5,000 Cr",
  micro: "< ₹500 Cr (market convention — not SEBI-defined)",
};

export const SEGMENT_ORDER: SebiSegment[] = ["large", "mid", "small", "micro"];
