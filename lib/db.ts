import { sql, db as vercelDb } from "@vercel/postgres";

/**
 * Graceful Postgres wrapper.
 * If POSTGRES_URL is not configured, all operations silently no-op.
 * This keeps the app working locally without a database.
 */

export function isDbConfigured(): boolean {
  return !!(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

export { sql, vercelDb };
