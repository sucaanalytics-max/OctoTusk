// Marketplace = a team-wide, read-only projection over ACTIVE user_alerts. PURE + client-safe
// (mirrors lib/userAlerts.ts; no server-only imports). The wire shape deliberately OMITS the
// row id, the owner's raw email, and ALL alert STATE (active / in_condition / last_fired_at /
// one_shot / cooldown_sec) — only the reusable template + a non-identifying author display name.
// The owner-isolation + projection enforcement lives in app/api/user-alerts/marketplace/route.ts.

import type { AlertMetric, AlertTargetType } from "./userAlerts";

export interface MarketplaceAlert {
  original_tikr: string;
  stock_key: string;
  stock_name: string | null;
  metric: AlertMetric;
  target_type: AlertTargetType | null;
  threshold: number;
  created_at: string;
  /** Display name derived from the owner's email local-part — never the raw email. */
  author: string;
}

/** Owner email -> display name (local-part, dots -> spaces). Matches the notes author derivation. */
export function marketplaceAuthor(email: string): string {
  return email.split("@")[0].replace(/\./g, " ");
}
