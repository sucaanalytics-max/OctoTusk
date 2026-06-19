// Pure valuation helpers for the mobile UI.
//
// Re-expressed from the inline logic in app/dashboard/DashboardClient.tsx (upside ≈ L1389)
// as a standalone module so the mobile app never imports/edits the frozen 4,909-line
// monolith. If the desktop upside formula changes, update both (cross-ref kept here).

/** Fractional upside from live CMP to a scenario/target price. 0.27 === +27%. */
export function scenarioUpside(
  target: number | null | undefined,
  cmp: number | null | undefined
): number | null {
  if (target == null || cmp == null) return null;
  if (!Number.isFinite(target) || !Number.isFinite(cmp) || cmp <= 0) return null;
  return (target - cmp) / cmp;
}

/**
 * Position of CMP on the bear→bull price axis, clamped to [0,1].
 * Axis spans [min(bear,cmp), max(bull,cmp)] so the marker is ALWAYS visible,
 * even when CMP is outside the bear–bull range. null if inputs are unusable.
 */
export function bandPosition(
  cmp: number | null | undefined,
  bear: number | null | undefined,
  bull: number | null | undefined
): number | null {
  if (cmp == null || bear == null || bull == null) return null;
  if (![cmp, bear, bull].every((v) => Number.isFinite(v as number))) return null;
  const lo = Math.min(bear, cmp);
  const hi = Math.max(bull, cmp);
  if (hi <= lo) return null;
  return (cmp - lo) / (hi - lo);
}

/** Position of an arbitrary price on the same [min(bear,cmp), max(bull,cmp)] axis. */
export function axisPosition(
  value: number | null | undefined,
  cmp: number | null | undefined,
  bear: number | null | undefined,
  bull: number | null | undefined
): number | null {
  if (value == null || cmp == null || bear == null || bull == null) return null;
  if (![value, cmp, bear, bull].every((v) => Number.isFinite(v as number))) return null;
  const lo = Math.min(bear, cmp);
  const hi = Math.max(bull, cmp);
  if (hi <= lo) return null;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}

export type ScenarioZone = "cheap" | "fair" | "rich";

/** Where CMP sits vs the scenarios → drives marker color. cheap = below bear, rich = above bull. */
export function scenarioZone(
  cmp: number | null | undefined,
  bear: number | null | undefined,
  bull: number | null | undefined
): ScenarioZone | null {
  if (cmp == null || bear == null || bull == null) return null;
  if (cmp <= bear) return "cheap";
  if (cmp >= bull) return "rich";
  return "fair";
}
