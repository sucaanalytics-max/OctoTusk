// Stocks permanently excluded from every surface that consumes the snapshot
// (dashboard tabs, /octopus wall display, etc.). Substring-based match against
// tikr or official_name (case-insensitive). To truly stop them appearing,
// also delete the corresponding *_vF.xlsx from the OneDrive vF folder so the
// sync cron stops re-creating standalone entries.
export const REMOVED_STOCKS: readonly string[] = [
  "monarch networth", "recltd", "rec ltd", "repco",
  "dam capital", "deepak fert", "disa", "elecon",
  "emkay", "kpit", "mallcom", "patels airtemp", "rpsg",
  "somany", "sunteck", "arihant", "coal india", "533278",
];

export function isRemovedStock(s: { tikr?: string | null; official_name?: string | null }): boolean {
  const t = (s.tikr ?? "").toLowerCase();
  const o = (s.official_name ?? "").toLowerCase();
  return REMOVED_STOCKS.some(term => t.includes(term) || o.includes(term));
}
