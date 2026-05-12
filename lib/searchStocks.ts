/**
 * Pure fuzzy ranker for the Octopus command palette.
 *
 * Ranks by: exact TIKR > TIKR startsWith > name startsWith > TIKR includes >
 * name includes > subsector includes. Returns the top `limit` matches.
 */

import { displayName } from "./displayName";

export interface SearchableStock {
  tikr: string;
  name: string;
  sector: string;
  subsector?: string;
  dayPct: number | null;
  cmp: number | null;
}

export interface SearchResult extends SearchableStock {
  score: number;
  display: string;
}

const SCORE = {
  TIKR_EXACT: 100,
  TIKR_STARTS: 60,
  NAME_STARTS: 50,
  TIKR_INCLUDES: 30,
  NAME_INCLUDES: 20,
  SUBSECTOR_INCLUDES: 10,
  SECTOR_INCLUDES: 6,
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function searchStocks(query: string, stocks: SearchableStock[], limit = 12): SearchResult[] {
  const q = norm(query.trim());
  if (!q) return [];

  const results: SearchResult[] = [];
  for (const s of stocks) {
    const tikr = norm(s.tikr);
    const display = displayName(s.tikr, s.name);
    const name = norm(display);
    const fullName = norm(s.name || "");
    const sub = norm(s.subsector || "");
    const sec = norm(s.sector || "");

    let score = 0;
    if (tikr === q) score += SCORE.TIKR_EXACT;
    else if (tikr.startsWith(q)) score += SCORE.TIKR_STARTS;
    else if (tikr.includes(q)) score += SCORE.TIKR_INCLUDES;

    if (name.startsWith(q) || fullName.startsWith(q)) score += SCORE.NAME_STARTS;
    else if (name.includes(q) || fullName.includes(q)) score += SCORE.NAME_INCLUDES;

    if (sub.includes(q)) score += SCORE.SUBSECTOR_INCLUDES;
    if (sec.includes(q)) score += SCORE.SECTOR_INCLUDES;

    if (score > 0) results.push({ ...s, score, display });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.display.localeCompare(b.display);
  });

  return results.slice(0, limit);
}
