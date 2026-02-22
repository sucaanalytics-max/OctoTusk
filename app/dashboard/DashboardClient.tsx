"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

// ── Types (matching JVB Output columns) ──
interface Stock {
  tikr: string;
  official_name?: string;
  in_fno?: string;
  holding_cash_lakhs?: number;
  holding_pct?: number;
  abs_leverage?: number;
  leverage_pct?: number;
  bear_current?: number;
  base_current?: number;
  bull_current?: number;
  target_1y?: number;
  target_2y?: number;
  div_yield?: number;
  cmp?: number;
  upside_bear?: number;
  upside_base?: number;
  upside_bull?: number;
  upside_1y?: number;
  upside_2y?: number;
  base_pe?: number;
  base_pe_2sd?: number;
  base_pb?: number;
  base_pb_2sd?: number;
  base_evebitda?: number;
  base_evebitda_2sd?: number;
  reviewed_pranay?: number;
  vp?: string;
  sa?: string;
  conviction?: number;
  understanding?: number;
  sector?: string;
  subsector?: string;
  last_updated?: string;
  comments?: string;
  score?: number;
  score_adj_1y?: number;
  remarks?: string;
  exp_profit_fy27?: number;
  exp_profit_fy28?: number;
  [key: string]: unknown;
}

interface Holding {
  asset_name: string;
  quantity: number;
  avg_price: number;
  amt_invested: number;
  current_price: number;
  overall_gain: number;
  overall_gain_pct: number;
  current_value: number;
}

interface QuoteData {
  price: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: string;
}

interface Props {
  stocks: Stock[];
  tickerMap: Record<string, string>;
  metadata: Record<string, unknown>;
}

// ── Market Hours Helper (IST: Mon-Fri 9:15-15:30) ──
const CMP_REFRESH_INTERVAL = 60;

const isMarketOpen = (): boolean => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const timeInMins = ist.getHours() * 60 + ist.getMinutes();
  return timeInMins >= 9 * 60 + 15 && timeInMins <= 15 * 60 + 30;
};

// ── Helpers ──
const fmt = (n: number | undefined | null, decimals = 0): string => {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: decimals });
};

const fmtPct = (n: number | undefined | null): string => {
  if (n == null || isNaN(n)) return "—";
  const pct = Math.abs(n) < 1 ? n * 100 : n;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
};

const fmtCr = (n: number | undefined | null): string => {
  if (n == null || isNaN(n)) return "—";
  const cr = n / 10000000;
  return `${cr.toFixed(1)} Cr`;
};

const fmtLakhs = (n: number | undefined | null): string => {
  if (n == null || isNaN(n)) return "—";
  return `₹${n.toFixed(1)}L`;
};

const pctColor = (n: number | undefined | null): string => {
  if (n == null) return "";
  const val = Math.abs(n) < 1 ? n * 100 : n;
  if (val > 5) return "cell-green";
  if (val < -5) return "cell-red";
  return "cell-amber";
};

const cleanTikr = (tikr: string | null | undefined): string => {
  if (!tikr || typeof tikr !== "string") return "";
  if (tikr.includes("(XNSE:")) {
    const match = tikr.match(/\(XNSE:(\w+)\)/);
    return match ? match[1] : tikr;
  }
  if (tikr.includes("(XBOM:")) {
    const match = tikr.match(/\(XBOM:(\w+)\)/);
    return match ? match[1] : tikr;
  }
  if (tikr.startsWith("XNSE:")) return tikr.replace("XNSE:", "");
  if (tikr.startsWith("XBOM:")) return tikr.replace("XBOM:", "");
  if (tikr.includes(" ")) return tikr.split(" ")[0];
  return tikr;
};

const getCompanyShort = (stock: Stock): string => {
  const name = String(stock.official_name || stock.tikr || "");
  if (!name) return cleanTikr(stock.tikr);
  return name
    .replace(/ LIMITED$/i, "")
    .replace(/ LTD$/i, "")
    .replace(/ PRIVATE$/i, "")
    .replace(/ CORPORATION$/i, " Corp")
    .trim();
};

// ── Main Component ──
export default function DashboardClient({ stocks, tickerMap, metadata }: Props) {
  const [activeTab, setActiveTab] = useState<"database" | "holdings" | "decisions">("database");
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortCol, setSortCol] = useState<string>("tikr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Dynamic filters
  const [filterSector, setFilterSector] = useState<string>("all");
  const [filterVP, setFilterVP] = useState<string>("all");
  const [filterConviction, setFilterConviction] = useState<string>("all");
  const [filterFnO, setFilterFnO] = useState<string>("all");

  // Auto-refresh state
  const [countdown, setCountdown] = useState(CMP_REFRESH_INTERVAL);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());

  // Data refresh state
  const [liveStocks, setLiveStocks] = useState<Stock[]>(stocks);
  const [dataRefreshing, setDataRefreshing] = useState(false);
  const [dataLastRefreshed, setDataLastRefreshed] = useState<string | null>(null);

  // Holdings state
  const [holdingsUnlocked, setHoldingsUnlocked] = useState(false);
  const [holdingsPin, setHoldingsPin] = useState("");
  const [holdingsData, setHoldingsData] = useState<Holding[]>([]);
  const [holdingsError, setHoldingsError] = useState("");
  const [holdingsLoading, setHoldingsLoading] = useState(false);

  // ── Auto-lock holdings when switching tabs ──
  const handleTabSwitch = (tab: typeof activeTab) => {
    if (activeTab === "holdings" && tab !== "holdings") {
      setHoldingsUnlocked(false);
      setHoldingsData([]);
      setHoldingsPin("");
      setHoldingsError("");
    }
    setActiveTab(tab);
  };

  // Fetch CMP quotes
  const fetchQuotes = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const res = await fetch("/api/quotes");
      const data = await res.json();
      if (data.quotes) {
        setQuotes(data.quotes);
        setLastFetched(data.fetchedAt);
      }
    } catch (err) {
      console.error("Failed to fetch quotes:", err);
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  // Auto-refresh CMP during market hours
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      setMarketOpen(isMarketOpen());
      setCountdown((prev) => {
        if (prev <= 1) {
          if (isMarketOpen()) fetchQuotes();
          return CMP_REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchQuotes]);

  // Refresh database from server
  const refreshData = useCallback(async () => {
    setDataRefreshing(true);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json();
      if (data.stocks) {
        setLiveStocks(data.stocks);
        setDataLastRefreshed(data.refreshedAt);
      }
    } catch (err) {
      console.error("Failed to refresh data:", err);
    } finally {
      setDataRefreshing(false);
    }
  }, []);

  // Compute unique filter options
  const filterOptions = useMemo(() => {
    const sectors = Array.from(new Set(liveStocks.map((s) => s.sector).filter(Boolean))).sort() as string[];
    const vps = Array.from(new Set(liveStocks.map((s) => s.vp).filter(Boolean))).sort() as string[];
    const convictions = Array.from(new Set(liveStocks.map((s) => s.conviction).filter((c) => c != null))).sort((a, b) => (b as number) - (a as number)) as number[];
    return { sectors, vps, convictions };
  }, [liveStocks]);

  // Enrich stocks with live CMP
  const enrichedStocks = useMemo(() => {
    return liveStocks.map((s) => {
      const tikrKey = s.tikr || "";
      const q = tikrKey ? quotes[tikrKey] : undefined;
      const liveCmp = q?.price || s.cmp;
      const bear = s.bear_current;
      const base = s.base_current;
      const bull = s.bull_current;

      let upsideBear, upsideBase, upsideBull;
      if (liveCmp && bear) upsideBear = (bear - liveCmp) / liveCmp;
      if (liveCmp && base) upsideBase = (base - liveCmp) / liveCmp;
      if (liveCmp && bull) upsideBull = (bull - liveCmp) / liveCmp;

      return {
        ...s,
        liveCmp,
        liveChange: q?.change,
        liveChangePct: q?.changePct,
        liveVolume: q?.volume,
        upsideBearCalc: upsideBear,
        upsideBaseCalc: upsideBase,
        upsideBullCalc: upsideBull,
        displayTikr: cleanTikr(s.tikr),
        companyShort: getCompanyShort(s),
      };
    });
  }, [liveStocks, quotes]);

  // Sorting
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  // Filtered + sorted stocks
  const sortedStocks = useMemo(() => {
    const filtered = enrichedStocks.filter((s) => {
      // Text search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches =
          s.tikr?.toLowerCase().includes(term) ||
          s.displayTikr?.toLowerCase().includes(term) ||
          s.companyShort?.toLowerCase().includes(term) ||
          s.sector?.toLowerCase().includes(term) ||
          s.official_name?.toLowerCase().includes(term) ||
          s.vp?.toLowerCase().includes(term) ||
          s.sa?.toLowerCase().includes(term);
        if (!matches) return false;
      }
      // Dropdown filters
      if (filterSector !== "all" && s.sector !== filterSector) return false;
      if (filterVP !== "all" && s.vp !== filterVP) return false;
      if (filterConviction !== "all" && String(s.conviction) !== filterConviction) return false;
      if (filterFnO !== "all") {
        if (filterFnO === "Yes" && s.in_fno !== "Yes") return false;
        if (filterFnO === "No" && s.in_fno !== "No") return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const av = a[sortCol as keyof typeof a];
      const bv = b[sortCol as keyof typeof b];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [enrichedStocks, searchTerm, sortCol, sortDir, filterSector, filterVP, filterConviction, filterFnO]);

  // Holdings unlock
  const unlockHoldings = async () => {
    setHoldingsLoading(true);
    setHoldingsError("");
    try {
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: holdingsPin }),
      });
      const data = await res.json();
      if (data.unlocked) {
        setHoldingsData(data.holdings);
        setHoldingsUnlocked(true);
      } else {
        setHoldingsError(data.error || "Invalid PIN");
      }
    } catch {
      setHoldingsError("Failed to verify PIN");
    } finally {
      setHoldingsLoading(false);
    }
  };

  // Holdings with live prices
  const enrichedHoldings = useMemo(() => {
    if (!holdingsData.length) return [];
    const nameToTikr: Record<string, string> = {
      "Kilburn Engineering": "XBOM:522101",
      "Vedanta Limited": "VEDL",
      "Nexus Select Trust": "NXST",
      "Multi Commodity Exchange of India": "MCX",
      "Tips Music": "TIPSMUSIC",
      "Apeejay Surrendra Park Hotels": "PARKHOTELS",
      "Aditya Birla Sun Life AMC": "ABSLAMC",
      "Bajaj Finserv": "BAJAJFINSV",
      "SPML Infra": "SPMLINFRA",
      "JM Financial": "JMFINANCIL",
      "IIFL Capital Services": "IIFLCAPS",
      "Godawari Power & Ispat": "GPIL",
      "Manappuram Finance": "MANAPPURAM",
      "Canara Robeco Asset Management Company": "CRAMC",
      "Suraksha Diagnostic": "SURAKSHA",
      "Annapurna Swadisht": "ANNAPURNA",
      "Smartworks Coworking Spaces": "Smartworks",
      "ICICI Prudential Asset Management Company": "ICICIAMC",
      "E2E Networks": "E2E",
      "Wework India Management": "Wework",
      "Duroply Industries": "XBOM:516003",
      "State Bank Of India": "SBIN",
      "GPT Infraprojects": "GPTINFRA",
      "Virtuoso Optoelectronics": "VIRTUOSO OPTOELECTRONICS LIMITED (XBOM:543597)",
      "BSE Ltd": "BSE",
      "GPT Healthcare": "GPTHEALTH",
      "Motilal Oswal Financial": "MOTILALOFS",
      "KFin Technologies": "KFINTECH",
      "360 One Wam": "360ONE",
    };

    return holdingsData.map((h) => {
      const tikr = nameToTikr[h.asset_name];
      const stockData = tikr ? enrichedStocks.find((s) => s.tikr === tikr) : null;
      const livePrice = tikr && quotes[tikr] ? quotes[tikr].price : h.current_price;
      const liveValue = livePrice * h.quantity;
      const liveGain = liveValue - h.amt_invested;
      const liveGainPct = h.amt_invested > 0 ? (liveGain / h.amt_invested) * 100 : 0;

      return {
        ...h,
        tikr,
        stockData,
        livePrice,
        liveValue,
        liveGain,
        liveGainPct,
        upsideToBear: stockData?.bear_current && livePrice
          ? ((stockData.bear_current - livePrice) / livePrice) * 100 : null,
        upsideToBase: stockData?.base_current && livePrice
          ? ((stockData.base_current - livePrice) / livePrice) * 100 : null,
        upsideToBull: stockData?.bull_current && livePrice
          ? ((stockData.bull_current - livePrice) / livePrice) * 100 : null,
      };
    });
  }, [holdingsData, quotes, enrichedStocks]);

  // Decision support
  const decisionData = useMemo(() => {
    const withCmp = enrichedStocks.filter((s) => s.liveCmp && s.bear_current && s.base_current && s.bull_current);
    const buyZone = withCmp
      .filter((s) => s.upsideBearCalc != null && s.upsideBearCalc >= -0.10 && s.upsideBearCalc <= 0.05)
      .sort((a, b) => (b.upsideBaseCalc || 0) - (a.upsideBaseCalc || 0));
    const sellZone = withCmp
      .filter((s) => s.upsideBullCalc != null && s.upsideBullCalc >= -0.05 && s.upsideBullCalc <= 0.10)
      .sort((a, b) => (a.upsideBullCalc || 0) - (b.upsideBullCalc || 0));
    const bestUpside = [...withCmp]
      .filter((s) => s.upsideBaseCalc != null && s.upsideBaseCalc > 0)
      .sort((a, b) => (b.upsideBaseCalc || 0) - (a.upsideBaseCalc || 0))
      .slice(0, 15);
    const overvalued = withCmp
      .filter((s) => s.upsideBullCalc != null && s.upsideBullCalc < -0.05)
      .sort((a, b) => (a.upsideBullCalc || 0) - (b.upsideBullCalc || 0));
    const sectors: Record<string, { count: number; stocks: string[] }> = {};
    enrichedStocks.forEach((s) => {
      const sec = s.sector || "Uncategorized";
      if (!sectors[sec]) sectors[sec] = { count: 0, stocks: [] };
      sectors[sec].count++;
      sectors[sec].stocks.push(s.displayTikr);
    });
    const analysts: Record<string, { count: number; stocks: string[] }> = {};
    enrichedStocks.forEach((s) => {
      const vp = s.vp || "Unassigned";
      if (!analysts[vp]) analysts[vp] = { count: 0, stocks: [] };
      analysts[vp].count++;
      analysts[vp].stocks.push(s.displayTikr);
    });
    return { buyZone, sellZone, bestUpside, overvalued, sectors, analysts, totalWithCmp: withCmp.length };
  }, [enrichedStocks]);

  const Th = ({ col, label, className = "" }: { col: string; label: string; className?: string }) => (
    <th
      className={`${className} ${sortCol === col ? (sortDir === "asc" ? "sort-asc" : "sort-desc") : ""}`}
      onClick={() => handleSort(col)}
    >
      {label}
    </th>
  );

  const activeFilters = [filterSector, filterVP, filterConviction, filterFnO].filter((f) => f !== "all").length;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-4 bg-white rounded-xl shadow-sm px-2">
        {[
          { key: "database" as const, label: "Master Database", icon: "📊" },
          { key: "holdings" as const, label: "Holdings Analysis", icon: "🔒" },
          { key: "decisions" as const, label: "Decision Support", icon: "🎯" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabSwitch(tab.key)}
            className={`px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key ? "tab-active" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}

        {/* Status Bar */}
        <div className="ml-auto flex items-center gap-2 pr-2">
          {dataLastRefreshed && (
            <span className="text-xs text-gray-400">
              Data: {new Date(dataLastRefreshed).toLocaleTimeString("en-IN")}
            </span>
          )}
          <button
            onClick={refreshData}
            disabled={dataRefreshing}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            <span className={dataRefreshing ? "animate-spin inline-block" : ""}>
              {dataRefreshing ? "⟳" : "↻"}
            </span>
            {dataRefreshing ? "Refreshing..." : "Refresh Data"}
          </button>

          <span className="text-gray-300 mx-1">|</span>

          {lastFetched && (
            <span className="text-xs text-gray-400">
              CMP: {new Date(lastFetched).toLocaleTimeString("en-IN")}
            </span>
          )}
          {autoRefresh && marketOpen && (
            <span className="text-xs text-tusk-accent font-mono min-w-[28px] text-center">{countdown}s</span>
          )}
          {autoRefresh && !marketOpen && (
            <span className="text-xs text-gray-400" title="Auto-refresh paused outside market hours (Mon-Fri 9:15-15:30 IST)">
              Mkt closed
            </span>
          )}
          <button
            onClick={fetchQuotes}
            disabled={quotesLoading}
            className="text-xs bg-tusk-dark text-white px-3 py-1.5 rounded-md hover:bg-tusk-blue disabled:opacity-50 transition-colors"
          >
            {quotesLoading ? "Fetching..." : "Refresh CMP"}
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs px-2 py-1.5 rounded-md transition-colors ${
              autoRefresh ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-300 text-gray-600 hover:bg-gray-400"
            }`}
            title={autoRefresh ? "Auto-refresh ON (every 60s during market hours)" : "Auto-refresh OFF"}
          >
            {autoRefresh ? "Auto: ON" : "Auto: OFF"}
          </button>
        </div>
      </div>

      {/* ═══════════════════════ TAB 1: MASTER DATABASE ═══════════════════════ */}
      {activeTab === "database" && (
        <div>
          {/* Search & Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <input
              type="text"
              placeholder="Search ticker, company, sector, VP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-[250px] max-w-md px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-tusk-accent/30"
            />
            <select value={filterSector} onChange={(e) => setFilterSector(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
              <option value="all">All Sectors</option>
              {filterOptions.sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterVP} onChange={(e) => setFilterVP(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
              <option value="all">All VPs</option>
              {filterOptions.vps.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filterConviction} onChange={(e) => setFilterConviction(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
              <option value="all">All Conviction</option>
              {filterOptions.convictions.map((c) => <option key={c} value={String(c)}>{c}</option>)}
            </select>
            <select value={filterFnO} onChange={(e) => setFilterFnO(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
              <option value="all">F&O: All</option>
              <option value="Yes">F&O: Yes</option>
              <option value="No">F&O: No</option>
            </select>
            {activeFilters > 0 && (
              <button
                onClick={() => { setFilterSector("all"); setFilterVP("all"); setFilterConviction("all"); setFilterFnO("all"); }}
                className="text-xs text-tusk-accent hover:underline"
              >
                Clear filters ({activeFilters})
              </button>
            )}
            <span className="text-xs text-gray-500 ml-auto">
              {sortedStocks.length} stocks {Object.keys(quotes).length > 0 && `· ${Object.keys(quotes).length} live prices`}
            </span>
            <button
              onClick={() => {
                const csv = [
                  ["Ticker", "Company", "Sector", "VP", "SA", "Conviction", "F&O", "Bear", "Base", "Bull", "CMP", "↑Bear", "↑Base", "↑Bull", "1Y Target", "2Y Target", "Base PE", "Score", "Comments"].join(","),
                  ...sortedStocks.map(s => [
                    s.displayTikr, `"${s.companyShort}"`, `"${s.sector || ""}"`, s.vp || "", s.sa || "", s.conviction ?? "", s.in_fno || "",
                    s.bear_current?.toFixed(0) || "", s.base_current?.toFixed(0) || "", s.bull_current?.toFixed(0) || "",
                    s.liveCmp?.toFixed(0) || "",
                    s.upsideBearCalc != null ? (s.upsideBearCalc * 100).toFixed(1) + "%" : "",
                    s.upsideBaseCalc != null ? (s.upsideBaseCalc * 100).toFixed(1) + "%" : "",
                    s.upsideBullCalc != null ? (s.upsideBullCalc * 100).toFixed(1) + "%" : "",
                    s.target_1y?.toFixed(0) || "", s.target_2y?.toFixed(0) || "",
                    s.base_pe?.toFixed(1) || "", s.score ?? "", `"${s.comments || ""}"`
                  ].join(","))
                ].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `tusk_database_${new Date().toISOString().split("T")[0]}.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="text-xs bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700"
            >
              Export CSV
            </button>
          </div>

          {/* Data Table - JVB Output columns */}
          <div className="bg-white rounded-xl shadow-sm overflow-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
            <table className="data-table w-full">
              <thead>
                <tr>
                  <Th col="displayTikr" label="Ticker" />
                  <Th col="companyShort" label="Company" />
                  <Th col="sector" label="Sector" />
                  <Th col="vp" label="VP" />
                  <Th col="conviction" label="Conv." />
                  <Th col="in_fno" label="F&O" />
                  <Th col="liveCmp" label="CMP (₹)" />
                  <Th col="liveChangePct" label="Chg%" />
                  <Th col="bear_current" label="Bear" />
                  <Th col="base_current" label="Base" />
                  <Th col="bull_current" label="Bull" />
                  <Th col="upsideBearCalc" label="↑Bear" />
                  <Th col="upsideBaseCalc" label="↑Base" />
                  <Th col="upsideBullCalc" label="↑Bull" />
                  <Th col="upside_1y" label="↑1Y" />
                  <Th col="base_pe" label="PE" />
                  <Th col="score" label="Score" />
                  <Th col="holding_cash_lakhs" label="Hold(₹L)" />
                  <Th col="last_updated" label="Updated" />
                  <Th col="comments" label="Comments" />
                </tr>
              </thead>
              <tbody>
                {sortedStocks.map((s, i) => {
                  const isBuyZone = s.liveCmp && s.bear_current && s.liveCmp <= s.bear_current * 1.05;
                  const isSellZone = s.liveCmp && s.bull_current && s.liveCmp >= s.bull_current * 0.95;
                  return (
                    <tr key={`${s.tikr}-${i}`} className={isBuyZone ? "row-buy-zone" : isSellZone ? "row-sell-zone" : ""}>
                      <td className="font-semibold text-tusk-dark">{s.displayTikr}</td>
                      <td className="text-gray-600 max-w-[180px] truncate" title={s.companyShort}>{s.companyShort}</td>
                      <td className="text-xs">{s.sector || "—"}</td>
                      <td className="text-center">{s.vp || "—"}</td>
                      <td className="text-center">{s.conviction ?? "—"}</td>
                      <td className="text-center">{s.in_fno === "Yes" ? <span className="pill pill-green">Yes</span> : "—"}</td>
                      <td className="font-semibold">{s.liveCmp ? `₹${fmt(s.liveCmp, 1)}` : "—"}</td>
                      <td className={pctColor(s.liveChangePct)}>
                        {s.liveChangePct != null ? fmtPct(s.liveChangePct) : "—"}
                      </td>
                      <td>{s.bear_current ? `₹${fmt(s.bear_current, 0)}` : "—"}</td>
                      <td>{s.base_current ? `₹${fmt(s.base_current, 0)}` : "—"}</td>
                      <td>{s.bull_current ? `₹${fmt(s.bull_current, 0)}` : "—"}</td>
                      <td className={pctColor(s.upsideBearCalc)}>{s.upsideBearCalc != null ? fmtPct(s.upsideBearCalc) : "—"}</td>
                      <td className={pctColor(s.upsideBaseCalc)}>{s.upsideBaseCalc != null ? fmtPct(s.upsideBaseCalc) : "—"}</td>
                      <td className={pctColor(s.upsideBullCalc)}>{s.upsideBullCalc != null ? fmtPct(s.upsideBullCalc) : "—"}</td>
                      <td className={pctColor(s.upside_1y)}>{s.upside_1y != null ? fmtPct(s.upside_1y) : "—"}</td>
                      <td>{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</td>
                      <td className="text-center font-semibold">{s.score ?? "—"}</td>
                      <td>{s.holding_cash_lakhs ? fmtLakhs(s.holding_cash_lakhs) : "—"}</td>
                      <td className="text-xs text-gray-400">{s.last_updated || "—"}</td>
                      <td className="max-w-[180px] truncate text-gray-500 text-xs" title={s.comments || ""}>
                        {s.comments || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════ TAB 2: HOLDINGS (PIN-LOCKED) ═══════════════════════ */}
      {activeTab === "holdings" && (
        <div>
          {!holdingsUnlocked ? (
            <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
              <div className="metric-card text-center max-w-sm w-full">
                <div className="text-5xl mb-4">🔒</div>
                <h2 className="text-xl font-bold text-tusk-dark mb-2">Holdings Analysis</h2>
                <p className="text-gray-500 text-sm mb-6">Enter PIN to access portfolio holdings data</p>
                <input
                  type="password"
                  placeholder="Enter PIN"
                  value={holdingsPin}
                  onChange={(e) => setHoldingsPin(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && unlockHoldings()}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 text-center text-lg tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-tusk-accent/30"
                />
                {holdingsError && <p className="text-red-500 text-sm mb-3">{holdingsError}</p>}
                <button
                  onClick={unlockHoldings}
                  disabled={holdingsLoading || !holdingsPin}
                  className="w-full bg-tusk-dark hover:bg-tusk-blue text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  {holdingsLoading ? "Verifying..." : "Unlock"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-5 gap-4 mb-4">
                {(() => {
                  const totalInvested = enrichedHoldings.reduce((sum, h) => sum + h.amt_invested, 0);
                  const totalValue = enrichedHoldings.reduce((sum, h) => sum + h.liveValue, 0);
                  const totalGain = totalValue - totalInvested;
                  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
                  const bearValue = enrichedHoldings.reduce((sum, h) => sum + (h.stockData?.bear_current || h.livePrice) * h.quantity, 0);
                  const bullValue = enrichedHoldings.reduce((sum, h) => sum + (h.stockData?.bull_current || h.livePrice) * h.quantity, 0);
                  return (
                    <>
                      <div className="metric-card">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Total Invested</p>
                        <p className="text-xl font-bold text-tusk-dark mt-1">{fmtCr(totalInvested)}</p>
                      </div>
                      <div className="metric-card">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Current Value</p>
                        <p className="text-xl font-bold text-tusk-dark mt-1">{fmtCr(totalValue)}</p>
                      </div>
                      <div className="metric-card">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Unrealized P&L</p>
                        <p className={`text-xl font-bold mt-1 ${totalGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {totalGain >= 0 ? "+" : ""}{fmtCr(totalGain)} ({totalGainPct.toFixed(1)}%)
                        </p>
                      </div>
                      <div className="metric-card">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Bear Scenario</p>
                        <p className="text-xl font-bold text-red-600 mt-1">{fmtCr(bearValue)}</p>
                        <p className="text-xs text-gray-400">Drawdown: {totalValue ? ((bearValue - totalValue) / totalValue * 100).toFixed(1) : 0}%</p>
                      </div>
                      <div className="metric-card">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Bull Scenario</p>
                        <p className="text-xl font-bold text-green-600 mt-1">{fmtCr(bullValue)}</p>
                        <p className="text-xs text-gray-400">Upside: +{totalValue ? ((bullValue - totalValue) / totalValue * 100).toFixed(1) : 0}%</p>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="bg-white rounded-xl shadow-sm overflow-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th>Stock</th><th>Qty</th><th>Avg Cost (₹)</th><th>CMP (₹)</th>
                      <th>Invested</th><th>Current Value</th><th>P&L</th><th>P&L %</th>
                      <th>Bear (₹)</th><th>Base (₹)</th><th>Bull (₹)</th>
                      <th>↑ Bear</th><th>↑ Base</th><th>↑ Bull</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedHoldings.sort((a, b) => b.liveValue - a.liveValue).map((h, i) => (
                      <tr key={i}>
                        <td className="font-semibold text-tusk-dark">{h.asset_name}</td>
                        <td>{fmt(h.quantity)}</td>
                        <td>₹{fmt(h.avg_price, 1)}</td>
                        <td className="font-semibold">₹{fmt(h.livePrice, 1)}</td>
                        <td>{fmtCr(h.amt_invested)}</td>
                        <td className="font-semibold">{fmtCr(h.liveValue)}</td>
                        <td className={h.liveGain >= 0 ? "cell-green" : "cell-red"}>
                          {h.liveGain >= 0 ? "+" : ""}{fmtCr(h.liveGain)}
                        </td>
                        <td className={h.liveGainPct >= 0 ? "cell-green" : "cell-red"}>
                          {h.liveGainPct >= 0 ? "+" : ""}{h.liveGainPct.toFixed(1)}%
                        </td>
                        <td>{h.stockData?.bear_current ? `₹${fmt(h.stockData.bear_current, 0)}` : "—"}</td>
                        <td>{h.stockData?.base_current ? `₹${fmt(h.stockData.base_current, 0)}` : "—"}</td>
                        <td>{h.stockData?.bull_current ? `₹${fmt(h.stockData.bull_current, 0)}` : "—"}</td>
                        <td className={pctColor(h.upsideToBear != null ? h.upsideToBear / 100 : null)}>
                          {h.upsideToBear != null ? `${h.upsideToBear >= 0 ? "+" : ""}${h.upsideToBear.toFixed(1)}%` : "—"}
                        </td>
                        <td className={pctColor(h.upsideToBase != null ? h.upsideToBase / 100 : null)}>
                          {h.upsideToBase != null ? `${h.upsideToBase >= 0 ? "+" : ""}${h.upsideToBase.toFixed(1)}%` : "—"}
                        </td>
                        <td className={pctColor(h.upsideToBull != null ? h.upsideToBull / 100 : null)}>
                          {h.upsideToBull != null ? `${h.upsideToBull >= 0 ? "+" : ""}${h.upsideToBull.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ TAB 3: DECISION SUPPORT ═══════════════════════ */}
      {activeTab === "decisions" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card">
              <h3 className="font-bold text-tusk-dark mb-3 flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                Buy Zone ({decisionData.buyZone.length})
                <span className="text-xs font-normal text-gray-400 ml-1">CMP near Bear price</span>
              </h3>
              {decisionData.buyZone.length === 0 ? (
                <p className="text-gray-400 text-sm">No stocks in buy zone currently</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {decisionData.buyZone.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100">
                      <div>
                        <span className="font-semibold text-sm">{s.displayTikr}</span>
                        <span className="text-xs text-gray-400 ml-2">₹{fmt(s.liveCmp, 0)}</span>
                      </div>
                      <div className="text-right">
                        <span className="pill pill-green">Bear ₹{fmt(s.bear_current, 0)}</span>
                        <span className="text-xs text-green-600 ml-2 font-semibold">{fmtPct(s.upsideBaseCalc)} to base</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="metric-card">
              <h3 className="font-bold text-tusk-dark mb-3 flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                Take Profit Zone ({decisionData.sellZone.length})
                <span className="text-xs font-normal text-gray-400 ml-1">CMP near Bull price</span>
              </h3>
              {decisionData.sellZone.length === 0 ? (
                <p className="text-gray-400 text-sm">No stocks in sell zone currently</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {decisionData.sellZone.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100">
                      <div>
                        <span className="font-semibold text-sm">{s.displayTikr}</span>
                        <span className="text-xs text-gray-400 ml-2">₹{fmt(s.liveCmp, 0)}</span>
                      </div>
                      <div className="text-right">
                        <span className="pill pill-red">Bull ₹{fmt(s.bull_current, 0)}</span>
                        <span className="text-xs text-red-600 ml-2 font-semibold">{fmtPct(s.upsideBullCalc)} to bull</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card">
              <h3 className="font-bold text-tusk-dark mb-3 flex items-center gap-2">
                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                Best Upside to Base (Top 15)
              </h3>
              <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
                {decisionData.bestUpside.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                      <span className="font-semibold text-sm">{s.displayTikr}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">₹{fmt(s.liveCmp, 0)}</span>
                      <span className="text-xs text-gray-400">→</span>
                      <span className="text-xs font-medium">₹{fmt(s.base_current, 0)}</span>
                      <span className="font-bold text-green-600 text-sm min-w-[60px] text-right">{fmtPct(s.upsideBaseCalc)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="metric-card">
              <h3 className="font-bold text-tusk-dark mb-3 flex items-center gap-2">
                <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                Overvalued (CMP above Bull)
                <span className="text-xs font-normal text-gray-400 ml-1">{decisionData.overvalued.length} stocks</span>
              </h3>
              {decisionData.overvalued.length === 0 ? (
                <p className="text-gray-400 text-sm">No stocks trading above bull case</p>
              ) : (
                <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
                  {decisionData.overvalued.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{s.displayTikr}</span>
                        <span className="text-xs text-gray-400">₹{fmt(s.liveCmp, 0)}</span>
                      </div>
                      <div>
                        <span className="pill pill-red">Bull ₹{fmt(s.bull_current, 0)}</span>
                        <span className="font-bold text-red-600 text-sm ml-2">{fmtPct(s.upsideBullCalc)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="metric-card col-span-1">
              <h3 className="font-bold text-tusk-dark mb-3">Coverage Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Total Stocks</span><span className="font-bold">{enrichedStocks.length}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">With Live CMP</span><span className="font-bold">{decisionData.totalWithCmp}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">In Buy Zone</span><span className="font-bold text-green-600">{decisionData.buyZone.length}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">In Sell Zone</span><span className="font-bold text-red-600">{decisionData.sellZone.length}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Overvalued</span><span className="font-bold text-orange-600">{decisionData.overvalued.length}</span></div>
              </div>
            </div>

            <div className="metric-card col-span-2">
              <h3 className="font-bold text-tusk-dark mb-3">Sector Distribution</h3>
              <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                {Object.entries(decisionData.sectors)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([sector, data]) => (
                    <div key={sector} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-gray-600 truncate max-w-[150px]" title={sector}>{sector}</span>
                      <span className="pill pill-blue">{data.count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
