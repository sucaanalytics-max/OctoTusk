// Peer ranking for the comparison picker: given an anchor stock (the user's first pick),
// return other stocks ranked by closeness — same subsector first, then same sector — as
// "suggested peers" for comparison. Pure; reuses lib/sectors for alias-resolved
// sector/subsector. Excludes the anchor and any already-selected tikrs.

import { getSectorInfo } from "@/lib/sectors";
import type { CompareStock } from "./types";

export interface PeerSuggestions {
  /** Ranked peers: same subsector first, then same sector (each sorted by name). */
  peers: CompareStock[];
  sector: string;
  subsector: string;
}

export function peerStocks(
  anchorTikr: string,
  stocks: CompareStock[],
  exclude: string[] = []
): PeerSuggestions {
  const anchor = stocks.find((s) => s.tikr === anchorTikr);
  if (!anchor) return { peers: [], sector: "", subsector: "" };

  const { sector, subsector } = getSectorInfo(anchor.tikr, {
    sector: anchor.sector,
    subsector: anchor.subsector,
  });

  const skip = new Set<string>([anchorTikr, ...exclude]);
  const sameSubsector: CompareStock[] = [];
  const sameSector: CompareStock[] = [];

  for (const s of stocks) {
    if (skip.has(s.tikr)) continue;
    const info = getSectorInfo(s.tikr, { sector: s.sector, subsector: s.subsector });
    if (!sector || info.sector !== sector) continue;
    if (subsector && info.subsector === subsector) sameSubsector.push(s);
    else sameSector.push(s);
  }

  const byName = (a: CompareStock, b: CompareStock) => a.name.localeCompare(b.name);
  sameSubsector.sort(byName);
  sameSector.sort(byName);

  return { peers: [...sameSubsector, ...sameSector], sector, subsector };
}
