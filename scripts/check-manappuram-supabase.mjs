// READ-ONLY: shows the live Manappuram record in the production Supabase snapshot.
// Run: node --env-file=.env.local scripts/check-manappuram-supabase.mjs
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb.from("sync_snapshot").select("synced_at, stocks").eq("id", 1).single();
if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}
console.log("snapshot synced_at:", data.synced_at);
const stocks = data.stocks || [];
console.log("total stocks in snapshot:", stocks.length);
const m = stocks.filter((s) => /manappuram/i.test(s.tikr || "") || /manappuram/i.test(s.official_name || ""));
console.log("Manappuram rows:", m.length);
for (const s of m) {
  console.log(
    JSON.stringify({
      tikr: s.tikr,
      official_name: s.official_name,
      bear: s.bear_current,
      base: s.base_current,
      bull: s.bull_current,
      last_updated: s.last_updated,
      vf_web_url: s.vf_web_url ?? null,
      _vf_source: s._vf_source ?? null,
      _vf_method: s._vf_method ?? null,
      vp: s.vp,
      sa: s.sa,
    })
  );
}
