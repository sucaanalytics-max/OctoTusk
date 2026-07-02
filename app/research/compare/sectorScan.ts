// Pure helpers for the Sector Scan (CIO opportunity) view. No React, no side effects.
// Reuses computeScorecard's output (ScorecardRow) for ranking/downside/upsides — this module
// adds only what computeScorecard doesn't: CMP-aware coverage, direction-typed action flags,
// the raw-2Y-upside + name lookups sorting/aggregation need, sort orders, and the summary strip.
// Never imports DashboardClient or any frozen route — RADAR_THRESHOLD / staleness are mirrored
// constants with a source comment, not imports.

import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { scenarioUpside } from "@/lib/scenarioUpside";
import type { CompareStock, CompareQuotesMap, ScorecardRow } from "@/lib/compare/types";

/**
 * A stock is "covered" (rankable / flag-eligible / plottable) when it has a resolved CMP > 0
 * AND both bear AND bull are present (base optional). This is intentionally STRICTER than
 * FootballField's own internal buildRow.hasBand (2-of-{bear,base,bull}) — the scan promises a
 * decision-complete row: a rendered range bar, a zone, a downside figure, and full flag
 * eligibility (scanFlags needs both band ends). A row with only base+one end still renders
 * inside the plain Chart view via FootballField's own predicate, but is correctly excluded
 * from the scan's "N of M covered" count / summary strip / leaderboard.
 */
export function hasScenarioBand(s: CompareStock, quotes: CompareQuotesMap): boolean {
  const { cmp } = resolveCmp(s, quotes[s.tikr]);
  if (cmp == null || cmp <= 0) return false;
  return s.bear != null && s.bull != null;
}

/**
 * "Approaching" band for BUY WATCH / TRIM WATCH — mirrors the alerts digest's
 * RADAR_THRESHOLD (app/api/alerts/digest/route.ts:34, "wider than the 5% alert band —
 * approaching"). Re-declared here (not imported) because app/api/alerts/** is a frozen
 * pipeline file this feature must never touch or depend on.
 */
export const APPROACH_BAND = 0.07;

/**
 * Staleness threshold in days — mirrors the Decision Support "stale" tape
 * (app/dashboard/DashboardClient.tsx ~L3442-3444: missing last_updated OR >60d old).
 * Re-declared, not imported — DashboardClient is frozen.
 */
export const STALE_DAYS = 60;

export type ScanFlag = "below-bear" | "buy-watch" | "above-bull" | "trim-watch" | "stale";

/**
 * Direction-typed action flags for one stock. Order: bear-side, bull-side, staleness —
 * at most 3 flags (below-bear/buy-watch are mutually exclusive, as are above-bull/trim-watch).
 * STALE is independent of the scenario band: it fires for ANY row with a missing or >60d-old
 * lastUpdated, even a manual add with no bear/bull at all — a stale flag on incomplete data
 * shouldn't be suppressed just because the band is unusable.
 * Directional flags require a resolved CMP > 0, both bear + bull present, AND a
 * non-degenerate band (bull > bear) — an inverted/compressed band is a data problem, not a
 * buy/trim signal, so ALL directional flags are suppressed together (STALE can still fire).
 * buy-watch is further suppressed once CMP is already above base (past the "cheap" zone).
 */
export function scanFlags(s: CompareStock, quotes: CompareQuotesMap, now: Date): ScanFlag[] {
  const staleDays = daysSince(s.lastUpdated, now);
  const isStale = staleDays == null || staleDays > STALE_DAYS;

  const flags: ScanFlag[] = [];

  const { cmp } = resolveCmp(s, quotes[s.tikr]);
  const { bear, base, bull } = s;
  if (cmp != null && cmp > 0 && bear != null && bull != null && bull > bear) {
    const belowBear = cmp <= bear;
    if (belowBear) {
      flags.push("below-bear");
    } else {
      const distBear = (cmp - bear) / bear;
      const pastBase = base != null && cmp > base;
      if (distBear > 0 && distBear <= APPROACH_BAND && !pastBase) flags.push("buy-watch");
    }

    const aboveBull = cmp >= bull;
    if (aboveBull) {
      flags.push("above-bull");
    } else {
      const distBull = (bull - cmp) / bull;
      if (distBull > 0 && distBull <= APPROACH_BAND) flags.push("trim-watch");
    }
  }

  if (isStale) flags.push("stale");

  return flags;
}

/** Days between `now` and an ISO date string; null input or unparsable → null (caller treats as stale). */
function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / 86_400_000;
}

export type ScanSort = "opportunity" | "u2" | "action";

/**
 * Per-tikr data `sortScanRows`/`sectorAggregate` need beyond ScorecardRow:
 *  - `name`: for the deterministic tie-break (ScorecardRow only carries tikr).
 *  - `u2`: the RAW (non-annualized) 2Y upside — scenarioUpside(target2y, resolved cmp).
 *    Distinct from ScorecardRow.ann2 (the ANNUALIZED 2Y return used in the composite rank);
 *    the "2Y upside" sort/summary mirror the leaderboard's own "2Y" column, which shows the
 *    raw total-return figure, not an annualized one.
 * Build with `buildScanRowExtras` — one pass over the covered+manual set.
 */
export interface ScanRowExtra {
  name: string;
  u2: number | null;
}
export type ScanRowExtras = Record<string, ScanRowExtra>;

export function buildScanRowExtras(stocks: CompareStock[], rows: ScorecardRow[]): ScanRowExtras {
  const byTikr = new Map(stocks.map((s) => [s.tikr, s]));
  const extras: ScanRowExtras = {};
  for (const r of rows) {
    const s = byTikr.get(r.tikr);
    extras[r.tikr] = {
      name: s?.name ?? r.tikr,
      u2: scenarioUpside(s?.target2y ?? null, r.cmp),
    };
  }
  return extras;
}

/** Higher = more urgent. Below/above-band (through-band) outrank approaching-watch, which outranks stale-only. */
function actionPriority(flags: ScanFlag[]): number {
  if (flags.includes("below-bear")) return 4;
  if (flags.includes("above-bull")) return 3;
  if (flags.includes("buy-watch") || flags.includes("trim-watch")) return 2;
  if (flags.includes("stale")) return 1;
  return 0;
}

function nameTiebreak(a: ScorecardRow, b: ScorecardRow, extras: ScanRowExtras): number {
  const an = extras[a.tikr]?.name ?? a.tikr;
  const bn = extras[b.tikr]?.name ?? b.tikr;
  return an.localeCompare(bn);
}

/**
 * Order rows for the leaderboard/chart per the chosen sort. Never mutates `rows`.
 *   opportunity — ScorecardRow.rankScore desc (nulls last); the composite risk-adjusted rank.
 *   u2          — extras[tikr].u2 desc (nulls last); the raw 2Y upside.
 *   action      — actionPriority desc, tie-broken by rankScore desc.
 * Every branch ends in a deterministic name tie-break (never left to array order/comparator ties).
 */
export function sortScanRows(
  rows: ScorecardRow[],
  flagsByTikr: Record<string, ScanFlag[]>,
  extras: ScanRowExtras,
  sort: ScanSort
): ScorecardRow[] {
  const sorted = [...rows];

  if (sort === "u2") {
    sorted.sort((a, b) => {
      const av = extras[a.tikr]?.u2 ?? null;
      const bv = extras[b.tikr]?.u2 ?? null;
      if (av == null && bv == null) return nameTiebreak(a, b, extras);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av !== bv) return bv - av;
      return nameTiebreak(a, b, extras);
    });
  } else if (sort === "action") {
    sorted.sort((a, b) => {
      const ap = actionPriority(flagsByTikr[a.tikr] ?? []);
      const bp = actionPriority(flagsByTikr[b.tikr] ?? []);
      if (ap !== bp) return bp - ap;
      const ar = a.rankScore, br = b.rankScore;
      if (ar == null && br == null) return nameTiebreak(a, b, extras);
      if (ar == null) return 1;
      if (br == null) return -1;
      if (ar !== br) return br - ar;
      return nameTiebreak(a, b, extras);
    });
  } else {
    sorted.sort((a, b) => {
      const ar = a.rankScore, br = b.rankScore;
      if (ar == null && br == null) return nameTiebreak(a, b, extras);
      if (ar == null) return 1;
      if (br == null) return -1;
      if (ar !== br) return br - ar;
      return nameTiebreak(a, b, extras);
    });
  }

  return sorted;
}

/** Summary strip counts: position-zone breakdown + median raw 2Y upside across `rows`. */
export function sectorAggregate(
  rows: ScorecardRow[],
  extras: ScanRowExtras
): { covered: number; cheap: number; fair: number; rich: number; medianU2: number | null } {
  let cheap = 0, fair = 0, rich = 0;
  for (const r of rows) {
    if (r.scenarioZone === "cheap") cheap++;
    else if (r.scenarioZone === "fair") fair++;
    else if (r.scenarioZone === "rich") rich++;
  }

  const u2s = rows
    .map((r) => extras[r.tikr]?.u2 ?? null)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);

  let medianU2: number | null = null;
  if (u2s.length > 0) {
    const mid = Math.floor(u2s.length / 2);
    medianU2 = u2s.length % 2 === 0 ? (u2s[mid - 1] + u2s[mid]) / 2 : u2s[mid];
  }

  return { covered: rows.length, cheap, fair, rich, medianU2 };
}
