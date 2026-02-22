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

interface EnrichedStock extends Stock {
  liveCmp?: number;
  liveChange?: number;
  liveChangePct?: number;
  liveVolume?: number;
  upsideBearCalc?: number;
  upsideBaseCalc?: number;
  upsideBullCalc?: number;
  displayTikr: string;
  companyShort: string;
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

// Proper title case for company names
const toTitleCase = (str: string): string => {
  const lowercase = ["and", "of", "the", "in", "for", "at", "by", "to", "or"];
  const uppercase = ["AMC", "REIT", "ETF", "IT", "PB", "PE", "LTD", "NBFC", "PSU", "SBI", "ICICI", "HDFC", "IDFC", "PNB", "IIFL", "CSB", "BSE", "MCX", "IEX", "NSE", "CDSL", "REC", "PFC", "HUDCO", "NTPC", "CESC", "BPCL", "IOC", "SPML", "GPT", "E2E", "JM", "PCBL", "VBL", "SML", "TMB", "LIC"];
  return str
    .split(" ")
    .map((word, idx) => {
      const up = word.toUpperCase();
      if (uppercase.includes(up)) return up;
      if (idx > 0 && lowercase.includes(word.toLowerCase())) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

const getCompanyShort = (stock: Stock): string => {
  const name = String(stock.official_name || stock.tikr || "");
  if (!name) return cleanTikr(stock.tikr);
  const cleaned = name
    .replace(/ LIMITED$/i, "")
    .replace(/ LTD$/i, "")
    .replace(/ PRIVATE$/i, "")
    .replace(/ CORPORATION LIMITED$/i, "")
    .replace(/ CORPORATION$/i, "")
    .trim();
  return toTitleCase(cleaned);
};

// ── Main Component ──
export default function DashboardClient({ stocks, tickerMap, metadata }: Props) {
  const [activeTab, setActiveTab] = useState<"octopus" | "holdings" | "comparison" | "decisions">("octopus");
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortCol, setSortCol] = useState<string>("companyShort");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Dynamic filters
  const [filterSector, setFilterSector] = useState<string>("all");
  const [filterVP, setFilterVP] = useState<string>("all");
  const [filterConviction, setFilterConviction] = useState<string>("all");

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

  // Comparison state
  const [compareSearch, setCompareSearch] = useState("");
  const [selectedCompare, setSelectedCompare] = useState<string[]>([]);

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
  const enrichedStocks: EnrichedStock[] = useMemo(() => {
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

  // Filtered + sorted stocks for Octopus tab
  const sortedStocks = useMemo(() => {
    const filtered = enrichedStocks.filter((s) => {
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
      if (filterSector !== "all" && s.sector !== filterSector) return false;
      if (filterVP !== "all" && s.vp !== filterVP) return false;
      if (filterConviction !== "all" && String(s.conviction) !== filterConviction) return false;
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
  }, [enrichedStocks, searchTerm, sortCol, sortDir, filterSector, filterVP, filterConviction]);

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

  // Comparison stocks data
  const comparedStocks = useMemo(() => {
    return selectedCompare.map((tikr) => enrichedStocks.find((s) => s.tikr === tikr)).filter(Boolean) as EnrichedStock[];
  }, [selectedCompare, enrichedStocks]);

  const compareSearchResults = useMemo(() => {
    if (!compareSearch || compareSearch.length < 2) return [];
    const term = compareSearch.toLowerCase();
    return enrichedStocks
      .filter((s) => !selectedCompare.includes(s.tikr))
      .filter(
        (s) =>
          s.displayTikr?.toLowerCase().includes(term) ||
          s.companyShort?.toLowerCase().includes(term) ||
          s.sector?.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [compareSearch, enrichedStocks, selectedCompare]);

  // Decision support data
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
      .slice(0, 10);
    const worstDownside = [...withCmp]
      .filter((s) => s.upsideBearCalc != null && s.upsideBearCalc < 0)
      .sort((a, b) => (a.upsideBearCalc || 0) - (b.upsideBearCalc || 0))
      .slice(0, 10);
    const overvalued = withCmp
      .filter((s) => s.upsideBullCalc != null && s.upsideBullCalc < -0.05)
      .sort((a, b) => (a.upsideBullCalc || 0) - (b.upsideBullCalc || 0));
    const highConviction = withCmp
      .filter((s) => s.conviction != null && s.conviction >= 4)
      .sort((a, b) => (b.conviction || 0) - (a.conviction || 0) || (b.upsideBaseCalc || 0) - (a.upsideBaseCalc || 0));
    const sectors: Record<string, { count: number; avgUpsideBase: number; avgUpsideBear: number; stocks: EnrichedStock[] }> = {};
    withCmp.forEach((s) => {
      const sec = s.sector || "Other";
      if (!sectors[sec]) sectors[sec] = { count: 0, avgUpsideBase: 0, avgUpsideBear: 0, stocks: [] };
      sectors[sec].count++;
      sectors[sec].avgUpsideBase += (s.upsideBaseCalc || 0) * 100;
      sectors[sec].avgUpsideBear += (s.upsideBearCalc || 0) * 100;
      sectors[sec].stocks.push(s);
    });
    Object.values(sectors).forEach((v) => {
      v.avgUpsideBase = v.count > 0 ? v.avgUpsideBase / v.count : 0;
      v.avgUpsideBear = v.count > 0 ? v.avgUpsideBear / v.count : 0;
    });

    // Concentration by VP
    const vpStats: Record<string, { count: number; avgUpside: number }> = {};
    withCmp.forEach((s) => {
      const vp = s.vp || "Unassigned";
      if (!vpStats[vp]) vpStats[vp] = { count: 0, avgUpside: 0 };
      vpStats[vp].count++;
      vpStats[vp].avgUpside += (s.upsideBaseCalc || 0) * 100;
    });
    Object.values(vpStats).forEach((v) => { v.avgUpside = v.count > 0 ? v.avgUpside / v.count : 0; });

    return { buyZone, sellZone, bestUpside, worstDownside, overvalued, highConviction, sectors, vpStats, totalWithCmp: withCmp.length, totalStocks: enrichedStocks.length };
  }, [enrichedStocks]);

  const Th = ({ col, label, className = "" }: { col: string; label: string; className?: string }) => (
    <th
      className={`${className} ${sortCol === col ? (sortDir === "asc" ? "sort-asc" : "sort-desc") : ""}`}
      onClick={() => handleSort(col)}
    >
      {label}
    </th>
  );

  const activeFilters = [filterSector, filterVP, filterConviction].filter((f) => f !== "all").length;

  // Mini bar for visual % in decision tables
  const UpsideBar = ({ value, max = 100 }: { value: number; max?: number }) => {
    const width = Math.min(Math.abs(value) / max * 100, 100);
    const isPositive = value >= 0;
    return (
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold min-w-[52px] text-right ${isPositive ? "text-green-600" : "text-red-600"}`}>
          {isPositive ? "+" : ""}{value.toFixed(1)}%
        </span>
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden" style={{ minWidth: 60 }}>
          <div
            className={`h-full rounded-full ${isPositive ? "bg-green-400" : "bg-red-400"}`}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-4 bg-white rounded-xl shadow-sm px-2">
        {([
          { key: "octopus" as const, label: "Octopus" },
          { key: "holdings" as const, label: "Holdings Analysis" },
          { key: "comparison" as const, label: "Comparison" },
          { key: "decisions" as const, label: "Decision Support" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabSwitch(tab.key)}
            className={`px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key ? "tab-active" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
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

      {/* ═══════════════════════ TAB 1: OCTOPUS ═══════════════════════ */}
      {activeTab === "octopus" && (
        <div>
          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <input
              type="text"
              placeholder="Search company, sector, VP..."
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
            {activeFilters > 0 && (
              <button
                onClick={() => { setFilterSector("all"); setFilterVP("all"); setFilterConviction("all"); }}
                className="text-xs text-tusk-accent hover:underline"
              >
                Clear filters ({activeFilters})
              </button>
            )}
            <span className="text-xs text-gray-500 ml-auto">
              {sortedStocks.length} stocks {Object.keys(quotes).length > 0 && ` · ${Object.keys(quotes).length} live prices`}
            </span>
            <button
              onClick={() => {
                const csv = [
                  ["Company", "Sector", "CMP", "Bear", "Base", "Bull", "Upside Bear%", "Upside Base%", "Upside Bull%", "1Y Upside", "2Y Upside", "Base PE", "Base PB", "Base EV/EBITDA", "Conviction", "VA", "SA"].join(","),
                  ...sortedStocks.map(s => [
                    `"${s.companyShort}"`, `"${s.sector || ""}"`,
                    s.liveCmp?.toFixed(0) || "",
                    s.bear_current?.toFixed(0) || "", s.base_current?.toFixed(0) || "", s.bull_current?.toFixed(0) || "",
                    s.upsideBearCalc != null ? (s.upsideBearCalc * 100).toFixed(1) + "%" : "",
                    s.upsideBaseCalc != null ? (s.upsideBaseCalc * 100).toFixed(1) + "%" : "",
                    s.upsideBullCalc != null ? (s.upsideBullCalc * 100).toFixed(1) + "%" : "",
                    s.upside_1y != null ? s.upside_1y.toFixed(1) + "%" : "",
                    s.upside_2y != null ? s.upside_2y.toFixed(1) + "%" : "",
                    s.base_pe?.toFixed(1) || "", s.base_pb?.toFixed(1) || "", s.base_evebitda?.toFixed(1) || "",
                    s.conviction ?? "", s.vp || "", s.sa || ""
                  ].join(","))
                ].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `octopus_${new Date().toISOString().split("T")[0]}.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="text-xs bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700"
            >
              Export CSV
            </button>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-xl shadow-sm overflow-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
            <table className="data-table w-full">
              <thead>
                <tr>
                  <Th col="companyShort" label="Company" />
                  <Th col="sector" label="Sector" />
                  <Th col="liveCmp" label="CMP" />
                  <Th col="bear_current" label="Bear" />
                  <Th col="base_current" label="Base" />
                  <Th col="bull_current" label="Bull" />
                  <Th col="upsideBearCalc" label="Upside Bear" />
                  <Th col="upsideBaseCalc" label="Upside Base" />
                  <Th col="upsideBullCalc" label="Upside Bull" />
                  <Th col="upside_1y" label="1Y Upside" />
                  <Th col="upside_2y" label="2Y Upside" />
                  <Th col="base_pe" label="Base PE" />
                  <Th col="base_pb" label="Base PB" />
                  <Th col="base_evebitda" label="Base EV/EBITDA" />
                  <Th col="conviction" label="Conviction" />
                  <Th col="vp" label="VA" />
                  <Th col="sa" label="SA" />
                </tr>
              </thead>
              <tbody>
                {sortedStocks.map((s, i) => {
                  const isBuyZone = s.liveCmp && s.bear_current && s.liveCmp <= s.bear_current * 1.05;
                  const isSellZone = s.liveCmp && s.bull_current && s.liveCmp >= s.bull_current * 0.95;
                  return (
                    <tr key={`${s.tikr}-${i}`} className={isBuyZone ? "row-buy-zone" : isSellZone ? "row-sell-zone" : ""}>
                      <td className="font-semibold text-tusk-dark" style={{ whiteSpace: "normal", minWidth: 180, maxWidth: 220 }}>{s.companyShort}</td>
                      <td className="text-xs">{s.sector || "—"}</td>
                      <td className="font-semibold">{s.liveCmp ? `₹${fmt(s.liveCmp, 1)}` : "—"}</td>
                      <td>{s.bear_current ? `₹${fmt(s.bear_current, 0)}` : "—"}</td>
                      <td>{s.base_current ? `₹${fmt(s.base_current, 0)}` : "—"}</td>
                      <td>{s.bull_current ? `₹${fmt(s.bull_current, 0)}` : "—"}</td>
                      <td className={pctColor(s.upsideBearCalc)}>{s.upsideBearCalc != null ? fmtPct(s.upsideBearCalc) : "—"}</td>
                      <td className={pctColor(s.upsideBaseCalc)}>{s.upsideBaseCalc != null ? fmtPct(s.upsideBaseCalc) : "—"}</td>
                      <td className={pctColor(s.upsideBullCalc)}>{s.upsideBullCalc != null ? fmtPct(s.upsideBullCalc) : "—"}</td>
                      <td className={pctColor(s.upside_1y)}>{s.upside_1y != null ? fmtPct(s.upside_1y) : "—"}</td>
                      <td className={pctColor(s.upside_2y)}>{s.upside_2y != null ? fmtPct(s.upside_2y) : "—"}</td>
                      <td>{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</td>
                      <td>{s.base_pb ? `${s.base_pb.toFixed(1)}x` : "—"}</td>
                      <td>{s.base_evebitda ? `${s.base_evebitda.toFixed(1)}x` : "—"}</td>
                      <td className="text-center font-semibold">{s.conviction ?? "—"}</td>
                      <td className="text-center">{s.vp || "—"}</td>
                      <td className="text-center">{s.sa || "—"}</td>
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
                      <th>Stock</th><th>Qty</th><th>Avg Cost</th><th>CMP</th>
                      <th>Invested</th><th>Current Value</th><th>P&L</th><th>P&L %</th>
                      <th>Bear</th><th>Base</th><th>Bull</th>
                      <th>Upside Bear</th><th>Upside Base</th><th>Upside Bull</th>
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

      {/* ═══════════════════════ TAB 3: COMPARISON ═══════════════════════ */}
      {activeTab === "comparison" && (
        <div>
          <div className="metric-card mb-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search to add a stock (up to 4)..."
                  value={compareSearch}
                  onChange={(e) => setCompareSearch(e.target.value)}
                  disabled={selectedCompare.length >= 4}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-tusk-accent/30 disabled:opacity-50"
                />
                {compareSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg mt-1 shadow-lg z-20 max-h-60 overflow-y-auto">
                    {compareSearchResults.map((s) => (
                      <button
                        key={s.tikr}
                        onClick={() => {
                          setSelectedCompare([...selectedCompare, s.tikr]);
                          setCompareSearch("");
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm flex justify-between items-center"
                      >
                        <span><span className="font-semibold">{s.companyShort}</span> <span className="text-gray-400 text-xs">({s.displayTikr})</span></span>
                        <span className="text-xs text-gray-400">{s.sector}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedCompare.map((tikr) => {
                  const s = enrichedStocks.find((st) => st.tikr === tikr);
                  return (
                    <span key={tikr} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                      {s?.companyShort || tikr}
                      <button onClick={() => setSelectedCompare(selectedCompare.filter((t) => t !== tikr))} className="text-blue-500 hover:text-blue-700 ml-1 font-bold">&times;</button>
                    </span>
                  );
                })}
                {selectedCompare.length > 0 && (
                  <button onClick={() => setSelectedCompare([])} className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>
                )}
              </div>
            </div>
            {selectedCompare.length === 0 && (
              <p className="text-gray-400 text-sm mt-3">Select up to 4 equities to compare side-by-side. Search by company name, ticker, or sector.</p>
            )}
          </div>

          {comparedStocks.length > 0 && (
            <div className="space-y-4">
              {/* Price & Valuation */}
              <div className="metric-card">
                <h3 className="font-bold text-tusk-dark mb-3 text-sm uppercase tracking-wide">Price & Valuation</h3>
                <table className="data-table w-full">
                  <thead><tr><th>Metric</th>{comparedStocks.map((s) => <th key={s.tikr}>{s.companyShort}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="font-medium text-gray-600">Sector</td>{comparedStocks.map((s) => <td key={s.tikr}><span className="pill pill-blue">{s.sector || "—"}</span></td>)}</tr>
                    <tr><td className="font-medium text-gray-600">CMP</td>{comparedStocks.map((s) => <td key={s.tikr} className="font-semibold">{s.liveCmp ? `₹${fmt(s.liveCmp, 1)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Bear Case</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.bear_current ? `₹${fmt(s.bear_current, 0)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Base Case</td>{comparedStocks.map((s) => <td key={s.tikr} className="font-semibold">{s.base_current ? `₹${fmt(s.base_current, 0)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Bull Case</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.bull_current ? `₹${fmt(s.bull_current, 0)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">1Y Target</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.target_1y ? `₹${fmt(s.target_1y, 0)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">2Y Target</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.target_2y ? `₹${fmt(s.target_2y, 0)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Div. Yield</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.div_yield != null ? `${s.div_yield.toFixed(1)}%` : "—"}</td>)}</tr>
                  </tbody>
                </table>
              </div>

              {/* Upside */}
              <div className="metric-card">
                <h3 className="font-bold text-tusk-dark mb-3 text-sm uppercase tracking-wide">Upside Analysis</h3>
                <table className="data-table w-full">
                  <thead><tr><th>Metric</th>{comparedStocks.map((s) => <th key={s.tikr}>{s.companyShort}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="font-medium text-gray-600">Upside Bear</td>{comparedStocks.map((s) => <td key={s.tikr} className={pctColor(s.upsideBearCalc)}>{s.upsideBearCalc != null ? fmtPct(s.upsideBearCalc) : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Upside Base</td>{comparedStocks.map((s) => <td key={s.tikr} className={pctColor(s.upsideBaseCalc)}>{s.upsideBaseCalc != null ? fmtPct(s.upsideBaseCalc) : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Upside Bull</td>{comparedStocks.map((s) => <td key={s.tikr} className={pctColor(s.upsideBullCalc)}>{s.upsideBullCalc != null ? fmtPct(s.upsideBullCalc) : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">1Y Upside</td>{comparedStocks.map((s) => <td key={s.tikr} className={pctColor(s.upside_1y)}>{s.upside_1y != null ? fmtPct(s.upside_1y) : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">2Y Upside</td>{comparedStocks.map((s) => <td key={s.tikr} className={pctColor(s.upside_2y)}>{s.upside_2y != null ? fmtPct(s.upside_2y) : "—"}</td>)}</tr>
                  </tbody>
                </table>
              </div>

              {/* Fundamentals */}
              <div className="metric-card">
                <h3 className="font-bold text-tusk-dark mb-3 text-sm uppercase tracking-wide">Fundamentals</h3>
                <table className="data-table w-full">
                  <thead><tr><th>Metric</th>{comparedStocks.map((s) => <th key={s.tikr}>{s.companyShort}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="font-medium text-gray-600">Base PE</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">PE +2SD</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.base_pe_2sd ? `${s.base_pe_2sd.toFixed(1)}x` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Base PB</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.base_pb ? `${s.base_pb.toFixed(1)}x` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">PB +2SD</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.base_pb_2sd ? `${s.base_pb_2sd.toFixed(1)}x` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Base EV/EBITDA</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.base_evebitda ? `${s.base_evebitda.toFixed(1)}x` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">EV/EBITDA +2SD</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.base_evebitda_2sd ? `${s.base_evebitda_2sd.toFixed(1)}x` : "—"}</td>)}</tr>
                  </tbody>
                </table>
              </div>

              {/* Qualitative */}
              <div className="metric-card">
                <h3 className="font-bold text-tusk-dark mb-3 text-sm uppercase tracking-wide">Qualitative Assessment</h3>
                <table className="data-table w-full">
                  <thead><tr><th>Metric</th>{comparedStocks.map((s) => <th key={s.tikr}>{s.companyShort}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="font-medium text-gray-600">Conviction</td>{comparedStocks.map((s) => <td key={s.tikr} className="font-semibold">{s.conviction ?? "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Understanding</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.understanding ?? "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Score</td>{comparedStocks.map((s) => <td key={s.tikr} className="font-semibold">{s.score ?? "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">VA</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.vp || "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">SA</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.sa || "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">F&O</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.in_fno === "Yes" ? <span className="pill pill-green">Yes</span> : "No"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Holding</td>{comparedStocks.map((s) => <td key={s.tikr}>{s.holding_cash_lakhs ? fmtLakhs(s.holding_cash_lakhs) : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Last Updated</td>{comparedStocks.map((s) => <td key={s.tikr} className="text-xs text-gray-400">{s.last_updated || "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Comments</td>{comparedStocks.map((s) => <td key={s.tikr} className="text-xs text-gray-500 max-w-[200px]" style={{ whiteSpace: "normal" }}>{s.comments || "—"}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {comparedStocks.length === 0 && selectedCompare.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h2 className="text-xl font-bold text-tusk-dark mb-2">Equity Comparison</h2>
              <p className="text-gray-500 max-w-md">
                Compare up to 4 equities side-by-side across valuation, upside scenarios, fundamentals, and qualitative metrics.
                Use the search bar above to get started.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ TAB 4: DECISION SUPPORT ═══════════════════════ */}
      {activeTab === "decisions" && (
        <div className="space-y-4">
          {/* KPI Summary */}
          <div className="grid grid-cols-5 gap-3">
            <div className="metric-card text-center border-l-4 border-gray-300">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Universe</p>
              <p className="text-2xl font-bold text-tusk-dark mt-1">{decisionData.totalStocks}</p>
              <p className="text-xs text-gray-400">{decisionData.totalWithCmp} with CMP</p>
            </div>
            <div className="metric-card text-center border-l-4 border-green-400">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Buy Zone</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{decisionData.buyZone.length}</p>
              <p className="text-xs text-gray-400">Near bear price</p>
            </div>
            <div className="metric-card text-center border-l-4 border-red-400">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Take Profit</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{decisionData.sellZone.length}</p>
              <p className="text-xs text-gray-400">Near bull price</p>
            </div>
            <div className="metric-card text-center border-l-4 border-orange-400">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Overvalued</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{decisionData.overvalued.length}</p>
              <p className="text-xs text-gray-400">Above bull case</p>
            </div>
            <div className="metric-card text-center border-l-4 border-purple-400">
              <p className="text-xs text-gray-500 uppercase tracking-wide">High Conviction</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{decisionData.highConviction.length}</p>
              <p className="text-xs text-gray-400">Score 4+</p>
            </div>
          </div>

          {/* Buy & Sell Zones */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card border-t-4 border-green-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Buy Zone — CMP Near Bear Price</h3>
              {decisionData.buyZone.length === 0 ? (
                <p className="text-gray-400 text-sm py-4">No stocks in buy zone currently</p>
              ) : (
                <div className="overflow-auto max-h-[300px]">
                  <table className="data-table w-full">
                    <thead><tr><th>Company</th><th>CMP</th><th>Bear</th><th>Upside to Base</th></tr></thead>
                    <tbody>
                      {decisionData.buyZone.map((s, i) => (
                        <tr key={i} className="row-buy-zone">
                          <td className="font-semibold text-sm" style={{ whiteSpace: "normal" }}>{s.companyShort}</td>
                          <td>₹{fmt(s.liveCmp, 0)}</td>
                          <td>₹{fmt(s.bear_current, 0)}</td>
                          <td><UpsideBar value={(s.upsideBaseCalc || 0) * 100} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="metric-card border-t-4 border-red-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Take Profit — CMP Near Bull Price</h3>
              {decisionData.sellZone.length === 0 ? (
                <p className="text-gray-400 text-sm py-4">No stocks in sell zone currently</p>
              ) : (
                <div className="overflow-auto max-h-[300px]">
                  <table className="data-table w-full">
                    <thead><tr><th>Company</th><th>CMP</th><th>Bull</th><th>Upside to Bull</th></tr></thead>
                    <tbody>
                      {decisionData.sellZone.map((s, i) => (
                        <tr key={i} className="row-sell-zone">
                          <td className="font-semibold text-sm" style={{ whiteSpace: "normal" }}>{s.companyShort}</td>
                          <td>₹{fmt(s.liveCmp, 0)}</td>
                          <td>₹{fmt(s.bull_current, 0)}</td>
                          <td><UpsideBar value={(s.upsideBullCalc || 0) * 100} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Best Upside & Worst Downside */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card border-t-4 border-blue-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Top 10 — Highest Upside to Base</h3>
              <div className="overflow-auto max-h-[340px]">
                <table className="data-table w-full">
                  <thead><tr><th>#</th><th>Company</th><th>Sector</th><th>CMP</th><th>Base</th><th>Upside</th></tr></thead>
                  <tbody>
                    {decisionData.bestUpside.map((s, i) => (
                      <tr key={i}>
                        <td className="text-gray-400 text-xs">{i + 1}</td>
                        <td className="font-semibold text-sm" style={{ whiteSpace: "normal" }}>{s.companyShort}</td>
                        <td className="text-xs">{s.sector}</td>
                        <td>₹{fmt(s.liveCmp, 0)}</td>
                        <td>₹{fmt(s.base_current, 0)}</td>
                        <td><UpsideBar value={(s.upsideBaseCalc || 0) * 100} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="metric-card border-t-4 border-amber-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Top 10 — Largest Downside Risk to Bear</h3>
              <div className="overflow-auto max-h-[340px]">
                <table className="data-table w-full">
                  <thead><tr><th>#</th><th>Company</th><th>Sector</th><th>CMP</th><th>Bear</th><th>Downside</th></tr></thead>
                  <tbody>
                    {decisionData.worstDownside.map((s, i) => (
                      <tr key={i}>
                        <td className="text-gray-400 text-xs">{i + 1}</td>
                        <td className="font-semibold text-sm" style={{ whiteSpace: "normal" }}>{s.companyShort}</td>
                        <td className="text-xs">{s.sector}</td>
                        <td>₹{fmt(s.liveCmp, 0)}</td>
                        <td>₹{fmt(s.bear_current, 0)}</td>
                        <td><UpsideBar value={(s.upsideBearCalc || 0) * 100} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* High Conviction & Overvalued */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card border-t-4 border-purple-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">High Conviction Picks (4+)</h3>
              {decisionData.highConviction.length === 0 ? (
                <p className="text-gray-400 text-sm py-4">No high-conviction stocks with live CMP</p>
              ) : (
                <div className="overflow-auto max-h-[300px]">
                  <table className="data-table w-full">
                    <thead><tr><th>Company</th><th>Conv.</th><th>Sector</th><th>CMP</th><th>Upside to Base</th></tr></thead>
                    <tbody>
                      {decisionData.highConviction.map((s, i) => (
                        <tr key={i}>
                          <td className="font-semibold text-sm" style={{ whiteSpace: "normal" }}>{s.companyShort}</td>
                          <td className="text-center font-bold text-purple-700">{s.conviction}</td>
                          <td className="text-xs">{s.sector}</td>
                          <td>₹{fmt(s.liveCmp, 0)}</td>
                          <td><UpsideBar value={(s.upsideBaseCalc || 0) * 100} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="metric-card border-t-4 border-orange-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Overvalued — CMP Above Bull Case</h3>
              {decisionData.overvalued.length === 0 ? (
                <p className="text-gray-400 text-sm py-4">No stocks trading above bull case</p>
              ) : (
                <div className="overflow-auto max-h-[300px]">
                  <table className="data-table w-full">
                    <thead><tr><th>Company</th><th>Sector</th><th>CMP</th><th>Bull</th><th>Above Bull</th></tr></thead>
                    <tbody>
                      {decisionData.overvalued.map((s, i) => (
                        <tr key={i}>
                          <td className="font-semibold text-sm" style={{ whiteSpace: "normal" }}>{s.companyShort}</td>
                          <td className="text-xs">{s.sector}</td>
                          <td>₹{fmt(s.liveCmp, 0)}</td>
                          <td>₹{fmt(s.bull_current, 0)}</td>
                          <td><UpsideBar value={(s.upsideBullCalc || 0) * 100} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sector & VP Breakdown */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card border-t-4 border-gray-300">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Sector Snapshot</h3>
              <div className="overflow-auto max-h-[300px]">
                <table className="data-table w-full">
                  <thead><tr><th>Sector</th><th>Stocks</th><th>Avg Upside Base</th><th>Avg Downside Bear</th></tr></thead>
                  <tbody>
                    {Object.entries(decisionData.sectors)
                      .sort((a, b) => b[1].avgUpsideBase - a[1].avgUpsideBase)
                      .map(([sector, data]) => (
                        <tr key={sector}>
                          <td className="text-sm">{sector}</td>
                          <td className="text-center"><span className="pill pill-blue">{data.count}</span></td>
                          <td><UpsideBar value={data.avgUpsideBase} /></td>
                          <td><UpsideBar value={data.avgUpsideBear} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="metric-card border-t-4 border-gray-300">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Analyst Coverage</h3>
              <div className="overflow-auto max-h-[300px]">
                <table className="data-table w-full">
                  <thead><tr><th>Analyst (VA)</th><th>Stocks Covered</th><th>Avg Upside Base</th></tr></thead>
                  <tbody>
                    {Object.entries(decisionData.vpStats)
                      .sort((a, b) => b[1].count - a[1].count)
                      .map(([vp, data]) => (
                        <tr key={vp}>
                          <td className="font-semibold text-sm">{vp}</td>
                          <td className="text-center"><span className="pill pill-gray">{data.count}</span></td>
                          <td><UpsideBar value={data.avgUpside} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
