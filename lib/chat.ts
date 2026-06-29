// Team chat: shared types + helpers. PURE + client-safe (mirrors lib/userAlerts.ts / noteTypes.ts;
// no server-only imports). Two channels live in one table keyed by (scope, scope_key): per-stock
// Discussion threads ('stock', scope_key = UPPER(trim(tikr))) and one global team channel
// ('global', scope_key = 'GLOBAL'). Reads are team-visible; writes set author server-side.

import { toStockKey } from "./noteTypes";

export type ChatScope = "stock" | "global";

export const GLOBAL_SCOPE_KEY = "GLOBAL";
export const MAX_CHAT_LEN = 4000;
export const MAX_CHAT_MENTIONS = 10; // cap fan-out so one message can't notify the whole team

export interface ChatMessage {
  id: number;
  scope: ChatScope;
  scope_key: string;
  author_email: string; // team-visible attribution (intentional, like notes); never a secret
  body: string;
  mentions: string[];
  stock_name: string | null;
  edited: boolean;
  created_at: string;
  updated_at: string;
}

export function isChatScope(v: unknown): v is ChatScope {
  return v === "stock" || v === "global";
}

/** scope_key for a scope: 'GLOBAL' for the team channel, UPPER(trim(tikr)) for a stock; null if invalid. */
export function chatScopeKey(scope: ChatScope, tikr?: string | null): string | null {
  if (scope === "global") return GLOBAL_SCOPE_KEY;
  if (!tikr) return null;
  return toStockKey(tikr) || null;
}

/** Display name from an email local-part (dots -> spaces). Matches the notes/marketplace derivation. */
export function chatAuthorName(email: string): string {
  return email.split("@")[0].replace(/\./g, " ");
}
