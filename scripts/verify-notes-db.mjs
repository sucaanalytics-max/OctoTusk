// Verifies the notes schema accepts a realistic insert (constraints, defaults), reads it
// back, then cleans up. Run: node --env-file=.env.local scripts/verify-notes-db.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, prepare: false });

try {
  const [ins] = await sql`
    insert into stock_notes (stock_key, original_tikr, stock_name, author_email, category, body, tags, visibility, mentions)
    values ('TESTKEY','TestKey','Verification Co','jay.bansal@tuskinvest.com','update','schema verification — safe to ignore', array['verify'], 'shared', '{}')
    returning id, created_at, updated_at`;
  console.log("insert ok  id=" + ins.id);

  const [back] = await sql`select id, stock_key, category, visibility, pinned, edited, tags from stock_notes where id = ${ins.id}`;
  console.log("readback   ", JSON.stringify(back));

  // exercise the audit + soft-delete path
  await sql`insert into note_edits (note_id, editor_email, action, prev_body) values (${ins.id}, 'jay.bansal@tuskinvest.com', 'edit', 'old')`;
  await sql`update stock_notes set deleted_at = now() where id = ${ins.id}`;
  console.log("audit+soft-delete ok");

  // hard cleanup of the test rows
  await sql`delete from note_edits where note_id = ${ins.id}`;
  await sql`delete from stock_notes where id = ${ins.id}`;
  console.log("cleanup    ok");

  const roles = await sql`select email, role from user_roles order by email`;
  console.log("user_roles ", roles.map((r) => `${r.email}=${r.role}`).join(", "));
  console.log("\nDB layer verified ✓");
} catch (e) {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
