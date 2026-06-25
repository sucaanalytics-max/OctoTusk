// Server component: loads snapshot, builds CompareStock[], passes to client.
// SSR pattern mirrors app/octopus/page.tsx exactly.
import { redirect } from "next/navigation";
import db from "@/data/database.json";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { isRemovedStock } from "@/lib/removedStocks";
import { buildCompareStock, type RawSnapshotRow } from "@/lib/compare/buildCompareStock";
import CompareClient from "./CompareClient";

export const dynamic = "force-dynamic";

// Layout already auth-gates this route; page just loads data.
export default async function ComparePage() {
  let stocks: RawSnapshotRow[] = db.stocks as unknown as RawSnapshotRow[];

  if (isSupabaseConfigured()) {
    try {
      const result = await getSupabase()
        .from("sync_snapshot")
        .select("stocks")
        .eq("id", 1)
        .single();
      if (result && !result.error && result.data) {
        const data = result.data as { stocks?: unknown };
        if (Array.isArray(data.stocks) && data.stocks.length > 0) {
          const seen = new Set<string>();
          stocks = (data.stocks as RawSnapshotRow[]).filter((s) => {
            const k = s.tikr?.toLowerCase();
            if (!k || seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        }
      }
    } catch (err) {
      console.warn(
        "[compare] Snapshot load failed, using static db:",
        err instanceof Error ? err.message : err
      );
      // fall through — stocks already set to db.stocks above
    }
  }

  const seed = stocks
    .filter((s) => !isRemovedStock(s))
    .map((s) => buildCompareStock(s));

  return <CompareClient seed={seed} />;
}
