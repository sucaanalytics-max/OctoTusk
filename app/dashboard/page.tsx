import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import DashboardClient from "./DashboardClient";
import db from "@/data/database.json";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export default async function DashboardPage() {
  // Start both auth + Supabase fetch in parallel (independent I/O)
  const authPromise = auth();
  const snapshotPromise = isSupabaseConfigured()
    ? getSupabase().from("sync_snapshot").select("stocks, ticker_map, synced_at").eq("id", 1).single()
    : Promise.resolve(null);

  let session = null;
  try {
    session = await authPromise;
  } catch {
    redirect("/");
  }

  if (!session?.user) {
    redirect("/");
  }

  const userEmail = String(session.user.email || "");

  // ── Load latest synced snapshot from Supabase (already in-flight) ──
  // Falls back to database.json if Supabase not configured or no snapshot exists.
  type DbStocks = typeof db.stocks;
  type DbTickerMap = typeof db.ticker_map;

  let stocks: DbStocks = db.stocks;
  let tickerMap: DbTickerMap = db.ticker_map;
  let snapshotSyncedAt: string | null = null;

  try {
    const result = await snapshotPromise;
    if (result && !("error" in result && result.error) && result.data) {
      const data = result.data;
      if (Array.isArray(data.stocks) && (data.stocks as unknown[]).length > 0) {
        stocks = data.stocks as DbStocks;
      }
      if (data.ticker_map && typeof data.ticker_map === "object") {
        tickerMap = data.ticker_map as DbTickerMap;
      }
      snapshotSyncedAt = data.synced_at as string ?? null;
    }
  } catch (err) {
    // Supabase unavailable — fall back silently to database.json
    console.warn("[page] Snapshot load failed, using static db:", err instanceof Error ? err.message : err);
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      {/* Header */}
      <header style={{ background: "var(--color-bg-secondary)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="max-w-[1600px] mx-auto px-5 py-3 flex items-center justify-between app-header-inner">
          <div className="flex items-center gap-3">
            <Image src="/tusk-logo.svg" alt="Tusk Investments" width={160} height={32} priority unoptimized />
            <div style={{ width: 1, height: 24, background: "var(--color-border)", margin: "0 4px" }} />
            <div>
              <p className="font-semibold leading-tight" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>OctoTusk</p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{db.metadata.unique_stocks} Equities &middot; {db.holdings.length} Holdings</p>
            </div>
          </div>
          <div className="flex items-center gap-4 app-header-actions">
            <span className="truncate" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", maxWidth: 200 }}>{userEmail}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="btn btn-ghost btn-sm"
                aria-label="Sign out of dashboard"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      <DashboardClient
        stocks={stocks as unknown as Parameters<typeof DashboardClient>[0]["stocks"]}
        tickerMap={tickerMap as Record<string, string>}
        metadata={{ ...(db.metadata as Record<string, unknown>), snapshot_synced_at: snapshotSyncedAt }}
      />
    </div>
  );
}
