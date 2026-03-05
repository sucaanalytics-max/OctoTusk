/**
 * Database helper — wraps the `postgres` package with a thin compatibility
 * layer so the API routes can keep their existing `sql` tagged-template usage.
 *
 * Expects:  DATABASE_URL=postgresql://postgres:PASSWORD@db.avqwpebveqetwwzkmtux.supabase.co:5432/postgres
 * (or the Supabase pooled URL for better serverless performance)
 */

import postgres from "postgres";

export function isDbConfigured(): boolean {
  return !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

// Lazy singleton — created once per cold start (connection is reused within same lambda)
let _sql: ReturnType<typeof postgres> | null = null;

function getClient(): ReturnType<typeof postgres> {
  if (_sql) return _sql;
  const connString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connString) throw new Error("DATABASE_URL not set");
  _sql = postgres(connString, {
    max: 1,               // Vercel serverless: 1 connection per function instance
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",       // Supabase requires SSL
  });
  return _sql;
}

/**
 * Thin wrapper: makes `await sql\`...\`` return `{ rows: [...] }` so existing
 * API routes work without changes.
 */
type SqlResult = { rows: Record<string, unknown>[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sql(strings: TemplateStringsArray, ...values: any[]): Promise<SqlResult> {
  const client = getClient();
  // postgres() tagged template returns rows directly as an array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (client as any)(strings, ...values);
  return { rows: rows as Record<string, unknown>[] };
}
