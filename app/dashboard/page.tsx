import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";
import db from "@/data/database.json";

export default async function DashboardPage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    redirect("/");
  }

  if (!session?.user) {
    redirect("/");
  }

  const userEmail = String(session.user.email || "");

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      {/* Header */}
      <header style={{ background: "var(--color-bg-secondary)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="max-w-[1600px] mx-auto px-5 py-3 flex items-center justify-between app-header-inner">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--color-accent-tusk)" }}>
              <span className="text-white font-bold text-base" style={{ fontFamily: "var(--font-sans)" }}>T</span>
            </div>
            <div>
              <h1 className="font-bold leading-tight" style={{ fontSize: "var(--text-lg)", color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>OctoTusk</h1>
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
        stocks={db.stocks as unknown as Parameters<typeof DashboardClient>[0]["stocks"]}
        tickerMap={db.ticker_map as Record<string, string>}
        metadata={db.metadata as Record<string, unknown>}
      />
    </div>
  );
}
