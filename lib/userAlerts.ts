// Per-user custom alerts: shared types, validation, and the single pure rule evaluator.
// Imported by the CRUD API (server), the cron engine (server), and the mobile UI (client) —
// keep it free of server-only imports (mirrors lib/noteTypes.ts).

export type AlertMetric =
  | "price_above"
  | "price_below"
  | "target_near"
  | "upside_above"
  | "pct_move_abs";

export type AlertTargetType = "bear" | "base" | "bull" | "target1y";

export const ALERT_METRICS: AlertMetric[] = [
  "price_above",
  "price_below",
  "target_near",
  "upside_above",
  "pct_move_abs",
];

export const ALERT_METRIC_LABELS: Record<AlertMetric, string> = {
  price_above: "Price above",
  price_below: "Price below",
  target_near: "Near target",
  upside_above: "Base upside ≥",
  pct_move_abs: "Day move ≥",
};

/** Display unit for the threshold of each metric. */
export function metricUnit(metric: AlertMetric): "₹" | "%" {
  return metric === "price_above" || metric === "price_below" ? "₹" : "%";
}

export const ALERT_TARGET_LABELS: Record<AlertTargetType, string> = {
  bear: "Bear",
  base: "Base",
  bull: "Bull",
  target1y: "1Y target",
};

export const MAX_ALERTS_PER_USER = 50;

export interface UserAlert {
  id: number;
  user_email: string;
  stock_key: string;
  original_tikr: string;
  stock_name: string | null;
  metric: AlertMetric;
  target_type: AlertTargetType | null;
  threshold: number;
  active: boolean;
  one_shot: boolean;
  cooldown_sec: number;
  in_condition: boolean;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

export function isAlertMetric(v: unknown): v is AlertMetric {
  return typeof v === "string" && (ALERT_METRICS as string[]).includes(v);
}

export function isAlertTargetType(v: unknown): v is AlertTargetType {
  return v === "bear" || v === "base" || v === "bull" || v === "target1y";
}

export function metricNeedsTarget(metric: AlertMetric): boolean {
  return metric === "target_near";
}

/** Validate a threshold for a metric. Returns an error string, or null if valid. */
export function validateThreshold(metric: AlertMetric, n: unknown): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return "Threshold must be a number";
  switch (metric) {
    case "price_above":
    case "price_below":
      return n > 0 ? null : "Price must be greater than 0";
    case "pct_move_abs":
      return n > 0 && n <= 100 ? null : "Day move % must be between 0 and 100";
    case "target_near":
      return n > 0 && n <= 50 ? null : "Proximity % must be between 0 and 50";
    case "upside_above":
      return n > -100 && n <= 10000 ? null : "Upside % out of range";
    default:
      return "Unknown metric";
  }
}

// ── Evaluation ───────────────────────────────────────────────────────────────
export interface QuoteLike {
  price: number;
  changePct?: number | null;
}
export interface TargetLike {
  bear?: number | null;
  base?: number | null;
  bull?: number | null;
  target1y?: number | null;
}

function targetPrice(t: TargetLike, type: AlertTargetType | null | undefined): number | null {
  if (!type) return null;
  const v = type === "target1y" ? t.target1y : t[type];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface RuleInput {
  metric: AlertMetric;
  target_type?: AlertTargetType | null;
  threshold: number;
}

/**
 * Pure evaluator. Returns the current metric `value` + whether the condition is met now,
 * or `null` when it can't be evaluated (no live price / missing target) so the engine
 * skips the alert without touching its state.
 */
export function evaluateRule(
  rule: RuleInput,
  quote: QuoteLike | undefined,
  target?: TargetLike | null,
): { value: number; conditionMet: boolean } | null {
  const price = quote?.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;

  switch (rule.metric) {
    case "price_above":
      return { value: price, conditionMet: price >= rule.threshold };
    case "price_below":
      return { value: price, conditionMet: price <= rule.threshold };
    case "pct_move_abs": {
      const pct = quote?.changePct;
      if (pct == null || !Number.isFinite(pct)) return null;
      const abs = Math.abs(pct);
      return { value: abs, conditionMet: abs >= rule.threshold };
    }
    case "upside_above": {
      const base = target?.base;
      if (base == null || !Number.isFinite(base)) return null;
      const upside = ((base - price) / price) * 100;
      return { value: upside, conditionMet: upside >= rule.threshold };
    }
    case "target_near": {
      const tp = targetPrice(target ?? {}, rule.target_type);
      if (tp == null || tp <= 0) return null;
      const distPct = (Math.abs(price - tp) / tp) * 100;
      return { value: distPct, conditionMet: distPct <= rule.threshold };
    }
    default:
      return null;
  }
}

// Re-arm hysteresis buffers (prevent tick-flap at the threshold edge).
const REARM_PRICE_REL = 0.005; // 0.5% beyond the price level
const REARM_PCT = 0.5; // 0.5 percentage points beyond a %-metric
const REARM_NEAR = 1; // 1 percentage point outside the proximity band

/**
 * Next value of the edge-trigger latch. Stays latched (returns prev) until the metric
 * exits PAST a small buffer, so a value oscillating around the threshold doesn't re-fire.
 */
export function latchNext(
  rule: RuleInput,
  ev: { value: number; conditionMet: boolean },
  prev: boolean,
): boolean {
  if (ev.conditionMet) return true;
  switch (rule.metric) {
    case "price_above":
      return ev.value <= rule.threshold * (1 - REARM_PRICE_REL) ? false : prev;
    case "price_below":
      return ev.value >= rule.threshold * (1 + REARM_PRICE_REL) ? false : prev;
    case "target_near":
      return ev.value > rule.threshold + REARM_NEAR ? false : prev;
    case "pct_move_abs":
    case "upside_above":
      return ev.value <= rule.threshold - REARM_PCT ? false : prev;
    default:
      return false;
  }
}
