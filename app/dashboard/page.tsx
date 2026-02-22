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
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* Header */}
      <header className="bg-tusk-dark text-white shadow-lg">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-tusk-accent rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Tusk Dashboard</h1>
              <p className="text-gray-400 text-xs">{db.metadata.unique_stocks} Stocks &middot; {db.holdings.length} Holdings</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-300">{userEmail}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-md transition-colors"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      <DashboardClient
        stocks={db.stocks as any}
        tickerMap={db.ticker_map as any}
        metadata={db.metadata as any}
      />
    </div>
  );
}
