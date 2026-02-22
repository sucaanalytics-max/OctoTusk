"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";

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

// ── Utilities ──
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

// ── CountUp Component ──
const CountUp = ({ value, prefix = "", suffix = "", decimals = 0, duration = 800 }: { value: number; prefix?: string; suffix?: string; decimals?: number; duration?: number }) => {
  const [display, setDisplay] = useState("0");
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = ref.current;
    const end = value;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(current.toLocaleString("en-IN", { maximumFractionDigits: decimals }));
      if (progress < 1) requestAnimationFrame(animate);
      else ref.current = end;
    };
    requestAnimationFrame(animate);
  }, [value, decimals, duration]);

  return <>{prefix}{display}{suffix}</>;
};

// ── UpsideBar Component ──
const UpsideBar = ({ value, max = 100 }: { value: number; max?: number }) => {
  const w = Math.min(Math.abs(value) / max * 100, 100);
  const pos = value >= 0;
  return (
    <div className="flex items-center gap-2" role="meter" aria-valuenow={value} aria-valuemin={-max} aria-valuemax={max} aria-label={`${value.toFixed(1)}% upside`}>
      <span className="font-mono font-bold min-w-[52px] text-right" style={{ fontSize: "var(--text-xs)", color: pos ? "var(--color-positive)" : "var(--color-negative)" }}>
        {pos ? "+" : ""}{value.toFixed(1)}%
      </span>
      <div className="upside-bar-track flex-1">
        <div className={pos ? "upside-bar-fill-positive" : "upside-bar-fill-negative"} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
};

// ── ConvictionDots ──
const ConvictionDots = ({ level }: { level: number }) => (
  <div className="flex gap-0.5" role="meter" aria-valuenow={level} aria-valuemin={1} aria-valuemax={5} aria-label={`Conviction: ${level} out of 5`}>
    {[1, 2, 3, 4, 5].map(i => (
      <div key={i} className="w-2 h-2 rounded-full" style={{ background: i <= level ? "var(--color-warning)" : "var(--color-bg-hover)" }} />
    ))}
  </div>
);

// ── Loading Skeleton ──
const SkeletonRow = () => (
  <tr>
    {Array.from({ length: 8 }).map((_, i) => (
      <td key={i}><div className="skeleton skeleton-text" style={{ width: `${60 + Math.random() * 40}%` }} /></td>
    ))}
  </tr>
);

const KpiSkeleton = () => (
  <div className="kpi-card animate-fade-in-up">
    <div className="skeleton" style={{ height: 12, width: "50%", marginBottom: 12 }} />
    <div className="skeleton" style={{ height: 28, width: "70%" }} />
  </div>
);

// ═══════════════════════════════ MAIN ═══════════════════════════════
export default function DashboardClient({ stocks, tickerMap, metadata }: Props) {
  const [activeTab, setActiveTab] = useState<"octopus" | "holdings" | "comparison" | "decisions">("octopus");
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [quotesLoading, setQuotesLoading] = useState(true);
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
      let uB: number | undefined, uBa: number | undefined, uBu: number | undefined;
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

  // Comparison
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

    const sectors: Record<string, { count: number; avgUpsideBase: number; avgUpsideBear: number }> = {};
    withCmp.forEach(s => {
      const sec = s.sector || "Other";
      if (!sectors[sec]) sectors[sec] = { count: 0, avgUpsideBase: 0, avgUpsideBear: 0 };
      sectors[sec].count++;
      sectors[sec].avgUpsideBase += (s.upsideBaseCalc || 0) * 100;
      sectors[sec].avgUpsideBear += (s.upsideBearCalc || 0) * 100;
    });
    Object.values(sectors).forEach(v => { v.avgUpsideBase /= v.count || 1; v.avgUpsideBear /= v.count || 1; });

    const vpStats: Record<string, { count: number; avgUpside: number; holdingsValue: number; holdingsStocks: number }> = {};
    enrichedStocks.forEach(s => {
      const vp = s.vp || "Unassigned";
      if (!vpStats[vp]) vpStats[vp] = { count: 0, avgUpside: 0, holdingsValue: 0, holdingsStocks: 0 };
      vpStats[vp].count++;
      if (s.upsideBaseCalc != null) vpStats[vp].avgUpside += (s.upsideBaseCalc || 0) * 100;
      if (s.holding_cash_lakhs && s.holding_cash_lakhs > 0) { vpStats[vp].holdingsValue += s.holding_cash_lakhs; vpStats[vp].holdingsStocks++; }
    });
    Object.values(vpStats).forEach(v => { v.avgUpside = v.count > 0 ? v.avgUpside / v.count : 0; });

    const saStats: Record<string, { count: number; avgUpside: number; holdingsValue: number; holdingsStocks: number }> = {};
    enrichedStocks.forEach(s => {
      const sa = s.sa || "Unassigned";
      if (!saStats[sa]) saStats[sa] = { count: 0, avgUpside: 0, holdingsValue: 0, holdingsStocks: 0 };
      saStats[sa].count++;
      if (s.upsideBaseCalc != null) saStats[sa].avgUpside += (s.upsideBaseCalc || 0) * 100;
      if (s.holding_cash_lakhs && s.holding_cash_lakhs > 0) { saStats[sa].holdingsValue += s.holding_cash_lakhs; saStats[sa].holdingsStocks++; }
    });
    Object.values(saStats).forEach(v => { v.avgUpside = v.count > 0 ? v.avgUpside / v.count : 0; });

    // KPI aggregates
    const totalHoldingsValue = enrichedStocks.reduce((sum, s) => sum + (s.holding_cash_lakhs || 0), 0);
    const avgBaseUpside = withCmp.length > 0 ? withCmp.reduce((sum, s) => sum + (s.upsideBaseCalc || 0), 0) / withCmp.length * 100 : 0;
    const avgBearDownside = withCmp.length > 0 ? withCmp.reduce((sum, s) => sum + (s.upsideBearCalc || 0), 0) / withCmp.length * 100 : 0;

    return { buyZone, sellZone, bestUpside, worstDownside, overvalued, highConviction, sectors, vpStats, saStats, totalWithCmp: withCmp.length, totalStocks: enrichedStocks.length, totalHoldingsValue, avgBaseUpside, avgBearDownside };
  }, [enrichedStocks]);

  // Sortable table header
  const Th = ({ col, label }: { col: string; label: string }) => (
    <th className={sortCol === col ? (sortDir === "asc" ? "sort-asc" : "sort-desc") : ""} onClick={() => handleSort(col)} role="columnheader" aria-sort={sortCol === col ? (sortDir === "asc" ? "ascending" : "descending") : "none"} tabIndex={0} onKeyDown={e => e.key === "Enter" && handleSort(col)}>{label}</th>
  );

  const activeFilters = [filterSector, filterVP, filterConviction].filter(f => f !== "all").length;

  // ── CSV Export ──
  const exportCSV = () => {
    const csv = ["Company,Sector,CMP,Bear,Base,Bull,Upside Bear,Upside Base,Upside Bull,1Y Upside,2Y Upside,Base PE,Base PB,Base EV/EBITDA,Conviction,VA,SA",
      ...sortedStocks.map(s => [`"${s.companyShort}"`, `"${s.sector || ""}"`, s.liveCmp?.toFixed(0) || "", s.bear_current?.toFixed(0) || "", s.base_current?.toFixed(0) || "", s.bull_current?.toFixed(0) || "", s.upsideBearCalc != null ? (s.upsideBearCalc * 100).toFixed(1) + "%" : "", s.upsideBaseCalc != null ? (s.upsideBaseCalc * 100).toFixed(1) + "%" : "", s.upsideBullCalc != null ? (s.upsideBullCalc * 100).toFixed(1) + "%" : "", s.upside_1y != null ? s.upside_1y.toFixed(1) + "%" : "", s.upside_2y != null ? s.upside_2y.toFixed(1) + "%" : "", s.base_pe?.toFixed(1) || "", s.base_pb?.toFixed(1) || "", s.base_evebitda?.toFixed(1) || "", String(s.conviction ?? ""), s.vp || "", s.sa || ""].join(","))
    ].join("\n");
    const b = new Blob([csv], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `octopus_${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(u);
  };

  // ── SECTOR ALLOCATION BAR (visual) ──
  const SectorBar = ({ sectors }: { sectors: Record<string, { count: number; avgUpsideBase: number; avgUpsideBear: number }> }) => {
    const sorted = Object.entries(sectors).sort((a, b) => b[1].count - a[1].count);
    const max = sorted.length > 0 ? sorted[0][1].count : 1;
    return (
      <div className="space-y-2">
        {sorted.map(([sec, d]) => (
          <div key={sec} className="flex items-center gap-3">
            <span className="min-w-[130px] text-right truncate sector-label" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{sec}</span>
            <div className="flex-1 relative" style={{ height: 22, background: "var(--color-bg-hover)", borderRadius: "var(--radius-sm)" }}>
              <div className="sector-bar" style={{ width: `${(d.count / max) * 100}%` }}>
                {d.count}
              </div>
            </div>
            <span className="font-mono min-w-[55px] text-right" style={{ fontSize: "var(--text-xs)", color: d.avgUpsideBase >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}>
              {d.avgUpsideBase >= 0 ? "+" : ""}{d.avgUpsideBase.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════
  //  STOCK DETAIL PANEL
  // ══════════════════════════════════════════════════════════
  if (detailStock) {
    const s = detailStock;
    const convLabel: Record<number, string> = { 5: "Very High", 4: "High", 3: "Medium", 2: "Low", 1: "Very Low" };
    return (
      <div className="max-w-[1400px] mx-auto px-5 py-5 dash-wrapper animate-fade-in">
        <button onClick={() => setDetailStock(null)} className="btn btn-ghost btn-sm mb-4" aria-label="Go back to previous view">
          <span aria-hidden="true">←</span> Back to {activeTab === "octopus" ? "Octopus" : activeTab === "comparison" ? "Comparison" : "Decision Support"}
        </button>

        {/* Header */}
        <div className="metric-card mb-4 animate-fade-in-up delay-1">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h2 className="font-bold" style={{ fontSize: "var(--text-2xl)", color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>{s.companyShort}</h2>
                <span className="pill pill-blue">{s.sector}</span>
                {s.subsector && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{s.subsector}</span>}
              </div>
              <div className="flex gap-4 mt-2 flex-wrap" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                <span>Ticker: <strong style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{s.displayTikr}</strong></span>
                <span>VA: <strong style={{ color: "var(--color-text-secondary)" }}>{s.vp || "—"}</strong></span>
                <span>SA: <strong style={{ color: "var(--color-text-secondary)" }}>{s.sa || "—"}</strong></span>
                <span>F&O: <strong style={{ color: "var(--color-text-secondary)" }}>{s.in_fno || "—"}</strong></span>
                <span>Updated: <strong style={{ color: "var(--color-text-secondary)" }}>{s.last_updated || "—"}</strong></span>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold detail-header-price" style={{ fontSize: "var(--text-3xl)", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>
                {s.liveCmp ? <>₹<CountUp value={s.liveCmp} decimals={2} /></> : "—"}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 8 }}>Current Market Price</div>
              {s.conviction != null && (
                <div className="flex items-center gap-2 justify-end">
                  <ConvictionDots level={s.conviction} />
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{convLabel[s.conviction] || ""}</span>
                </div>
              )}
            </div>
          </div>
          {s.comments && <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)", fontSize: "var(--text-xs)", color: "var(--color-warning)" }}>{s.comments}</div>}
        </div>

        {/* Scenario Cards */}
        <div className="grid grid-cols-3 gap-4 mb-4 scenario-grid">
          {[
            { label: "Bear Case", price: s.bear_current, upside: s.upsideBearCalc, borderColor: "var(--color-negative)", bgColor: "var(--color-negative-bg)" },
            { label: "Base Case", price: s.base_current, upside: s.upsideBaseCalc, borderColor: "var(--color-warning)", bgColor: "var(--color-warning-bg)" },
            { label: "Bull Case", price: s.bull_current, upside: s.upsideBullCalc, borderColor: "var(--color-positive)", bgColor: "var(--color-positive-bg)" },
          ].map((sc, idx) => (
            <div key={sc.label} className={`p-4 rounded-xl animate-fade-in-up delay-${idx + 2}`} style={{ border: `2px solid ${sc.borderColor}`, background: sc.bgColor }}>
              <div className="uppercase tracking-wider font-bold mb-1" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{sc.label}</div>
              <div className="font-bold" style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
                {sc.price ? <>₹<CountUp value={sc.price} decimals={0} /></> : "—"}
              </div>
              {sc.upside != null && (
                <span className="inline-block mt-1 px-2 py-0.5 rounded font-bold" style={{ fontSize: "var(--text-xs)", color: sc.upside >= 0 ? "var(--color-positive)" : "var(--color-negative)", background: sc.upside >= 0 ? "var(--color-positive-bg)" : "var(--color-negative-bg)", border: `1px solid ${sc.upside >= 0 ? "var(--color-positive-border)" : "var(--color-negative-border)"}` }}>
                  {sc.upside >= 0 ? "+" : ""}{(sc.upside * 100).toFixed(1)}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-4 mb-4 metrics-grid">
          {[
            { label: "1Y Target", value: s.target_1y ? `₹${fmt(s.target_1y, 0)}` : "—", sub: s.upside_1y != null ? fmtPct(s.upside_1y) : undefined, subColor: s.upside_1y != null ? ((Math.abs(s.upside_1y) < 1 ? s.upside_1y * 100 : s.upside_1y) >= 0 ? "var(--color-positive)" : "var(--color-negative)") : undefined },
            { label: "2Y Target", value: s.target_2y ? `₹${fmt(s.target_2y, 0)}` : "—", sub: s.upside_2y != null ? fmtPct(s.upside_2y) : undefined, subColor: s.upside_2y != null ? ((Math.abs(s.upside_2y) < 1 ? s.upside_2y * 100 : s.upside_2y) >= 0 ? "var(--color-positive)" : "var(--color-negative)") : undefined },
            { label: "Dividend Yield", value: s.div_yield != null ? `${s.div_yield.toFixed(1)}%` : "—" },
            { label: "Score", value: String(s.score ?? "—"), sub: s.score_adj_1y != null ? `1Y adj: ${s.score_adj_1y}` : undefined },
          ].map((m, idx) => (
            <div key={m.label} className={`metric-card animate-fade-in-up delay-${idx + 1}`}>
              <div className="uppercase tracking-wide" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{m.label}</div>
              <div className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{m.value}</div>
              {m.sub && <div className="font-bold mt-1" style={{ fontSize: "var(--text-xs)", color: m.subColor || "var(--color-text-muted)" }}>{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* Valuation Table */}
        <div className="metric-card mb-4 animate-fade-in-up delay-5">
          <h3 className="font-bold uppercase tracking-wider mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Valuation Multiples</h3>
          <table className="data-table w-full" role="table" aria-label="Valuation multiples">
            <thead><tr><th>Metric</th><th>Base</th><th>+2 SD</th></tr></thead>
            <tbody>
              <tr><td style={{ color: "var(--color-text-secondary)" }}>PE</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_pe_2sd ? `${s.base_pe_2sd.toFixed(1)}x` : "—"}</td></tr>
              <tr><td style={{ color: "var(--color-text-secondary)" }}>PB</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_pb ? `${s.base_pb.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_pb_2sd ? `${s.base_pb_2sd.toFixed(1)}x` : "—"}</td></tr>
              <tr><td style={{ color: "var(--color-text-secondary)" }}>EV/EBITDA</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_evebitda ? `${s.base_evebitda.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_evebitda_2sd ? `${s.base_evebitda_2sd.toFixed(1)}x` : "—"}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Position & Profit */}
        <div className="grid grid-cols-2 gap-4">
          <div className="metric-card animate-fade-in-up delay-3">
            <h3 className="font-bold uppercase tracking-wider mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Position Details</h3>
            <div className="space-y-2" style={{ fontSize: "var(--text-sm)" }}>
              {[
                ["Holding (Cash)", s.holding_cash_lakhs ? fmtLakhs(s.holding_cash_lakhs) : "—"],
                ["Holding %", s.holding_pct ? `${(s.holding_pct * 100).toFixed(2)}%` : "—"],
                ["Abs Leverage", String(s.abs_leverage ?? "—")],
                ["Leverage %", s.leverage_pct ? `${(s.leverage_pct * 100).toFixed(1)}%` : "—"],
                ["Conviction", String(s.conviction ?? "—")],
                ["Understanding", String(s.understanding ?? "—")],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
                  <span className="font-bold" style={{ fontFamily: "var(--font-mono)" }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="metric-card animate-fade-in-up delay-4">
            <h3 className="font-bold uppercase tracking-wider mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Expected Profit</h3>
            <div className="space-y-2" style={{ fontSize: "var(--text-sm)" }}>
              <div className="flex justify-between"><span style={{ color: "var(--color-text-muted)" }}>FY27 Expected Profit</span><span className="font-bold" style={{ fontFamily: "var(--font-mono)" }}>{s.exp_profit_fy27 ? `₹${s.exp_profit_fy27.toFixed(1)} Cr` : "—"}</span></div>
              <div className="flex justify-between"><span style={{ color: "var(--color-text-muted)" }}>FY28 Expected Profit</span><span className="font-bold" style={{ fontFamily: "var(--font-mono)" }}>{s.exp_profit_fy28 ? `₹${s.exp_profit_fy28.toFixed(1)} Cr` : "—"}</span></div>
              <div className="flex justify-between"><span style={{ color: "var(--color-text-muted)" }}>Remarks</span><span className="font-bold">{s.remarks || "—"}</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  //  MAIN DASHBOARD
  // ══════════════════════════════════════════════════════════
  return (
    <div className="max-w-[1600px] mx-auto px-5 py-4 dash-wrapper">

      {/* ── KPI SUMMARY BAR (ZONE A) ── */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {quotesLoading && Object.keys(quotes).length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : (
          <>
            <div className="kpi-card animate-fade-in-up delay-1" role="status" aria-label="Total equities tracked">
              <p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Universe</p>
              <p className="font-bold mt-1" style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
                <CountUp value={enrichedStocks.length} />
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{Object.keys(quotes).length} with live CMP</p>
            </div>
            <div className="kpi-card kpi-positive animate-fade-in-up delay-2" role="status" aria-label="Average base case upside">
              <p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Avg Base Upside</p>
              <p className="font-bold mt-1" style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-mono)", color: decisionData.avgBaseUpside >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}>
                <CountUp value={decisionData.avgBaseUpside} prefix={decisionData.avgBaseUpside >= 0 ? "+" : ""} suffix="%" decimals={1} />
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>across {decisionData.totalWithCmp} stocks</p>
            </div>
            <div className="kpi-card kpi-negative animate-fade-in-up delay-3 kpi-hide-sm" role="status" aria-label="Average bear case downside">
              <p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Avg Bear Downside</p>
              <p className="font-bold mt-1" style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-mono)", color: "var(--color-negative)" }}>
                <CountUp value={decisionData.avgBearDownside} suffix="%" decimals={1} />
              </p>
            </div>
            <div className="kpi-card kpi-warning animate-fade-in-up delay-4" role="status" aria-label="Stocks in buy zone">
              <p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Buy Zone</p>
              <p className="font-bold mt-1" style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-mono)", color: "var(--color-positive)" }}>
                <CountUp value={decisionData.buyZone.length} />
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>near bear price</p>
            </div>
            <div className="kpi-card kpi-accent animate-fade-in-up delay-5 kpi-hide-sm" role="status" aria-label="Holdings value">
              <p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Holdings Value</p>
              <p className="font-bold mt-1" style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
                {decisionData.totalHoldingsValue > 0 ? fmtLakhs(decisionData.totalHoldingsValue) : "—"}
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{enrichedStocks.filter(s => s.holding_cash_lakhs && s.holding_cash_lakhs > 0).length} held stocks</p>
            </div>
          </>
        )}
      </div>

      {/* ── TAB NAVIGATION ── */}
      <div className="flex items-center gap-1 mb-4 rounded-xl px-2 tab-bar" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
        <nav className="flex gap-1" role="tablist" aria-label="Dashboard sections">
          {([
            { key: "octopus" as const, label: "Octopus" },
            { key: "holdings" as const, label: "Holdings" },
            { key: "comparison" as const, label: "Comparison" },
            { key: "decisions" as const, label: "Decision Support" },
          ]).map(tab => (
            <button key={tab.key} onClick={() => handleTabSwitch(tab.key)} role="tab" aria-selected={activeTab === tab.key} aria-controls={`panel-${tab.key}`} tabIndex={activeTab === tab.key ? 0 : -1} className={`tab-btn ${activeTab === tab.key ? "tab-active" : ""}`}>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 pr-2 py-2 tab-controls">
          {dataLastRefreshed && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Data: {new Date(dataLastRefreshed).toLocaleTimeString("en-IN")}</span>}
          <button onClick={refreshData} disabled={dataRefreshing} className="btn btn-primary btn-sm" aria-label="Refresh stock data">
            {dataRefreshing ? "Refreshing..." : "Refresh Data"}
          </button>
          <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 4px" }} />
          {lastFetched && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>CMP: {new Date(lastFetched).toLocaleTimeString("en-IN")}</span>}
          {autoRefresh && marketOpen && <span className="font-mono font-bold min-w-[28px] text-center" style={{ fontSize: "var(--text-xs)", color: "var(--color-accent-blue)" }}>{countdown}s</span>}
          {autoRefresh && !marketOpen && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Mkt closed</span>}
          <button onClick={fetchQuotes} disabled={quotesLoading} className="btn btn-ghost btn-sm" aria-label="Refresh market prices">
            {quotesLoading ? "Fetching..." : "Refresh CMP"}
          </button>
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`btn btn-sm ${autoRefresh ? "btn-success" : "btn-ghost"}`} aria-label={`Auto refresh is ${autoRefresh ? "on" : "off"}`} aria-pressed={autoRefresh}>
            {autoRefresh ? "Auto: ON" : "Auto: OFF"}
          </button>
        </div>
      </div>

      {/* ═══════════════════ TAB 1: OCTOPUS ═══════════════════ */}
      {activeTab === "octopus" && (
        <div id="panel-octopus" role="tabpanel" aria-labelledby="tab-octopus" className="animate-fade-in">
          <div className="flex flex-wrap items-center gap-3 mb-3 filter-bar">
            <input type="text" placeholder="Search company, sector, VP..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-dark flex-1 min-w-[250px] max-w-md" aria-label="Search stocks" />
            <select value={filterSector} onChange={e => setFilterSector(e.target.value)} className="select-dark" aria-label="Filter by sector"><option value="all">All Sectors</option>{filterOptions.sectors.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <select value={filterVP} onChange={e => setFilterVP(e.target.value)} className="select-dark" aria-label="Filter by VA analyst"><option value="all">All VAs</option>{filterOptions.vps.map(v => <option key={v} value={v}>{v}</option>)}</select>
            <select value={filterConviction} onChange={e => setFilterConviction(e.target.value)} className="select-dark" aria-label="Filter by conviction level"><option value="all">All Conviction</option>{filterOptions.convictions.map(c => <option key={c} value={String(c)}>{c}</option>)}</select>
            {activeFilters > 0 && <button onClick={() => { setFilterSector("all"); setFilterVP("all"); setFilterConviction("all"); }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-accent-blue)" }}>Clear filters ({activeFilters})</button>}
            <span className="ml-auto filter-stats" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{sortedStocks.length} stocks · {Object.keys(quotes).length} live</span>
            <button onClick={exportCSV} className="btn btn-success btn-sm" aria-label="Export data as CSV">Export CSV</button>
          </div>

          <div className="rounded-xl overflow-auto table-scroll-container" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", maxHeight: "calc(100vh - 310px)" }}>
            <table className="data-table w-full" role="table" aria-label="Stock data table">
              <thead><tr>
                <Th col="companyShort" label="Company" /><Th col="sector" label="Sector" /><Th col="liveCmp" label="CMP" />
                <Th col="bear_current" label="Bear" /><Th col="base_current" label="Base" /><Th col="bull_current" label="Bull" />
                <Th col="upsideBearCalc" label="↑ Bear" /><Th col="upsideBaseCalc" label="↑ Base" /><Th col="upsideBullCalc" label="↑ Bull" />
                <Th col="upside_1y" label="1Y Upside" /><Th col="upside_2y" label="2Y Upside" />
                <Th col="base_pe" label="PE" /><Th col="base_pb" label="PB" /><Th col="base_evebitda" label="EV/EBITDA" />
                <Th col="conviction" label="Conv." /><Th col="vp" label="VA" /><Th col="sa" label="SA" />
              </tr></thead>
              <tbody>
                {quotesLoading && Object.keys(quotes).length === 0 ? (
                  Array.from({ length: 15 }).map((_, i) => <SkeletonRow key={i} />)
                ) : sortedStocks.map((s, i) => {
                  const isBuy = s.liveCmp && s.bear_current && s.liveCmp <= s.bear_current * 1.05;
                  const isSell = s.liveCmp && s.bull_current && s.liveCmp >= s.bull_current * 0.95;
                  return (
                    <tr key={`${s.tikr}-${i}`} className={`cursor-pointer ${isBuy ? "row-buy-zone" : isSell ? "row-sell-zone" : ""}`} onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)} role="row" aria-label={`${s.companyShort} - click for details`}>
                      <td className="font-semibold" style={{ whiteSpace: "normal", minWidth: 180, maxWidth: 220, color: "var(--color-text-primary)" }}>{s.companyShort}</td>
                      <td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{s.sector || "—"}</td>
                      <td className="font-semibold" style={{ fontFamily: "var(--font-mono)" }}>{s.liveCmp ? `₹${fmt(s.liveCmp, 1)}` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{s.bear_current ? `₹${fmt(s.bear_current, 0)}` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{s.base_current ? `₹${fmt(s.base_current, 0)}` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{s.bull_current ? `₹${fmt(s.bull_current, 0)}` : "—"}</td>
                      <td className={pctColor(s.upsideBearCalc)} style={{ fontFamily: "var(--font-mono)" }}>{s.upsideBearCalc != null ? fmtPct(s.upsideBearCalc) : "—"}</td>
                      <td className={pctColor(s.upsideBaseCalc)} style={{ fontFamily: "var(--font-mono)" }}>{s.upsideBaseCalc != null ? fmtPct(s.upsideBaseCalc) : "—"}</td>
                      <td className={pctColor(s.upsideBullCalc)} style={{ fontFamily: "var(--font-mono)" }}>{s.upsideBullCalc != null ? fmtPct(s.upsideBullCalc) : "—"}</td>
                      <td className={pctColor(s.upside_1y)} style={{ fontFamily: "var(--font-mono)" }}>{s.upside_1y != null ? fmtPct(s.upside_1y) : "—"}</td>
                      <td className={pctColor(s.upside_2y)} style={{ fontFamily: "var(--font-mono)" }}>{s.upside_2y != null ? fmtPct(s.upside_2y) : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{s.base_pb ? `${s.base_pb.toFixed(1)}x` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{s.base_evebitda ? `${s.base_evebitda.toFixed(1)}x` : "—"}</td>
                      <td className="text-center font-semibold">{s.conviction ?? "—"}</td>
                      <td className="text-center" style={{ color: "var(--color-text-secondary)" }}>{s.vp || "—"}</td>
                      <td className="text-center" style={{ color: "var(--color-text-secondary)" }}>{s.sa || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════ TAB 2: HOLDINGS ═══════════════════ */}
      {activeTab === "holdings" && (
        <div id="panel-holdings" role="tabpanel" aria-labelledby="tab-holdings" className="animate-fade-in">
          {!holdingsUnlocked ? (
            <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
              <div className="metric-card text-center max-w-sm w-full animate-fade-in-up">
                <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "var(--color-bg-hover)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-muted)" }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                </div>
                <h2 className="font-bold mb-2" style={{ fontSize: "var(--text-xl)", color: "var(--color-text-primary)" }}>Holdings Analysis</h2>
                <p className="mb-6" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Enter PIN to access portfolio holdings data</p>
                <input type="password" placeholder="Enter PIN" value={holdingsPin} onChange={e => setHoldingsPin(e.target.value)} onKeyDown={e => e.key === "Enter" && unlockHoldings()} className="input-dark w-full text-center text-lg tracking-widest mb-3" style={{ padding: "var(--space-3) var(--space-4)" }} aria-label="Holdings PIN" />
                {holdingsError && <p className="mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-negative)" }}>{holdingsError}</p>}
                <button onClick={unlockHoldings} disabled={holdingsLoading || !holdingsPin} className="btn btn-primary w-full" style={{ padding: "var(--space-3)" }}>{holdingsLoading ? "Verifying..." : "Unlock"}</button>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in">
              <div className="grid grid-cols-5 gap-4 mb-4">
                {(() => {
                  const ti = enrichedHoldings.reduce((s, h) => s + h.amt_invested, 0);
                  const tv = enrichedHoldings.reduce((s, h) => s + h.liveValue, 0);
                  const tg = tv - ti; const tp = ti > 0 ? (tg / ti) * 100 : 0;
                  const bv = enrichedHoldings.reduce((s, h) => s + (h.stockData?.bear_current || h.livePrice) * h.quantity, 0);
                  const buv = enrichedHoldings.reduce((s, h) => s + (h.stockData?.bull_current || h.livePrice) * h.quantity, 0);
                  return (<>
                    <div className="kpi-card animate-fade-in-up delay-1"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Total Invested</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{fmtCr(ti)}</p></div>
                    <div className="kpi-card kpi-positive animate-fade-in-up delay-2"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Current Value</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{fmtCr(tv)}</p></div>
                    <div className={`kpi-card ${tg >= 0 ? "kpi-positive" : "kpi-negative"} animate-fade-in-up delay-3`}><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Unrealized P&L</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: tg >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}>{tg >= 0 ? "+" : ""}{fmtCr(tg)} ({tp.toFixed(1)}%)</p></div>
                    <div className="kpi-card kpi-negative animate-fade-in-up delay-4"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Bear Scenario</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-negative)" }}>{fmtCr(bv)}</p><p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Drawdown: {tv ? ((bv - tv) / tv * 100).toFixed(1) : 0}%</p></div>
                    <div className="kpi-card kpi-positive animate-fade-in-up delay-5"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Bull Scenario</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-positive)" }}>{fmtCr(buv)}</p><p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Upside: +{tv ? ((buv - tv) / tv * 100).toFixed(1) : 0}%</p></div>
                  </>);
                })()}
              </div>
              <div className="rounded-xl overflow-auto table-scroll-container" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", maxHeight: "calc(100vh - 340px)" }}>
                <table className="data-table w-full" role="table" aria-label="Holdings data">
                  <thead><tr><th>Stock</th><th>Qty</th><th>Avg Cost</th><th>CMP</th><th>Invested</th><th>Value</th><th>P&L</th><th>P&L %</th><th>Bear</th><th>Base</th><th>Bull</th><th>↑ Bear</th><th>↑ Base</th><th>↑ Bull</th></tr></thead>
                  <tbody>
                    {enrichedHoldings.sort((a, b) => b.liveValue - a.liveValue).map((h, i) => (
                      <tr key={i}>
                        <td className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{h.asset_name}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{fmt(h.quantity)}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(h.avg_price, 1)}</td>
                        <td className="font-semibold" style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(h.livePrice, 1)}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{fmtCr(h.amt_invested)}</td>
                        <td className="font-semibold" style={{ fontFamily: "var(--font-mono)" }}>{fmtCr(h.liveValue)}</td>
                        <td className={h.liveGain >= 0 ? "cell-green" : "cell-red"} style={{ fontFamily: "var(--font-mono)" }}>{h.liveGain >= 0 ? "+" : ""}{fmtCr(h.liveGain)}</td>
                        <td className={h.liveGainPct >= 0 ? "cell-green" : "cell-red"} style={{ fontFamily: "var(--font-mono)" }}>{h.liveGainPct >= 0 ? "+" : ""}{h.liveGainPct.toFixed(1)}%</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{h.stockData?.bear_current ? `₹${fmt(h.stockData.bear_current, 0)}` : "—"}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{h.stockData?.base_current ? `₹${fmt(h.stockData.base_current, 0)}` : "—"}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{h.stockData?.bull_current ? `₹${fmt(h.stockData.bull_current, 0)}` : "—"}</td>
                        <td className={pctColor(h.upsideToBear != null ? h.upsideToBear / 100 : null)} style={{ fontFamily: "var(--font-mono)" }}>{h.upsideToBear != null ? `${h.upsideToBear >= 0 ? "+" : ""}${h.upsideToBear.toFixed(1)}%` : "—"}</td>
                        <td className={pctColor(h.upsideToBase != null ? h.upsideToBase / 100 : null)} style={{ fontFamily: "var(--font-mono)" }}>{h.upsideToBase != null ? `${h.upsideToBase >= 0 ? "+" : ""}${h.upsideToBase.toFixed(1)}%` : "—"}</td>
                        <td className={pctColor(h.upsideToBull != null ? h.upsideToBull / 100 : null)} style={{ fontFamily: "var(--font-mono)" }}>{h.upsideToBull != null ? `${h.upsideToBull >= 0 ? "+" : ""}${h.upsideToBull.toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB 3: COMPARISON ═══════════════════ */}
      {activeTab === "comparison" && (
        <div id="panel-comparison" role="tabpanel" aria-labelledby="tab-comparison" className="animate-fade-in">
          <div className="metric-card mb-4">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <input type="text" placeholder="Search stocks..." value={compareSearch} onChange={e => setCompareSearch(e.target.value)} disabled={selectedCompare.length >= 4} className="input-dark flex-1 max-w-sm" aria-label="Search stocks to compare" />
              <select value={compareSectorFilter} onChange={e => setCompareSectorFilter(e.target.value)} className="select-dark" aria-label="Filter comparison by sector">
                <option value="all">All Sectors</option>
                {filterOptions.sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedCompare.map(tikr => {
                  const s = enrichedStocks.find(st => st.tikr === tikr);
                  return <span key={tikr} className="inline-flex items-center gap-1 px-3 py-1 rounded-full font-medium" style={{ fontSize: "var(--text-sm)", background: "var(--color-info-bg)", color: "var(--color-accent-blue)", border: "1px solid rgba(79,142,247,0.25)" }}>{s?.companyShort || tikr}<button onClick={() => setSelectedCompare(selectedCompare.filter(t => t !== tikr))} style={{ color: "var(--color-accent-blue)", marginLeft: 4 }} aria-label={`Remove ${s?.companyShort || tikr} from comparison`}>&times;</button></span>;
                })}
                {selectedCompare.length > 0 && <button onClick={() => setSelectedCompare([])} className="btn btn-ghost btn-sm">Clear all</button>}
              </div>
            </div>
            {selectedCompare.length < 4 && (
              <div className="grid grid-cols-6 gap-2 max-h-[200px] overflow-y-auto compare-grid">
                {compareFilteredStocks.slice(0, 30).map(s => (
                  <button key={s.tikr} onClick={() => setSelectedCompare([...selectedCompare, s.tikr])} className="text-left p-2 rounded-lg transition-all" style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-primary)", fontSize: "var(--text-xs)" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-accent-blue)"; e.currentTarget.style.background = "var(--color-info-bg)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-bg-primary)"; }} aria-label={`Add ${s.companyShort} to comparison`}>
                    <div className="font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{s.companyShort}</div>
                    <div className="truncate" style={{ color: "var(--color-text-muted)" }}>{s.sector}</div>
                    {s.liveCmp && <div style={{ fontFamily: "var(--font-mono)", marginTop: 2 }}>₹{fmt(s.liveCmp, 0)}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {comparedStocks.length > 0 && (
            <div className="space-y-4">
              {[
                { title: "Price & Valuation", rows: [
                  { label: "Sector", render: (s: EnrichedStock) => <span className="pill pill-blue">{s.sector || "—"}</span> },
                  { label: "CMP", render: (s: EnrichedStock) => <span className="font-semibold" style={{ fontFamily: "var(--font-mono)" }}>{s.liveCmp ? `₹${fmt(s.liveCmp, 1)}` : "—"}</span> },
                  { label: "Bear", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)" }}>{s.bear_current ? `₹${fmt(s.bear_current, 0)}` : "—"}</span> },
                  { label: "Base", render: (s: EnrichedStock) => <span className="font-semibold" style={{ fontFamily: "var(--font-mono)" }}>{s.base_current ? `₹${fmt(s.base_current, 0)}` : "—"}</span> },
                  { label: "Bull", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)" }}>{s.bull_current ? `₹${fmt(s.bull_current, 0)}` : "—"}</span> },
                  { label: "1Y Target", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)" }}>{s.target_1y ? `₹${fmt(s.target_1y, 0)}` : "—"}</span> },
                  { label: "2Y Target", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)" }}>{s.target_2y ? `₹${fmt(s.target_2y, 0)}` : "—"}</span> },
                ]},
                { title: "Upside Analysis", rows: [
                  { label: "↑ Bear", render: (s: EnrichedStock) => <span className={pctColor(s.upsideBearCalc)} style={{ fontFamily: "var(--font-mono)" }}>{s.upsideBearCalc != null ? fmtPct(s.upsideBearCalc) : "—"}</span> },
                  { label: "↑ Base", render: (s: EnrichedStock) => <span className={pctColor(s.upsideBaseCalc)} style={{ fontFamily: "var(--font-mono)" }}>{s.upsideBaseCalc != null ? fmtPct(s.upsideBaseCalc) : "—"}</span> },
                  { label: "↑ Bull", render: (s: EnrichedStock) => <span className={pctColor(s.upsideBullCalc)} style={{ fontFamily: "var(--font-mono)" }}>{s.upsideBullCalc != null ? fmtPct(s.upsideBullCalc) : "—"}</span> },
                  { label: "1Y Upside", render: (s: EnrichedStock) => <span className={pctColor(s.upside_1y)} style={{ fontFamily: "var(--font-mono)" }}>{s.upside_1y != null ? fmtPct(s.upside_1y) : "—"}</span> },
                  { label: "2Y Upside", render: (s: EnrichedStock) => <span className={pctColor(s.upside_2y)} style={{ fontFamily: "var(--font-mono)" }}>{s.upside_2y != null ? fmtPct(s.upside_2y) : "—"}</span> },
                ]},
                { title: "Fundamentals", rows: [
                  { label: "PE", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)" }}>{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</span> },
                  { label: "PE +2SD", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)" }}>{s.base_pe_2sd ? `${s.base_pe_2sd.toFixed(1)}x` : "—"}</span> },
                  { label: "PB", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)" }}>{s.base_pb ? `${s.base_pb.toFixed(1)}x` : "—"}</span> },
                  { label: "EV/EBITDA", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)" }}>{s.base_evebitda ? `${s.base_evebitda.toFixed(1)}x` : "—"}</span> },
                  { label: "Conviction", render: (s: EnrichedStock) => <span className="font-semibold">{s.conviction ?? "—"}</span> },
                  { label: "Score", render: (s: EnrichedStock) => <span className="font-semibold" style={{ fontFamily: "var(--font-mono)" }}>{s.score ?? "—"}</span> },
                  { label: "VA / SA", render: (s: EnrichedStock) => <span style={{ color: "var(--color-text-secondary)" }}>{s.vp || "—"} / {s.sa || "—"}</span> },
                ]},
              ].map((section, si) => (
                <div key={section.title} className={`metric-card animate-fade-in-up delay-${si + 1}`}>
                  <h3 className="font-bold mb-3 uppercase tracking-wide" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{section.title}</h3>
                  <table className="data-table w-full" role="table"><thead><tr><th>Metric</th>{comparedStocks.map(s => <th key={s.tikr}>{s.companyShort}</th>)}</tr></thead>
                    <tbody>{section.rows.map(row => (
                      <tr key={row.label}><td style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>{row.label}</td>{comparedStocks.map(s => <td key={s.tikr}>{row.render(s)}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
          {comparedStocks.length === 0 && selectedCompare.length === 0 && !compareSearch && compareSectorFilter === "all" && (
            <div className="text-center py-12" style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3" style={{ color: "var(--color-border)" }}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
              Select stocks from the grid above to begin comparing.
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB 4: DECISION SUPPORT ═══════════════════ */}
      {activeTab === "decisions" && (
        <div id="panel-decisions" role="tabpanel" aria-labelledby="tab-decisions" className="space-y-4 animate-fade-in">

          {/* Buy & Sell Zones */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card animate-fade-in-up delay-1" style={{ borderTop: "3px solid var(--color-positive)" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Buy Zone — CMP Near Bear <span className="pill pill-green ml-2">{decisionData.buyZone.length}</span></h3>
              {decisionData.buyZone.length === 0 ? <p className="py-4" style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>None currently</p> : (
                <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>Company</th><th>CMP</th><th>Bear</th><th>Upside to Base</th></tr></thead>
                  <tbody>{decisionData.buyZone.map((s, i) => (<tr key={i} className="row-buy-zone cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.bear_current, 0)}</td><td><UpsideBar value={(s.upsideBaseCalc || 0) * 100} /></td></tr>))}</tbody></table></div>
              )}
            </div>
            <div className="metric-card animate-fade-in-up delay-2" style={{ borderTop: "3px solid var(--color-negative)" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Take Profit — CMP Near Bull <span className="pill pill-red ml-2">{decisionData.sellZone.length}</span></h3>
              {decisionData.sellZone.length === 0 ? <p className="py-4" style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>None currently</p> : (
                <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>Company</th><th>CMP</th><th>Bull</th><th>Upside to Bull</th></tr></thead>
                  <tbody>{decisionData.sellZone.map((s, i) => (<tr key={i} className="row-sell-zone cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.bull_current, 0)}</td><td><UpsideBar value={(s.upsideBullCalc || 0) * 100} /></td></tr>))}</tbody></table></div>
              )}
            </div>
          </div>

          {/* Upside & Downside */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card animate-fade-in-up delay-3" style={{ borderTop: "3px solid var(--color-accent-blue)" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Top 10 — Highest Upside to Base</h3>
              <div className="overflow-auto max-h-[340px]"><table className="data-table w-full"><thead><tr><th>#</th><th>Company</th><th>Sector</th><th>CMP</th><th>Base</th><th>Upside</th></tr></thead>
                <tbody>{decisionData.bestUpside.map((s, i) => (<tr key={i} className="cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>{i + 1}</td><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{s.sector}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.base_current, 0)}</td><td><UpsideBar value={(s.upsideBaseCalc || 0) * 100} /></td></tr>))}</tbody></table></div>
            </div>
            <div className="metric-card animate-fade-in-up delay-4" style={{ borderTop: "3px solid var(--color-warning)" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Top 10 — Largest Downside to Bear</h3>
              <div className="overflow-auto max-h-[340px]"><table className="data-table w-full"><thead><tr><th>#</th><th>Company</th><th>Sector</th><th>CMP</th><th>Bear</th><th>Downside</th></tr></thead>
                <tbody>{decisionData.worstDownside.map((s, i) => (<tr key={i} className="cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>{i + 1}</td><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{s.sector}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.bear_current, 0)}</td><td><UpsideBar value={(s.upsideBearCalc || 0) * 100} /></td></tr>))}</tbody></table></div>
            </div>
          </div>

          {/* VA & SA Analysis */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card animate-fade-in-up delay-5" style={{ borderTop: "3px solid #8B5CF6" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>VA (Analyst) Coverage & Holdings</h3>
              <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>VA</th><th>Stocks</th><th>Holdings</th><th>Count</th><th>Avg Upside</th></tr></thead>
                <tbody>{Object.entries(decisionData.vpStats).sort((a, b) => b[1].holdingsValue - a[1].holdingsValue).map(([vp, d]) => (
                  <tr key={vp}><td className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>{vp}</td><td className="text-center"><span className="pill pill-blue">{d.count}</span></td><td style={{ fontFamily: "var(--font-mono)" }}>{d.holdingsValue > 0 ? fmtLakhs(d.holdingsValue) : "—"}</td><td className="text-center">{d.holdingsStocks > 0 ? d.holdingsStocks : "—"}</td><td><UpsideBar value={d.avgUpside} /></td></tr>
                ))}</tbody></table></div>
            </div>
            <div className="metric-card animate-fade-in-up delay-5" style={{ borderTop: "3px solid #14B8A6" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>SA (Analyst) Coverage & Holdings</h3>
              <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>SA</th><th>Stocks</th><th>Holdings</th><th>Count</th><th>Avg Upside</th></tr></thead>
                <tbody>{Object.entries(decisionData.saStats).sort((a, b) => b[1].holdingsValue - a[1].holdingsValue).map(([sa, d]) => (
                  <tr key={sa}><td className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>{sa}</td><td className="text-center"><span className="pill pill-blue">{d.count}</span></td><td style={{ fontFamily: "var(--font-mono)" }}>{d.holdingsValue > 0 ? fmtLakhs(d.holdingsValue) : "—"}</td><td className="text-center">{d.holdingsStocks > 0 ? d.holdingsStocks : "—"}</td><td><UpsideBar value={d.avgUpside} /></td></tr>
                ))}</tbody></table></div>
            </div>
          </div>

          {/* Sector Allocation & High Conviction */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid var(--color-accent-blue)" }}>
              <h3 className="font-bold mb-4" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Sector Allocation & Avg Upside</h3>
              <SectorBar sectors={decisionData.sectors} />
            </div>
            <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid #8B5CF6" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>High Conviction (4+) <span className="pill pill-purple ml-2">{decisionData.highConviction.length}</span></h3>
              {decisionData.highConviction.length === 0 ? <p className="py-4" style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>None</p> : (
                <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><th>Company</th><th>Conv.</th><th>Sector</th><th>CMP</th><th>Upside Base</th></tr></thead>
                  <tbody>{decisionData.highConviction.map((s, i) => (
                    <tr key={i} className="cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td className="text-center font-bold" style={{ color: "#A78BFA" }}>{s.conviction}</td><td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{s.sector}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td><UpsideBar value={(s.upsideBaseCalc || 0) * 100} /></td></tr>
                  ))}</tbody></table></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
