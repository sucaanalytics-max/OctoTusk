// @mention parsing for note bodies.
// Resolves ONLY against an allowlist of known team emails (from user_roles + the author).
// Tokens that don't resolve to a known teammate are left as plain text (no notification,
// no spoofing). The regex is linear (no catastrophic backtracking on attacker input).

const MENTION_RE = /@([a-zA-Z0-9._%+-]+(?:@tuskinvest\.com)?)/g;

/**
 * Extract resolved @mentions from a note body.
 * @param body       freeform note text
 * @param teamEmails lowercased set of valid @tuskinvest.com emails
 * @returns deduped, lowercased list of mentioned emails (subset of teamEmails)
 */
export function parseMentions(body: string, teamEmails: Set<string>): string[] {
  if (!body) return [];
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(body)) !== null) {
    const token = m[1].toLowerCase();
    const candidate = token.includes("@") ? token : `${token}@tuskinvest.com`;
    if (teamEmails.has(candidate)) found.add(candidate);
  }
  return Array.from(found);
}
