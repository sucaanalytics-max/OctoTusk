import { getCompanyShort, cleanTikr } from "@/lib/companyName";

/**
 * Resolve a free-text query ("saregama", "hdfc bank", a raw tikr) to a stock
 * from the snapshot. Pure matching logic — no I/O — so it's trivially testable.
 */

export type LookupStock = {
  tikr?: string;
  official_name?: string | null;
  [key: string]: unknown;
};

export type LookupResult =
  | { kind: "match"; stock: LookupStock }
  | { kind: "ambiguous"; candidates: LookupStock[] }
  | { kind: "none" };

const MAX_CANDIDATES = 5;

export function matchStocks(stocks: LookupStock[], query: string): LookupResult {
  const q = query.trim().toLowerCase();
  if (!q) return { kind: "none" };

  const withTikr = stocks.filter(s => typeof s.tikr === "string" && s.tikr);

  // 1) Exact tikr (case-insensitive) — unambiguous by construction.
  const exact = withTikr.find(s => (s.tikr as string).toLowerCase() === q);
  if (exact) return { kind: "match", stock: exact };

  // 2) Substring across tikr / official_name / short display name.
  const hits = withTikr.filter(s => {
    const tikr = (s.tikr as string).toLowerCase();
    const official = String(s.official_name || "").toLowerCase();
    const short = getCompanyShort(s).toLowerCase();
    const clean = cleanTikr(s.tikr as string).toLowerCase();
    return tikr.includes(q) || official.includes(q) || short.includes(q) || clean.includes(q);
  });

  if (hits.length === 0) return { kind: "none" };
  if (hits.length === 1) return { kind: "match", stock: hits[0] };

  // 3) Several hits: a unique prefix match on tikr/short name wins
  //    ("sare" → Saregama even if another stock mentions it mid-name).
  const prefix = hits.filter(s =>
    (s.tikr as string).toLowerCase().startsWith(q) ||
    getCompanyShort(s).toLowerCase().startsWith(q)
  );
  if (prefix.length === 1) return { kind: "match", stock: prefix[0] };

  const pool = prefix.length > 1 ? prefix : hits;
  const candidates = [...pool]
    .sort((a, b) => getCompanyShort(a).length - getCompanyShort(b).length)
    .slice(0, MAX_CANDIDATES);
  return { kind: "ambiguous", candidates };
}
