// Apply migrations/*.sql to the OctoTusk Supabase DB via direct Postgres (DATABASE_URL).
// Run: node --env-file=.env.local scripts/run-migrations.mjs
// Idempotent (create ... if not exists). Credentials come from DATABASE_URL and are never printed.

import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set (run with: node --env-file=.env.local scripts/run-migrations.mjs)");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, prepare: false });

const migDir = join(root, "migrations");
const files = readdirSync(migDir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

try {
  for (const f of files) {
    const text = readFileSync(join(migDir, f), "utf8");
    process.stdout.write(`Applying ${f} … `);
    await sql.unsafe(text).simple();
    console.log("✓");
  }

  // Seed the CIO role (least-privilege default for everyone else; fail-closed).
  const cio = "jay.bansal@tuskinvest.com";
  await sql`insert into user_roles (email, role) values (${cio}, 'cio')
            on conflict (email) do update set role = excluded.role, updated_at = now()`;
  console.log(`Seeded ${cio} as cio ✓`);

  // Verify
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('user_roles','stock_notes','note_edits','stock_follows','push_subscriptions','push_alert_mutes','pin_attempts')
    order by table_name`;
  console.log("\nTables present:", tables.map((t) => t.table_name).join(", "));
  const roles = await sql`select email, role from user_roles order by email`;
  console.log("user_roles:", roles.map((r) => `${r.email}=${r.role}`).join(", ") || "(none)");
  console.log("\nDone.");
} catch (e) {
  console.error("\nMigration failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
