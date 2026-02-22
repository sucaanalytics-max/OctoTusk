"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

// ── Types ──
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

const CMP_REFRESH_INTERVAL = 60;

const isMarketOpen = (): boolean => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const m = ist.getHours() * 60 + ist.getMinutes();
  return m >= 555 && m <= 930;
};

const fmt = (n: number | undefined | null, d = 0): string => {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: d });
};

const fmtPct = (n: number | undefined | null): string => {
  if (n == null || isNaN(n)) return "—";
  const p = Math.abs(n) < 1 ? n * 100 : n;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
};

const fmtCr = (n: number | undefined | null): string => {
  if (n == null || isNaN(n)) return "—";
  return `${(n / 10000000).toFixed(1)} Cr`;
};

const fmtLakhs = (n: number | undefined | null): string => {
  if (n == null || isNaN(n)) return "—";
  return `₹${n.toFixed(1)}L`;
};

const pctColor = (n: number | undefined | null): string => {
  if (n == null) return "";
  const v = Math.abs(n) < 1 ? n * 100 : n;
  if (v > 5) return "cell-green";
  if (v < -5) return "cell-red";
  return "cell-amber";
};

const cleanTikr = (tikr: string | null | undefined): string => {
  if (!tikr || typeof tikr !== "string") return "";
  if (tikr.includes("(XNSE:")) { const m = tikr.match(/\(XNSE:(\w+)\)/); return m ? m[1] : tikr; }
  if (tikr.includes("(XBOM:")) { const m = tikr.match(/\(XBOM:(\w+)\)/); return m ? m[1] : tikr; }
  if (tikr.startsWith("XNSE:")) return tikr.replace("XNSE:", "");
  if (tikr.startsWith("XBOM:")) return tikr.replace("XBOM:", "");
  if (tikr.includes(" ")) return tikr.split(" ")[0];
  return tikr;
};

const toTitleCase = (str: string): string => {
  const lower = ["and", "of", "the", "in", "for", "at", "by", "to", "or"];
  const upper = ["AMC", "REIT", "ETF", "IT", "LTD", "NBFC", "PSU", "SBI", "ICICI", "HDFC", "IDFC", "PNB", "IIFL", "CSB", "BSE", "MCX", "IEX", "NSE", "CDSL", "REC", "PFC", "HUDCO", "NTPC", "CESC", "BPCL", "IOC", "SPML", "GPT", "E2E", "JM", "PCBL", "VBL", "SML", "TMB", "LIC"];
  return str.split(" ").map((w, i) => {
    const u = w.toUpperCase();
    if (upper.includes(u)) return u;
    if (i > 0 && lower.includes(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
};

const getCompanyShort = (stock: Stock): string => {
  const name = String(stock.official_name || stock.tikr || "");
  if (!name) return cleanTikr(stock.tikr);
  return toTitleCase(name.replace(/ LIMITED$/i, "").replace(/ LTD$/i, "").replace(/ PRIVATE$/i, "").replace(/ CORPORATION LIMITED$/i, "").replace(/ CORPORATION$/i, "").trim());
};

// ── UpsideBar component ──
const UpsideBar = ({ value, max = 100 }: { value: number; max?: number }) => {
  const w = Math.min(Math.abs(value) / max * 100, 100);
  const pos = value >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-bold min-w-[52px] text-right ${pos ? "text-green-600" : "text-red-600"}`}>
        {pos ? "+" : ""}{value.toFixed(1)}%
      </span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden" style={{ minWidth: 50 }}>
        <div className={`h-full rounded-full ${pos ? "bg-green-400" : "bg-red-400"}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
};

// ── ConvictionDots ──
const ConvictionDots = ({ level }: { level: number }) => (
  <div className="flex gap-0.5">
    {[1,2,3,4,5].map(i => (
      <div key={i} className={`w-2 h-2 rounded-full ${i <= level ? "bg-amber-500" : "bg-gray-200"}`} />
    ))}
  </div>
);

// ══════════════════════ MAIN ══════════════════════
export default function DashboardClient({ stocks, tickerMap, metadata }: Props) {
  const [activeTab, setActiveTab] = useState<"octopus" | "holdings" | "comparison" | "decisions">("octopus");
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortCol, setSortCol] = useState<string>("companyShort");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterSector, setFilterSector] = useState<string>("all");
  const [filterVP, setFilterVP] = useState<string>("all");
  const [filterConviction, setFilterConviction] = useState<string>("all");
  const [countdown, setCountdown] = useState(CMP_REFRESH_INTERVAL);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());
  const [liveStocks, setLiveStocks] = useState<Stock[]>(stocks);
  const [dataRefreshing, setDataRefreshing] = useState(false);
  const [dataLastRefreshed, setDataLastRefreshed] = useState<string | null>(null);
  const [holdingsUnlocked, setHoldingsUnlocked] = useState(false);
  const [holdingsPin, setHoldingsPin] = useState("");
  const [holdingsData, setHoldingsData] = useState<Holding[]>([]);
  const [holdingsError, setHoldingsError] = useState("");
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [compareSearch, setCompareSearch] = useState("");
  const [selectedCompare, setSelectedCompare] = useState<string[]>([]);
  const [compareSectorFilter, setCompareSectorFilter] = useState<string>("all");

  // Stock detail panel
  const [detailStock, setDetailStock] = useState<EnrichedStock | null>(null);

  const handleTabSwitch = (tab: typeof activeTab) => {
    if (activeTab === "holdings" && tab !== "holdings") {
      setHoldingsUnlocked(false); setHoldingsData([]); setHoldingsPin(""); setHoldingsError("");
    }
    setDetailStock(null);
    setActiveTab(tab);
  };

  const fetchQuotes = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const res = await fetch("/api/quotes");
      const data = await res.json();
      if (data.quotes) { setQuotes(data.quotes); setLastFetched(data.fetchedAt); }
    } catch (err) { console.error("Failed to fetch quotes:", err); }
    finally { setQuotesLoading(false); }
  }, []);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      setMarketOpen(isMarketOpen());
      setCountdown(p => { if (p <= 1) { if (isMarketOpen()) fetchQuotes(); return CMP_REFRESH_INTERVAL; } return p - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchQuotes]);

  const refreshData = useCallback(async () => {
    setDataRefreshing(true);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json();
      if (data.stocks) { setLiveStocks(data.stocks); setDataLastRefreshed(data.refreshedAt); }
    } catch (err) { console.error("Failed to refresh data:", err); }
    finally { setDataRefreshing(false); }
  }, []);

  const filterOptions = useMemo(() => {
    const sectors = Array.from(new Set(liveStocks.map(s => s.sector).filter(Boolean))).sort() as string[];
    const vps = Array.from(new Set(liveStocks.map(s => s.vp).filter(Boolean))).sort() as string[];
    const convictions = Array.from(new Set(liveStocks.map(s => s.conviction).filter(c => c != null))).sort((a, b) => (b as number) - (a as number)) as number[];
    return { sectors, vps, convictions };
  }, [liveStocks]);

  const enrichedStocks: EnrichedStock[] = useMemo(() => {
    return liveStocks.map(s => {
      const q = s.tikr ? quotes[s.tikr] : undefined;
      const liveCmp = q?.price || s.cmp;
      let uB, uBa, uBu;
      if (liveCmp && s.bear_current) uB = (s.bear_current - liveCmp) / liveCmp;
      if (liveCmp && s.base_current) uBa = (s.base_current - liveCmp) / liveCmp;
      if (liveCmp && s.bull_current) uBu = (s.bull_current - liveCmp) / liveCmp;
      return { ...s, liveCmp, liveChange: q?.change, liveChangePct: q?.changePct, liveVolume: q?.volume, upsideBearCalc: uB, upsideBaseCalc: uBa, upsideBullCalc: uBu, displayTikr: cleanTikr(s.tikr), companyShort: getCompanyShort(s) };
    });
  }, [liveStocks, quotes]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortedStocks = useMemo(() => {
    const filtered = enrichedStocks.filter(s => {
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        if (!(s.tikr?.toLowerCase().includes(t) || s.displayTikr?.toLowerCase().includes(t) || s.companyShort?.toLowerCase().includes(t) || s.sector?.toLowerCase().includes(t) || s.official_name?.toLowerCase().includes(t) || s.vp?.toLowerCase().includes(t) || s.sa?.toLowerCase().includes(t))) return false;
      }
      if (filterSector !== "all" && s.sector !== filterSector) return false;
      if (filterVP !== "all" && s.vp !== filterVP) return false;
      if (filterConviction !== "all" && String(s.conviction) !== filterConviction) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const av = a[sortCol as keyof typeof a], bv = b[sortCol as keyof typeof b];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [enrichedStocks, searchTerm, sortCol, sortDir, filterSector, filterVP, filterConviction]);

  // Holdings
  const unlockHoldings = async () => {
    setHoldingsLoading(true); setHoldingsError("");
    try {
      const res = await fetch("/api/holdings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: holdingsPin }) });
      const data = await res.json();
      if (data.unlocked) { setHoldingsData(data.holdings); setHoldingsUnlocked(true); }
      else setHoldingsError(data.error || "Invalid PIN");
    } catch { setHoldingsError("Failed to verify PIN"); }
    finally { setHoldingsLoading(false); }
  };

  const enrichedHoldings = useMemo(() => {
    if (!holdingsData.length) return [];
    const nameToTikr: Record<string, string> = {
      "Kilburn Engineering": "XBOM:522101", "Vedanta Limited": "VEDL", "Nexus Select Trust": "NXST",
      "Multi Commodity Exchange of India": "MCX", "Tips Music": "TIPSMUSIC", "Apeejay Surrendra Park Hotels": "PARKHOTELS",
      "Aditya Birla Sun Life AMC": "ABSLAMC", "Bajaj Finserv": "BAJAJFINSV", "SPML Infra": "SPMLINFRA",
      "JM Financial": "JMFINANCIL", "IIFL Capital Services": "IIFLCAPS", "Godawari Power & Ispat": "GPIL",
      "Manappuram Finance": "MANAPPURAM", "Canara Robeco Asset Management Company": "CRAMC",
      "Suraksha Diagnostic": "SURAKSHA", "Annapurna Swadisht": "ANNAPURNA",
      "Smartworks Coworking Spaces": "Smartworks", "ICICI Prudential Asset Management Company": "ICICIAMC",
      "E2E Networks": "E2E", "Wework India Management": "Wework", "Duroply Industries": "XBOM:516003",
      "State Bank Of India": "SBIN", "GPT Infraprojects": "GPTINFRA",
      "Virtuoso Optoelectronics": "VIRTUOSO OPTOELECTRONICS LIMITED (XBOM:543597)",
      "BSE Ltd": "BSE", "GPT Healthcare": "GPTHEALTH", "Motilal Oswal Financial": "MOTILALOFS",
      "KFin Technologies": "KFINTECH", "360 One Wam": "360ONE",
    };
    return holdingsData.map(h => {
      const tikr = nameToTikr[h.asset_name];
      const stockData = tikr ? enrichedStocks.find(s => s.tikr === tikr) : null;
      const livePrice = tikr && quotes[tikr] ? quotes[tikr].price : h.current_price;
      const liveValue = livePrice * h.quantity;
      const liveGain = liveValue - h.amt_invested;
      const liveGainPct = h.amt_invested > 0 ? (liveGain / h.amt_invested) * 100 : 0;
      return { ...h, tikr, stockData, livePrice, liveValue, liveGain, liveGainPct,
        upsideToBear: stockData?.bear_current && livePrice ? ((stockData.bear_current - livePrice) / livePrice) * 100 : null,
        upsideToBase: stockData?.base_current && livePrice ? ((stockData.base_current - livePrice) / livePrice) * 100 : null,
        upsideToBull: stockData?.bull_current && livePrice ? ((stockData.bull_current - livePrice) / livePrice) * 100 : null,
      };
    });
  }, [holdingsData, quotes, enrichedStocks]);

  // Comparison data
  const comparedStocks = useMemo(() => selectedCompare.map(t => enrichedStocks.find(s => s.tikr === t)).filter(Boolean) as EnrichedStock[], [selectedCompare, enrichedStocks]);

  const compareFilteredStocks = useMemo(() => {
    return enrichedStocks.filter(s => {
      if (selectedCompare.includes(s.tikr)) return false;
      if (compareSectorFilter !== "all" && s.sector !== compareSectorFilter) return false;
      if (compareSearch && compareSearch.length >= 2) {
        const t = compareSearch.toLowerCase();
        return s.displayTikr?.toLowerCase().includes(t) || s.companyShort?.toLowerCase().includes(t) || s.sector?.toLowerCase().includes(t);
      }
      return true;
    });
  }, [enrichedStocks, selectedCompare, compareSectorFilter, compareSearch]);

  // Decision data
  const decisionData = useMemo(() => {
    const withCmp = enrichedStocks.filter(s => s.liveCmp && s.bear_current && s.base_current && s.bull_current);
    const buyZone = withCmp.filter(s => s.upsideBearCalc != null && s.upsideBearCalc >= -0.10 && s.upsideBearCalc <= 0.05).sort((a, b) => (b.upsideBaseCalc || 0) - (a.upsideBaseCalc || 0));
    const sellZone = withCmp.filter(s => s.upsideBullCalc != null && s.upsideBullCalc >= -0.05 && s.upsideBullCalc <= 0.10).sort((a, b) => (a.upsideBullCalc || 0) - (b.upsideBullCalc || 0));
    const bestUpside = [...withCmp].filter(s => s.upsideBaseCalc != null && s.upsideBaseCalc > 0).sort((a, b) => (b.upsideBaseCalc || 0) - (a.upsideBaseCalc || 0)).slice(0, 10);
    const worstDownside = [...withCmp].filter(s => s.upsideBearCalc != null && s.upsideBearCalc < 0).sort((a, b) => (a.upsideBearCalc || 0) - (b.upsideBearCalc || 0)).slice(0, 10);
    const overvalued = withCmp.filter(s => s.upsideBullCalc != null && s.upsideBullCalc < -0.05).sort((a, b) => (a.upsideBullCalc || 0) - (b.upsideBullCalc || 0));
    const highConviction = withCmp.filter(s => s.conviction != null && s.conviction >= 4).sort((a, b) => (b.conviction || 0) - (a.conviction || 0) || (b.upsideBaseCalc || 0) - (a.upsideBaseCalc || 0));

    // Sector stats
    const sectors: Record<string, { count: number; avgUpsideBase: number; avgUpsideBear: number }> = {};
    withCmp.forEach(s => {
      const sec = s.sector || "Other";
      if (!sectors[sec]) sectors[sec] = { count: 0, avgUpsideBase: 0, avgUpsideBear: 0 };
      sectors[sec].count++;
      sectors[sec].avgUpsideBase += (s.upsideBaseCalc || 0) * 100;
      sectors[sec].avgUpsideBear += (s.upsideBearCalc || 0) * 100;
    });
    Object.values(sectors).forEach(v => { v.avgUpsideBase /= v.count || 1; v.avgUpsideBear /= v.count || 1; });

    // VP stats with holdings
    const vpStats: Record<string, { count: number; avgUpside: number; holdingsValue: number; holdingsStocks: number }> = {};
    enrichedStocks.forEach(s => {
      const vp = s.vp || "Unassigned";
      if (!vpStats[vp]) vpStats[vp] = { count: 0, avgUpside: 0, holdingsValue: 0, holdingsStocks: 0 };
      vpStats[vp].count++;
      if (s.upsideBaseCalc != null) vpStats[vp].avgUpside += (s.upsideBaseCalc || 0) * 100;
      if (s.holding_cash_lakhs && s.holding_cash_lakhs > 0) {
        vpStats[vp].holdingsValue += s.holding_cash_lakhs;
        vpStats[vp].holdingsStocks++;
      }
    });
    Object.values(vpStats).forEach(v => { v.avgUpside = v.count > 0 ? v.avgUpside / v.count : 0; });

    // SA stats
    const saStats: Record<string, { count: number; avgUpside: number; holdingsValue: number; holdingsStocks: number }> = {};
    enrichedStocks.forEach(s => {
      const sa = s.sa || "Unassigned";
      if (!saStats[sa]) saStats[sa] = { count: 0, avgUpside: 0, holdingsValue: 0, holdingsStocks: 0 };
      saStats[sa].count++;
      if (s.upsideBaseCalc != null) saStats[sa].avgUpside += (s.upsideBaseCalc || 0) * 100;
      if (s.holding_cash_lakhs && s.holding_cash_lakhs > 0) {
        saStats[sa].holdingsValue += s.holding_cash_lakhs;
        saStats[sa].holdingsStocks++;
      }
    });
    Object.values(saStats).forEach(v => { v.avgUpside = v.count > 0 ? v.avgUpside / v.count : 0; });

    return { buyZone, sellZone, bestUpside, worstDownside, overvalued, highConviction, sectors, vpStats, saStats, totalWithCmp: withCmp.length, totalStocks: enrichedStocks.length };
  }, [enrichedStocks]);

  const Th = ({ col, label }: { col: string; label: string }) => (
    <th className={sortCol === col ? (sortDir === "asc" ? "sort-asc" : "sort-desc") : ""} onClick={() => handleSort(col)}>{label}</th>
  );

  const activeFilters = [filterSector, filterVP, filterConviction].filter(f => f !== "all").length;

  // ── Stock Detail Panel ──
  if (detailStock) {
    const s = detailStock;
    const convLabel: Record<number, string> = { 5: "Very High", 4: "High", 3: "Medium", 2: "Low", 1: "Very Low" };
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-4">
        <button onClick={() => setDetailStock(null)} className="text-sm text-tusk-accent hover:underline mb-4 font-medium">
          ← Back to {activeTab === "octopus" ? "Octopus" : activeTab === "comparison" ? "Comparison" : "Decision Support"}
        </button>

        {/* Header Card */}
        <div className="metric-card mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-tusk-dark">{s.companyShort}</h2>
                <span className="pill pill-blue">{s.sector}</span>
                {s.subsector && <span className="text-xs text-gray-400">{s.subsector}</span>}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-gray-400">
                <span>Ticker: <strong className="text-gray-600">{s.displayTikr}</strong></span>
                <span>VA: <strong className="text-gray-600">{s.vp || "—"}</strong></span>
                <span>SA: <strong className="text-gray-600">{s.sa || "—"}</strong></span>
                <span>F&O: <strong className="text-gray-600">{s.in_fno || "—"}</strong></span>
                <span>Updated: <strong className="text-gray-600">{s.last_updated || "—"}</strong></span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-tusk-dark font-mono">₹{s.liveCmp ? fmt(s.liveCmp, 2) : "—"}</div>
              <div className="text-xs text-gray-400 mb-2">Current Market Price</div>
              {s.conviction != null && (
                <div className="flex items-center gap-2 justify-end">
                  <ConvictionDots level={s.conviction} />
                  <span className="text-xs text-gray-500">{convLabel[s.conviction] || ""}</span>
                </div>
              )}
            </div>
          </div>
          {s.comments && <div className="mt-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-800 border border-amber-100">{s.comments}</div>}
        </div>

        {/* Scenario Cards */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: "Bear Case", price: s.bear_current, upside: s.upsideBearCalc, borderColor: "border-red-300", bgColor: "bg-red-50", textColor: "text-red-700" },
            { label: "Base Case", price: s.base_current, upside: s.upsideBaseCalc, borderColor: "border-amber-300", bgColor: "bg-amber-50", textColor: "text-amber-700" },
            { label: "Bull Case", price: s.bull_current, upside: s.upsideBullCalc, borderColor: "border-green-300", bgColor: "bg-green-50", textColor: "text-green-700" },
          ].map(sc => (
            <div key={sc.label} className={`p-4 rounded-xl border-2 ${sc.borderColor} ${sc.bgColor}`}>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">{sc.label}</div>
              <div className={`text-2xl font-bold font-mono ${sc.textColor}`}>₹{sc.price ? fmt(sc.price, 0) : "—"}</div>
              {sc.upside != null && (
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold border ${sc.upside >= 0 ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}>
                  {sc.upside >= 0 ? "+" : ""}{(sc.upside * 100).toFixed(1)}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="metric-card">
            <div className="text-xs text-gray-500 uppercase tracking-wide">1Y Target</div>
            <div className="text-xl font-bold text-tusk-dark mt-1 font-mono">₹{s.target_1y ? fmt(s.target_1y, 0) : "—"}</div>
            {s.upside_1y != null && <div className={`text-xs font-bold mt-1 ${(Math.abs(s.upside_1y) < 1 ? s.upside_1y * 100 : s.upside_1y) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtPct(s.upside_1y)}</div>}
          </div>
          <div className="metric-card">
            <div className="text-xs text-gray-500 uppercase tracking-wide">2Y Target</div>
            <div className="text-xl font-bold text-tusk-dark mt-1 font-mono">₹{s.target_2y ? fmt(s.target_2y, 0) : "—"}</div>
            {s.upside_2y != null && <div className={`text-xs font-bold mt-1 ${(Math.abs(s.upside_2y) < 1 ? s.upside_2y * 100 : s.upside_2y) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtPct(s.upside_2y)}</div>}
          </div>
          <div className="metric-card">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Dividend Yield</div>
            <div className="text-xl font-bold text-tusk-dark mt-1 font-mono">{s.div_yield != null ? `${s.div_yield.toFixed(1)}%` : "—"}</div>
          </div>
          <div className="metric-card">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Score</div>
            <div className="text-xl font-bold text-tusk-dark mt-1 font-mono">{s.score ?? "—"}</div>
            {s.score_adj_1y != null && <div className="text-xs text-gray-400">1Y adj: {s.score_adj_1y}</div>}
          </div>
        </div>

        {/* Valuation Metrics */}
        <div className="metric-card mb-4">
          <h3 className="text-sm font-bold text-tusk-dark uppercase tracking-wider mb-3">Valuation Multiples</h3>
          <table className="data-table w-full">
            <thead>
              <tr><th>Metric</th><th>Base</th><th>+2 SD</th></tr>
            </thead>
            <tbody>
              <tr><td className="font-medium text-gray-600">PE</td><td className="font-mono">{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</td><td className="font-mono">{s.base_pe_2sd ? `${s.base_pe_2sd.toFixed(1)}x` : "—"}</td></tr>
              <tr><td className="font-medium text-gray-600">PB</td><td className="font-mono">{s.base_pb ? `${s.base_pb.toFixed(1)}x` : "—"}</td><td className="font-mono">{s.base_pb_2sd ? `${s.base_pb_2sd.toFixed(1)}x` : "—"}</td></tr>
              <tr><td className="font-medium text-gray-600">EV/EBITDA</td><td className="font-mono">{s.base_evebitda ? `${s.base_evebitda.toFixed(1)}x` : "—"}</td><td className="font-mono">{s.base_evebitda_2sd ? `${s.base_evebitda_2sd.toFixed(1)}x` : "—"}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Holdings & Financials */}
        <div className="grid grid-cols-2 gap-4">
          <div className="metric-card">
            <h3 className="text-sm font-bold text-tusk-dark uppercase tracking-wider mb-3">Position Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Holding (Cash)</span><span className="font-bold">{s.holding_cash_lakhs ? fmtLakhs(s.holding_cash_lakhs) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Holding %</span><span className="font-bold">{s.holding_pct ? `${(s.holding_pct * 100).toFixed(2)}%` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Abs Leverage</span><span className="font-bold">{s.abs_leverage ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Leverage %</span><span className="font-bold">{s.leverage_pct ? `${(s.leverage_pct * 100).toFixed(1)}%` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Conviction</span><span className="font-bold">{s.conviction ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Understanding</span><span className="font-bold">{s.understanding ?? "—"}</span></div>
            </div>
          </div>
          <div className="metric-card">
            <h3 className="text-sm font-bold text-tusk-dark uppercase tracking-wider mb-3">Expected Profit</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">FY27 Expected Profit</span><span className="font-bold font-mono">{s.exp_profit_fy27 ? `₹${s.exp_profit_fy27.toFixed(1)} Cr` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">FY28 Expected Profit</span><span className="font-bold font-mono">{s.exp_profit_fy28 ? `₹${s.exp_profit_fy28.toFixed(1)} Cr` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Remarks</span><span className="font-bold">{s.remarks || "—"}</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-4 bg-white rounded-xl shadow-sm px-2">
        {([
          { key: "octopus" as const, label: "Octopus" },
          { key: "holdings" as const, label: "Holdings Analysis" },
          { key: "comparison" as const, label: "Comparison" },
          { key: "decisions" as const, label: "Decision Support" },
        ]).map(tab => (
          <button key={tab.key} onClick={() => handleTabSwitch(tab.key)} className={`px-5 py-3 text-sm font-medium transition-colors ${activeTab === tab.key ? "tab-active" : "text-gray-500 hover:text-gray-700"}`}>
            {tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-2">
          {dataLastRefreshed && <span className="text-xs text-gray-400">Data: {new Date(dataLastRefreshed).toLocaleTimeString("en-IN")}</span>}
          <button onClick={refreshData} disabled={dataRefreshing} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {dataRefreshing ? "Refreshing..." : "Refresh Data"}
          </button>
          <span className="text-gray-300 mx-1">|</span>
          {lastFetched && <span className="text-xs text-gray-400">CMP: {new Date(lastFetched).toLocaleTimeString("en-IN")}</span>}
          {autoRefresh && marketOpen && <span className="text-xs text-tusk-accent font-mono min-w-[28px] text-center">{countdown}s</span>}
          {autoRefresh && !marketOpen && <span className="text-xs text-gray-400">Mkt closed</span>}
          <button onClick={fetchQuotes} disabled={quotesLoading} className="text-xs bg-tusk-dark text-white px-3 py-1.5 rounded-md hover:bg-tusk-blue disabled:opacity-50 transition-colors">
            {quotesLoading ? "Fetching..." : "Refresh CMP"}
          </button>
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`text-xs px-2 py-1.5 rounded-md transition-colors ${autoRefresh ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-300 text-gray-600 hover:bg-gray-400"}`}>
            {autoRefresh ? "Auto: ON" : "Auto: OFF"}
          </button>
        </div>
      </div>

      {/* ═══ TAB 1: OCTOPUS ═══ */}
      {activeTab === "octopus" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <input type="text" placeholder="Search company, sector, VP..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-1 min-w-[250px] max-w-md px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-tusk-accent/30" />
            <select value={filterSector} onChange={e => setFilterSector(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"><option value="all">All Sectors</option>{filterOptions.sectors.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <select value={filterVP} onChange={e => setFilterVP(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"><option value="all">All VPs</option>{filterOptions.vps.map(v => <option key={v} value={v}>{v}</option>)}</select>
            <select value={filterConviction} onChange={e => setFilterConviction(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"><option value="all">All Conviction</option>{filterOptions.convictions.map(c => <option key={c} value={String(c)}>{c}</option>)}</select>
            {activeFilters > 0 && <button onClick={() => { setFilterSector("all"); setFilterVP("all"); setFilterConviction("all"); }} className="text-xs text-tusk-accent hover:underline">Clear filters ({activeFilters})</button>}
            <span className="text-xs text-gray-500 ml-auto">{sortedStocks.length} stocks · {Object.keys(quotes).length} live</span>
            <button onClick={() => {
              const csv = ["Company,Sector,CMP,Bear,Base,Bull,Upside Bear,Upside Base,Upside Bull,1Y Upside,2Y Upside,Base PE,Base PB,Base EV/EBITDA,Conviction,VA,SA",
                ...sortedStocks.map(s => [`"${s.companyShort}"`,`"${s.sector||""}"`,s.liveCmp?.toFixed(0)||"",s.bear_current?.toFixed(0)||"",s.base_current?.toFixed(0)||"",s.bull_current?.toFixed(0)||"",s.upsideBearCalc!=null?(s.upsideBearCalc*100).toFixed(1)+"%":"",s.upsideBaseCalc!=null?(s.upsideBaseCalc*100).toFixed(1)+"%":"",s.upsideBullCalc!=null?(s.upsideBullCalc*100).toFixed(1)+"%":"",s.upside_1y!=null?s.upside_1y.toFixed(1)+"%":"",s.upside_2y!=null?s.upside_2y.toFixed(1)+"%":"",s.base_pe?.toFixed(1)||"",s.base_pb?.toFixed(1)||"",s.base_evebitda?.toFixed(1)||"",s.conviction??"",s.vp||"",s.sa||""].join(","))
              ].join("\n");
              const b = new Blob([csv], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `octopus_${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(u);
            }} className="text-xs bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700">Export CSV</button>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
            <table className="data-table w-full">
              <thead><tr>
                <Th col="companyShort" label="Company" /><Th col="sector" label="Sector" /><Th col="liveCmp" label="CMP" />
                <Th col="bear_current" label="Bear" /><Th col="base_current" label="Base" /><Th col="bull_current" label="Bull" />
                <Th col="upsideBearCalc" label="Upside Bear" /><Th col="upsideBaseCalc" label="Upside Base" /><Th col="upsideBullCalc" label="Upside Bull" />
                <Th col="upside_1y" label="1Y Upside" /><Th col="upside_2y" label="2Y Upside" />
                <Th col="base_pe" label="Base PE" /><Th col="base_pb" label="Base PB" /><Th col="base_evebitda" label="Base EV/EBITDA" />
                <Th col="conviction" label="Conviction" /><Th col="vp" label="VA" /><Th col="sa" label="SA" />
              </tr></thead>
              <tbody>
                {sortedStocks.map((s, i) => {
                  const isBuy = s.liveCmp && s.bear_current && s.liveCmp <= s.bear_current * 1.05;
                  const isSell = s.liveCmp && s.bull_current && s.liveCmp >= s.bull_current * 0.95;
                  return (
                    <tr key={`${s.tikr}-${i}`} className={`cursor-pointer ${isBuy ? "row-buy-zone" : isSell ? "row-sell-zone" : ""}`} onClick={() => setDetailStock(s)}>
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

      {/* ═══ TAB 2: HOLDINGS ═══ */}
      {activeTab === "holdings" && (
        <div>
          {!holdingsUnlocked ? (
            <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
              <div className="metric-card text-center max-w-sm w-full">
                <h2 className="text-xl font-bold text-tusk-dark mb-2">Holdings Analysis</h2>
                <p className="text-gray-500 text-sm mb-6">Enter PIN to access portfolio holdings data</p>
                <input type="password" placeholder="Enter PIN" value={holdingsPin} onChange={e => setHoldingsPin(e.target.value)} onKeyDown={e => e.key === "Enter" && unlockHoldings()} className="w-full px-4 py-3 rounded-lg border border-gray-200 text-center text-lg tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-tusk-accent/30" />
                {holdingsError && <p className="text-red-500 text-sm mb-3">{holdingsError}</p>}
                <button onClick={unlockHoldings} disabled={holdingsLoading || !holdingsPin} className="w-full bg-tusk-dark hover:bg-tusk-blue text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50">{holdingsLoading ? "Verifying..." : "Unlock"}</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-5 gap-4 mb-4">
                {(() => {
                  const ti = enrichedHoldings.reduce((s, h) => s + h.amt_invested, 0);
                  const tv = enrichedHoldings.reduce((s, h) => s + h.liveValue, 0);
                  const tg = tv - ti; const tp = ti > 0 ? (tg / ti) * 100 : 0;
                  const bv = enrichedHoldings.reduce((s, h) => s + (h.stockData?.bear_current || h.livePrice) * h.quantity, 0);
                  const buv = enrichedHoldings.reduce((s, h) => s + (h.stockData?.bull_current || h.livePrice) * h.quantity, 0);
                  return (<>
                    <div className="metric-card"><p className="text-xs text-gray-500 uppercase tracking-wide">Total Invested</p><p className="text-xl font-bold text-tusk-dark mt-1">{fmtCr(ti)}</p></div>
                    <div className="metric-card"><p className="text-xs text-gray-500 uppercase tracking-wide">Current Value</p><p className="text-xl font-bold text-tusk-dark mt-1">{fmtCr(tv)}</p></div>
                    <div className="metric-card"><p className="text-xs text-gray-500 uppercase tracking-wide">Unrealized P&L</p><p className={`text-xl font-bold mt-1 ${tg >= 0 ? "text-green-600" : "text-red-600"}`}>{tg >= 0 ? "+" : ""}{fmtCr(tg)} ({tp.toFixed(1)}%)</p></div>
                    <div className="metric-card"><p className="text-xs text-gray-500 uppercase tracking-wide">Bear Scenario</p><p className="text-xl font-bold text-red-600 mt-1">{fmtCr(bv)}</p><p className="text-xs text-gray-400">Drawdown: {tv ? ((bv - tv) / tv * 100).toFixed(1) : 0}%</p></div>
                    <div className="metric-card"><p className="text-xs text-gray-500 uppercase tracking-wide">Bull Scenario</p><p className="text-xl font-bold text-green-600 mt-1">{fmtCr(buv)}</p><p className="text-xs text-gray-400">Upside: +{tv ? ((buv - tv) / tv * 100).toFixed(1) : 0}%</p></div>
                  </>);
                })()}
              </div>
              <div className="bg-white rounded-xl shadow-sm overflow-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
                <table className="data-table w-full">
                  <thead><tr><th>Stock</th><th>Qty</th><th>Avg Cost</th><th>CMP</th><th>Invested</th><th>Value</th><th>P&L</th><th>P&L %</th><th>Bear</th><th>Base</th><th>Bull</th><th>Upside Bear</th><th>Upside Base</th><th>Upside Bull</th></tr></thead>
                  <tbody>
                    {enrichedHoldings.sort((a, b) => b.liveValue - a.liveValue).map((h, i) => (
                      <tr key={i}>
                        <td className="font-semibold text-tusk-dark">{h.asset_name}</td><td>{fmt(h.quantity)}</td><td>₹{fmt(h.avg_price, 1)}</td><td className="font-semibold">₹{fmt(h.livePrice, 1)}</td>
                        <td>{fmtCr(h.amt_invested)}</td><td className="font-semibold">{fmtCr(h.liveValue)}</td>
                        <td className={h.liveGain >= 0 ? "cell-green" : "cell-red"}>{h.liveGain >= 0 ? "+" : ""}{fmtCr(h.liveGain)}</td>
                        <td className={h.liveGainPct >= 0 ? "cell-green" : "cell-red"}>{h.liveGainPct >= 0 ? "+" : ""}{h.liveGainPct.toFixed(1)}%</td>
                        <td>{h.stockData?.bear_current ? `₹${fmt(h.stockData.bear_current, 0)}` : "—"}</td>
                        <td>{h.stockData?.base_current ? `₹${fmt(h.stockData.base_current, 0)}` : "—"}</td>
                        <td>{h.stockData?.bull_current ? `₹${fmt(h.stockData.bull_current, 0)}` : "—"}</td>
                        <td className={pctColor(h.upsideToBear != null ? h.upsideToBear / 100 : null)}>{h.upsideToBear != null ? `${h.upsideToBear >= 0 ? "+" : ""}${h.upsideToBear.toFixed(1)}%` : "—"}</td>
                        <td className={pctColor(h.upsideToBase != null ? h.upsideToBase / 100 : null)}>{h.upsideToBase != null ? `${h.upsideToBase >= 0 ? "+" : ""}${h.upsideToBase.toFixed(1)}%` : "—"}</td>
                        <td className={pctColor(h.upsideToBull != null ? h.upsideToBull / 100 : null)}>{h.upsideToBull != null ? `${h.upsideToBull >= 0 ? "+" : ""}${h.upsideToBull.toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 3: COMPARISON ═══ */}
      {activeTab === "comparison" && (
        <div>
          <div className="metric-card mb-4">
            <div className="flex items-center gap-3 mb-3">
              <input type="text" placeholder="Search stocks..." value={compareSearch} onChange={e => setCompareSearch(e.target.value)} disabled={selectedCompare.length >= 4} className="flex-1 max-w-sm px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-tusk-accent/30 disabled:opacity-50" />
              <select value={compareSectorFilter} onChange={e => setCompareSectorFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                <option value="all">All Sectors</option>
                {filterOptions.sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedCompare.map(tikr => {
                  const s = enrichedStocks.find(st => st.tikr === tikr);
                  return <span key={tikr} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">{s?.companyShort || tikr}<button onClick={() => setSelectedCompare(selectedCompare.filter(t => t !== tikr))} className="text-blue-500 hover:text-blue-700 ml-1 font-bold">&times;</button></span>;
                })}
                {selectedCompare.length > 0 && <button onClick={() => setSelectedCompare([])} className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>}
              </div>
            </div>
            {/* Quick-pick grid */}
            {selectedCompare.length < 4 && (
              <div className="grid grid-cols-6 gap-2 max-h-[200px] overflow-y-auto">
                {compareFilteredStocks.slice(0, 30).map(s => (
                  <button key={s.tikr} onClick={() => setSelectedCompare([...selectedCompare, s.tikr])} className="text-left p-2 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-xs">
                    <div className="font-semibold text-tusk-dark truncate">{s.companyShort}</div>
                    <div className="text-gray-400 truncate">{s.sector}</div>
                    {s.liveCmp && <div className="font-mono mt-0.5">₹{fmt(s.liveCmp, 0)}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {comparedStocks.length > 0 && (
            <div className="space-y-4">
              <div className="metric-card">
                <h3 className="font-bold text-tusk-dark mb-3 text-sm uppercase tracking-wide">Price & Valuation</h3>
                <table className="data-table w-full"><thead><tr><th>Metric</th>{comparedStocks.map(s => <th key={s.tikr}>{s.companyShort}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="font-medium text-gray-600">Sector</td>{comparedStocks.map(s => <td key={s.tikr}><span className="pill pill-blue">{s.sector || "—"}</span></td>)}</tr>
                    <tr><td className="font-medium text-gray-600">CMP</td>{comparedStocks.map(s => <td key={s.tikr} className="font-semibold">{s.liveCmp ? `₹${fmt(s.liveCmp, 1)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Bear</td>{comparedStocks.map(s => <td key={s.tikr}>{s.bear_current ? `₹${fmt(s.bear_current, 0)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Base</td>{comparedStocks.map(s => <td key={s.tikr} className="font-semibold">{s.base_current ? `₹${fmt(s.base_current, 0)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Bull</td>{comparedStocks.map(s => <td key={s.tikr}>{s.bull_current ? `₹${fmt(s.bull_current, 0)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">1Y Target</td>{comparedStocks.map(s => <td key={s.tikr}>{s.target_1y ? `₹${fmt(s.target_1y, 0)}` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">2Y Target</td>{comparedStocks.map(s => <td key={s.tikr}>{s.target_2y ? `₹${fmt(s.target_2y, 0)}` : "—"}</td>)}</tr>
                  </tbody>
                </table>
              </div>
              <div className="metric-card">
                <h3 className="font-bold text-tusk-dark mb-3 text-sm uppercase tracking-wide">Upside Analysis</h3>
                <table className="data-table w-full"><thead><tr><th>Metric</th>{comparedStocks.map(s => <th key={s.tikr}>{s.companyShort}</th>)}</tr></thead>
                  <tbody>
                    {["upsideBearCalc","upsideBaseCalc","upsideBullCalc"].map((k,ki) => {
                      const labels = ["Upside Bear","Upside Base","Upside Bull"];
                      return <tr key={k}><td className="font-medium text-gray-600">{labels[ki]}</td>{comparedStocks.map(s => { const v = s[k as keyof EnrichedStock] as number|undefined; return <td key={s.tikr} className={pctColor(v)}>{v != null ? fmtPct(v) : "—"}</td>; })}</tr>;
                    })}
                    <tr><td className="font-medium text-gray-600">1Y Upside</td>{comparedStocks.map(s => <td key={s.tikr} className={pctColor(s.upside_1y)}>{s.upside_1y != null ? fmtPct(s.upside_1y) : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">2Y Upside</td>{comparedStocks.map(s => <td key={s.tikr} className={pctColor(s.upside_2y)}>{s.upside_2y != null ? fmtPct(s.upside_2y) : "—"}</td>)}</tr>
                  </tbody>
                </table>
              </div>
              <div className="metric-card">
                <h3 className="font-bold text-tusk-dark mb-3 text-sm uppercase tracking-wide">Fundamentals</h3>
                <table className="data-table w-full"><thead><tr><th>Metric</th>{comparedStocks.map(s => <th key={s.tikr}>{s.companyShort}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="font-medium text-gray-600">Base PE</td>{comparedStocks.map(s => <td key={s.tikr}>{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">PE +2SD</td>{comparedStocks.map(s => <td key={s.tikr}>{s.base_pe_2sd ? `${s.base_pe_2sd.toFixed(1)}x` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Base PB</td>{comparedStocks.map(s => <td key={s.tikr}>{s.base_pb ? `${s.base_pb.toFixed(1)}x` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Base EV/EBITDA</td>{comparedStocks.map(s => <td key={s.tikr}>{s.base_evebitda ? `${s.base_evebitda.toFixed(1)}x` : "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Conviction</td>{comparedStocks.map(s => <td key={s.tikr} className="font-semibold">{s.conviction ?? "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">Score</td>{comparedStocks.map(s => <td key={s.tikr} className="font-semibold">{s.score ?? "—"}</td>)}</tr>
                    <tr><td className="font-medium text-gray-600">VA / SA</td>{comparedStocks.map(s => <td key={s.tikr}>{s.vp || "—"} / {s.sa || "—"}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {comparedStocks.length === 0 && selectedCompare.length === 0 && !compareSearch && compareSectorFilter === "all" && (
            <div className="text-center py-8 text-gray-400 text-sm">Select stocks from the grid above, or use search/sector filter to narrow down.</div>
          )}
        </div>
      )}

      {/* ═══ TAB 4: DECISION SUPPORT ═══ */}
      {activeTab === "decisions" && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-3">
            <div className="metric-card text-center border-l-4 border-gray-300"><p className="text-xs text-gray-500 uppercase tracking-wide">Universe</p><p className="text-2xl font-bold text-tusk-dark mt-1">{decisionData.totalStocks}</p><p className="text-xs text-gray-400">{decisionData.totalWithCmp} with CMP</p></div>
            <div className="metric-card text-center border-l-4 border-green-400"><p className="text-xs text-gray-500 uppercase tracking-wide">Buy Zone</p><p className="text-2xl font-bold text-green-600 mt-1">{decisionData.buyZone.length}</p></div>
            <div className="metric-card text-center border-l-4 border-red-400"><p className="text-xs text-gray-500 uppercase tracking-wide">Take Profit</p><p className="text-2xl font-bold text-red-600 mt-1">{decisionData.sellZone.length}</p></div>
            <div className="metric-card text-center border-l-4 border-orange-400"><p className="text-xs text-gray-500 uppercase tracking-wide">Overvalued</p><p className="text-2xl font-bold text-orange-600 mt-1">{decisionData.overvalued.length}</p></div>
            <div className="metric-card text-center border-l-4 border-purple-400"><p className="text-xs text-gray-500 uppercase tracking-wide">High Conviction</p><p className="text-2xl font-bold text-purple-600 mt-1">{decisionData.highConviction.length}</p></div>
          </div>

          {/* Buy & Sell */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card border-t-4 border-green-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Buy Zone — CMP Near Bear</h3>
              {decisionData.buyZone.length === 0 ? <p className="text-gray-400 text-sm py-4">None currently</p> : (
                <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>Company</th><th>CMP</th><th>Bear</th><th>Upside to Base</th></tr></thead>
                  <tbody>{decisionData.buyZone.map((s, i) => (<tr key={i} className="row-buy-zone cursor-pointer" onClick={() => setDetailStock(s)}><td className="font-semibold text-sm" style={{whiteSpace:"normal"}}>{s.companyShort}</td><td>₹{fmt(s.liveCmp, 0)}</td><td>₹{fmt(s.bear_current, 0)}</td><td><UpsideBar value={(s.upsideBaseCalc||0)*100} /></td></tr>))}</tbody></table></div>
              )}
            </div>
            <div className="metric-card border-t-4 border-red-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Take Profit — CMP Near Bull</h3>
              {decisionData.sellZone.length === 0 ? <p className="text-gray-400 text-sm py-4">None currently</p> : (
                <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>Company</th><th>CMP</th><th>Bull</th><th>Upside to Bull</th></tr></thead>
                  <tbody>{decisionData.sellZone.map((s, i) => (<tr key={i} className="row-sell-zone cursor-pointer" onClick={() => setDetailStock(s)}><td className="font-semibold text-sm" style={{whiteSpace:"normal"}}>{s.companyShort}</td><td>₹{fmt(s.liveCmp, 0)}</td><td>₹{fmt(s.bull_current, 0)}</td><td><UpsideBar value={(s.upsideBullCalc||0)*100} /></td></tr>))}</tbody></table></div>
              )}
            </div>
          </div>

          {/* Upside & Downside */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card border-t-4 border-blue-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Top 10 — Highest Upside to Base</h3>
              <div className="overflow-auto max-h-[340px]"><table className="data-table w-full"><thead><tr><th>#</th><th>Company</th><th>Sector</th><th>CMP</th><th>Base</th><th>Upside</th></tr></thead>
                <tbody>{decisionData.bestUpside.map((s, i) => (<tr key={i} className="cursor-pointer" onClick={() => setDetailStock(s)}><td className="text-gray-400 text-xs">{i+1}</td><td className="font-semibold text-sm" style={{whiteSpace:"normal"}}>{s.companyShort}</td><td className="text-xs">{s.sector}</td><td>₹{fmt(s.liveCmp, 0)}</td><td>₹{fmt(s.base_current, 0)}</td><td><UpsideBar value={(s.upsideBaseCalc||0)*100} /></td></tr>))}</tbody></table></div>
            </div>
            <div className="metric-card border-t-4 border-amber-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Top 10 — Largest Downside to Bear</h3>
              <div className="overflow-auto max-h-[340px]"><table className="data-table w-full"><thead><tr><th>#</th><th>Company</th><th>Sector</th><th>CMP</th><th>Bear</th><th>Downside</th></tr></thead>
                <tbody>{decisionData.worstDownside.map((s, i) => (<tr key={i} className="cursor-pointer" onClick={() => setDetailStock(s)}><td className="text-gray-400 text-xs">{i+1}</td><td className="font-semibold text-sm" style={{whiteSpace:"normal"}}>{s.companyShort}</td><td className="text-xs">{s.sector}</td><td>₹{fmt(s.liveCmp, 0)}</td><td>₹{fmt(s.bear_current, 0)}</td><td><UpsideBar value={(s.upsideBearCalc||0)*100} /></td></tr>))}</tbody></table></div>
            </div>
          </div>

          {/* VA & SA Analysis */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card border-t-4 border-indigo-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">VA (Analyst) Coverage & Holdings</h3>
              <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>VA</th><th>Stocks</th><th>Holdings Value</th><th>Holdings Count</th><th>Avg Upside</th></tr></thead>
                <tbody>{Object.entries(decisionData.vpStats).sort((a,b) => b[1].holdingsValue - a[1].holdingsValue).map(([vp, d]) => (
                  <tr key={vp}><td className="font-semibold text-sm">{vp}</td><td className="text-center"><span className="pill pill-blue">{d.count}</span></td><td className="font-mono">{d.holdingsValue > 0 ? fmtLakhs(d.holdingsValue) : "—"}</td><td className="text-center">{d.holdingsStocks > 0 ? d.holdingsStocks : "—"}</td><td><UpsideBar value={d.avgUpside} /></td></tr>
                ))}</tbody></table></div>
            </div>
            <div className="metric-card border-t-4 border-teal-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">SA (Analyst) Coverage & Holdings</h3>
              <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>SA</th><th>Stocks</th><th>Holdings Value</th><th>Holdings Count</th><th>Avg Upside</th></tr></thead>
                <tbody>{Object.entries(decisionData.saStats).sort((a,b) => b[1].holdingsValue - a[1].holdingsValue).map(([sa, d]) => (
                  <tr key={sa}><td className="font-semibold text-sm">{sa}</td><td className="text-center"><span className="pill pill-blue">{d.count}</span></td><td className="font-mono">{d.holdingsValue > 0 ? fmtLakhs(d.holdingsValue) : "—"}</td><td className="text-center">{d.holdingsStocks > 0 ? d.holdingsStocks : "—"}</td><td><UpsideBar value={d.avgUpside} /></td></tr>
                ))}</tbody></table></div>
            </div>
          </div>

          {/* Sector & High Conviction */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card border-t-4 border-gray-300">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">Sector Snapshot</h3>
              <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>Sector</th><th>Stocks</th><th>Avg Upside Base</th><th>Avg Downside Bear</th></tr></thead>
                <tbody>{Object.entries(decisionData.sectors).sort((a,b) => b[1].avgUpsideBase - a[1].avgUpsideBase).map(([sec, d]) => (
                  <tr key={sec}><td className="text-sm">{sec}</td><td className="text-center"><span className="pill pill-blue">{d.count}</span></td><td><UpsideBar value={d.avgUpsideBase} /></td><td><UpsideBar value={d.avgUpsideBear} /></td></tr>
                ))}</tbody></table></div>
            </div>
            <div className="metric-card border-t-4 border-purple-400">
              <h3 className="font-bold text-tusk-dark mb-3 text-sm">High Conviction (4+)</h3>
              {decisionData.highConviction.length === 0 ? <p className="text-gray-400 text-sm py-4">None</p> : (
                <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>Company</th><th>Conv.</th><th>Sector</th><th>CMP</th><th>Upside Base</th></tr></thead>
                  <tbody>{decisionData.highConviction.map((s, i) => (
                    <tr key={i} className="cursor-pointer" onClick={() => setDetailStock(s)}><td className="font-semibold text-sm" style={{whiteSpace:"normal"}}>{s.companyShort}</td><td className="text-center font-bold text-purple-700">{s.conviction}</td><td className="text-xs">{s.sector}</td><td>₹{fmt(s.liveCmp, 0)}</td><td><UpsideBar value={(s.upsideBaseCalc||0)*100} /></td></tr>
                  ))}</tbody></table></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
