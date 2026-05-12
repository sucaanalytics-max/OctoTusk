import { auth } from "@/auth";
import { redirect } from "next/navigation";
import db from "@/data/database.json";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { getSectorInfo } from "@/lib/sectors";
import PreviewsClient, { type PreviewSeedStock } from "./PreviewsClient";

export const dynamic = "force-dynamic";

interface StockSnapshot {
  tikr: string;
  official_name?: string;
  sector?: string;
  subsector?: string;
  upside_bear?: number;
  upside_base?: number;
  upside_bull?: number;
  upside_1y?: number;
}

export default async function PreviewsPage() {
  const authPromise = auth();
  const snapshotPromise = isSupabaseConfigured()
    ? getSupabase().from("sync_snapshot").select("stocks").eq("id", 1).single()
    : Promise.resolve(null);

  let session = null;
  try {
    session = await authPromise;
  } catch {
    redirect("/");
  }
  if (!session?.user) redirect("/");

  let stocks: StockSnapshot[] = db.stocks as unknown as StockSnapshot[];

  try {
    const result = await snapshotPromise;
    if (result && !("error" in result && result.error) && result.data) {
      const data = result.data as { stocks?: unknown };
      if (Array.isArray(data.stocks) && data.stocks.length > 0) {
        const seen = new Set<string>();
        stocks = (data.stocks as StockSnapshot[]).filter((s) => {
          const k = s.tikr?.toLowerCase();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }
    }
  } catch {
    /* fall through to database.json */
  }

  const seed: PreviewSeedStock[] = stocks.map((s) => {
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
    };
  });

  const displayToken = process.env.OCTOPUS_DISPLAY_TOKEN ?? "";
  if (!displayToken) {
    return (
      <div className="octopus-config-error">
        OCTOPUS_DISPLAY_TOKEN is not set.
      </div>
    );
  }

  return <PreviewsClient seed={seed} displayToken={displayToken} />;
}
