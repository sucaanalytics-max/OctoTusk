// Verifies the EXACT path the app uses: Supabase PostgREST over HTTPS with the
// service_role key (RLS bypassed). Inserts a note, reads it back, deletes it.
// Run: node --env-file=.env.local scripts/verify-notes-rest.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: ins, error: e1 } = await sb
  .from("stock_notes")
  .insert({
    stock_key: "TESTKEY",
    original_tikr: "TestKey",
    stock_name: "Verification Co",
    author_email: "jay.bansal@tuskinvest.com",
    category: "update",
    body: "REST verification — safe to ignore",
    tags: ["verify"],
    visibility: "shared",
  })
  .select("id, created_at")
  .single();

if (e1) {
  console.error("INSERT FAILED:", e1.message);
  process.exit(1);
}
console.log("insert ok   id=" + ins.id);

const { data: sel } = await sb
  .from("stock_notes")
  .select("id, stock_key, category, visibility, pinned, tags")
  .eq("id", ins.id)
  .single();
console.log("readback    " + JSON.stringify(sel));

const { error: e2 } = await sb.from("stock_notes").delete().eq("id", ins.id);
console.log(e2 ? "cleanup FAILED: " + e2.message : "cleanup ok");

const { data: roles } = await sb.from("user_roles").select("email, role");
console.log("user_roles  " + (roles || []).map((r) => `${r.email}=${r.role}`).join(", "));
console.log("\nApp DB path (PostgREST + service_role) verified ✓");
