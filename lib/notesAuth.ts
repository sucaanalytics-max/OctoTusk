// The SINGLE source of truth for note read-visibility.
// Every notes read MUST go through applyVisibility(...) so the rule is enforced in SQL,
// never in the client. Rule: a user sees all `shared` notes (any author) PLUS their own
// `private` notes. Soft-deleted rows are always excluded from normal reads.
//
// Why this matters: the app uses the Supabase service-role key, which bypasses RLS — so a
// naive `.eq("stock_key", ...)` read (like the journal route does) would return every
// user's private notes. This module prevents that.

// Only well-formed @tuskinvest.com emails are interpolated into the PostgREST filter
// string. The session email is already validated at sign-in; this is defense-in-depth
// against any value containing PostgREST metacharacters (comma / parens).
const SAFE_EMAIL_RE = /^[^,()@\s]+@tuskinvest\.com$/i;

export function isSafeEmail(email: string | null | undefined): email is string {
  return !!email && SAFE_EMAIL_RE.test(email);
}

/**
 * Apply the visibility rule + soft-delete exclusion to a Supabase query builder.
 * `query` is the PostgREST builder (the client is typed `any`).
 * If `email` is unsafe/missing, the user sees shared notes only (fail-safe, never broader).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyVisibility(query: any, email: string | null | undefined): any {
  const q = query.is("deleted_at", null);
  if (isSafeEmail(email)) {
    const e = email.toLowerCase();
    return q.or(`visibility.eq.shared,and(visibility.eq.private,author_email.eq.${e})`);
  }
  return q.eq("visibility", "shared");
}
