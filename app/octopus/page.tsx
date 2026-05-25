import { auth } from "@/auth";
import { redirect } from "next/navigation";
import db from "@/data/database.json";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { getSectorInfo } from "@/lib/sectors";
import { isRemovedStock } from "@/lib/removedStocks";
import OctopusClient, { type OctopusSeedStock } from "./OctopusClient";

export const dynamic = "force-dynamic";

const STOCK_LIST_STALE_DAYS = 7;

interface StockSnapshot {
  tikr: string;
  official_name?: string;
  sector?: string;
  subsector?: string;
  upside_bear?: number;
  upside_base?: number;
  upside_bull?: number;
  upside_1y?: number;
  bear_current?: number;
  base_current?: number;
  bull_current?: number;
  target_1y?: number;
}

export default async function OctopusPage() {
  const authPromise = auth();
  const snapshotPromise = isSupabaseConfigured()
    ? getSupabase().from("sync_snapshot").select("stocks, synced_at").eq("id", 1).single()
    : Promise.resolve(null);

  let session = null;
  try {
    session = await authPromise;
  } catch {
    redirect("/");
  }
  if (!session?.user) redirect("/");

  let stocks: StockSnapshot[] = db.stocks as unknown as StockSnapshot[];
  let snapshotSyncedAt: string | null = null;

  try {
    const result = await snapshotPromise;
    if (result && !("error" in result && result.error) && result.data) {
      const data = result.data as { stocks?: unknown; synced_at?: unknown };
      if (Array.isArray(data.stocks) && data.stocks.length > 0) {
        const seen = new Set<string>();
        stocks = (data.stocks as StockSnapshot[]).filter((s) => {
          const k = s.tikr?.toLowerCase();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }
      if (typeof data.synced_at === "string") snapshotSyncedAt = data.synced_at;
    }
  } catch (err) {
    console.warn("[octopus] Snapshot load failed, using static db:", err instanceof Error ? err.message : err);
  }

  const seed: OctopusSeedStock[] = stocks.filter((s) => !isRemovedStock(s)).map((s) => {
    const info = getSectorInfo(s.tikr, { sector: s.sector, subsector: s.subsector });
    return {
      tikr: s.tikr,
      name: s.official_name ?? s.tikr,
      sector: info.sector,
      subsector: info.subsector,
      bearUpside: typeof s.upside_bear === "number" ? s.upside_bear : null,
      baseUpside: typeof s.upside_base === "number" ? s.upside_base : null,
      bullUpside: typeof s.upside_bull === "number" ? s.upside_bull : null,
      oneYearUpside: typeof s.upside_1y === "number" ? s.upside_1y : null,
      bearPrice: typeof s.bear_current === "number" ? s.bear_current : null,
      basePrice: typeof s.base_current === "number" ? s.base_current : null,
      bullPrice: typeof s.bull_current === "number" ? s.bull_current : null,
      oneYearPrice: typeof s.target_1y === "number" ? s.target_1y : null,
    };
  });

  const stockListStale = snapshotSyncedAt
    ? Date.now() - new Date(snapshotSyncedAt).getTime() > STOCK_LIST_STALE_DAYS * 24 * 60 * 60 * 1000
    : false;

  const displayToken = process.env.OCTOPUS_DISPLAY_TOKEN ?? "";
  if (!displayToken) {
    return (
      <div className="octopus-config-error">
        OCTOPUS_DISPLAY_TOKEN is not set. The wall display cannot poll the data feed.
      </div>
    );
  }

  return (
    <OctopusClient
      seed={seed}
      displayToken={displayToken}
      stockListStale={stockListStale}
      centerpiece="table"
      showRail={false}
    />
  );
}
