// Role resolution + permission helpers for the notes feature.
// Roles live in the `user_roles` Supabase table (seeded manually in the console).
// FAIL-CLOSED: any email not present resolves to the least-privileged role ('analyst').
// The role is resolved FRESH from the DB per mutating request — never trusted from a JWT.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export type Role = "analyst" | "vp" | "cio";
export const DEFAULT_ROLE: Role = "analyst";

function isRole(v: unknown): v is Role {
  return v === "analyst" || v === "vp" || v === "cio";
}

// Short in-memory cache (per serverless instance). 60s TTL mirrors the middleware
// rate-limiter's "resets on cold start is acceptable" precedent.
let _cache: { map: Map<string, Role>; at: number } | null = null;
const TTL_MS = 60_000;

async function loadRoles(): Promise<Map<string, Role>> {
  const now = Date.now();
  if (_cache && now - _cache.at < TTL_MS) return _cache.map;

  const map = new Map<string, Role>();
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await getSupabase().from("user_roles").select("email, role");
      if (!error) {
        for (const row of data ?? []) {
          const role = (row as { role?: unknown }).role;
          const email = (row as { email?: unknown }).email;
          if (typeof email === "string" && isRole(role)) {
            map.set(email.toLowerCase(), role);
          }
        }
      }
    } catch {
      // Fail closed: an empty map means everyone resolves to DEFAULT_ROLE.
    }
  }
  _cache = { map, at: now };
  return map;
}

/** Resolve a user's role. Unknown/missing email -> DEFAULT_ROLE (least privilege). */
export async function getRole(email: string | null | undefined): Promise<Role> {
  if (!email) return DEFAULT_ROLE;
  return (await loadRoles()).get(email.toLowerCase()) ?? DEFAULT_ROLE;
}

/** Lowercased set of all seeded team emails — the allowlist for @mention resolution. */
export async function getTeamEmails(): Promise<Set<string>> {
  return new Set((await loadRoles()).keys());
}

// ── Permission helpers (pure; testable given inputs) ──
function sameUser(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function canEditNote(role: Role, authorEmail: string, actorEmail: string): boolean {
  return sameUser(authorEmail, actorEmail) || role === "vp" || role === "cio";
}

export function canDeleteNote(role: Role, authorEmail: string, actorEmail: string): boolean {
  return canEditNote(role, authorEmail, actorEmail);
}

export function canSeeAudit(role: Role): boolean {
  return role === "cio";
}
