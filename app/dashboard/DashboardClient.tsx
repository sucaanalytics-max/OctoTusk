"use client";

import { useState, useEffect, useMemo, useCallback, useRef, useId, Fragment } from "react";
import dynamic from "next/dynamic";

const TechnicalChartDynamic = dynamic(() => import("./TechnicalChart"), { ssr: false, loading: () => <div className="skeleton" style={{ width: "100%", height: 280 }} /> });

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
  bear_pe?: number;
  base_pe?: number;
  bull_pe?: number;
  base_pe_2sd?: number;
  bear_pb?: number;
  base_pb?: number;
  bull_pb?: number;
  base_pb_2sd?: number;
  bear_evebitda?: number;
  base_evebitda?: number;
  bull_evebitda?: number;
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
  // Extended fields (Phase 1 enrichment)
  dayHigh?: number | null;
  dayLow?: number | null;
  open?: number | null;
  prevClose?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  marketCap?: number | null;
  trailingPE?: number | null;
  forwardPE?: number | null;
  priceToBook?: number | null;
  epsTrailingTwelveMonths?: number | null;
  bookValue?: number | null;
  fiftyDayAverage?: number | null;
  twoHundredDayAverage?: number | null;
  avgVolume3Month?: number | null;
  avgVolume10Day?: number | null;
  dividendRate?: number | null;
  dividendYield?: number | null;
}

interface EnrichmentData {
  tikr: string;
  fetchedAt: string;
  beta?: number | null;
  sharesOutstanding?: number | null;
  floatShares?: number | null;
  pegRatio?: number | null;
  enterpriseValue?: number | null;
  enterpriseToEbitda?: number | null;
  totalRevenue?: number | null;
  revenueGrowth?: number | null;
  grossMargins?: number | null;
  ebitdaMargins?: number | null;
  operatingMargins?: number | null;
  profitMargins?: number | null;
  operatingCashflow?: number | null;
  freeCashflow?: number | null;
  totalDebt?: number | null;
  totalCash?: number | null;
  debtToEquity?: number | null;
  returnOnEquity?: number | null;
  returnOnAssets?: number | null;
  earningsGrowth?: number | null;
  currentRatio?: number | null;
  targetMeanPrice?: number | null;
  targetHighPrice?: number | null;
  targetLowPrice?: number | null;
  numberOfAnalystOpinions?: number | null;
  recommendationKey?: string | null;
  recommendationMean?: number | null;
  strongBuy?: number | null;
  buy?: number | null;
  hold?: number | null;
  sell?: number | null;
  strongSell?: number | null;
  earningsDate?: string | null;
  dividendDate?: string | null;
  exDividendDate?: string | null;
  nextQtrEpsEstimate?: number | null;
}

interface ChartPoint {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface EnrichedStock extends Stock {
  liveCmp?: number;
  liveChange?: number;
  liveChangePct?: number;
  liveVolume?: number;
  upsideBearCalc?: number;
  upsideBaseCalc?: number;
  upsideBullCalc?: number;
  upside1YCalc?: number;
  upside2YCalc?: number;
  displayTikr: string;
  companyShort: string;
  // Tier 1A: Composite Decision Score (0-100)
  cds?: number;
  cdsBreakdown?: { val: number; tech: number; qual: number; pos: number };
  // Tier 1B: Derived fields from unused data
  forwardPE_fy27?: number;
  forwardPE_fy28?: number;
  qualityScore?: number; // (conviction + understanding) / 2
  // Tier 1C: Analyst divergence (lazy — only when enrichment loaded)
  streetDivergence?: number;
}

interface Props {
  stocks: Stock[];
  tickerMap: Record<string, string>;
  metadata: Record<string, unknown>;
}

const CMP_REFRESH_INTERVAL = 60;

// ── Countdown Timer (isolates 1Hz re-renders from parent) ──
const CountdownTimer = ({ active, onTick }: { active: boolean; onTick: () => void }) => {
  const [countdown, setCountdown] = useState(CMP_REFRESH_INTERVAL);
  const [mktOpen, setMktOpen] = useState(isMarketOpen());
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setMktOpen(isMarketOpen());
      setCountdown(p => {
        if (p <= 1) { if (isMarketOpen()) onTickRef.current(); return CMP_REFRESH_INTERVAL; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;
  if (!mktOpen) return <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Mkt closed</span>;
  return <span className="font-mono font-bold min-w-[28px] text-center" style={{ fontSize: "var(--text-xs)", color: "var(--color-accent-blue)" }}>{countdown}s</span>;
};

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
  const p = n * 100;
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

const fmtRupee = (n: number | undefined | null): string => {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${(n / 10000000).toFixed(1)} Cr`;
  if (abs >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
};

const pctColor = (n: number | undefined | null): string => {
  if (n == null) return "";
  const v = n * 100;
  if (v > 5) return "cell-green";
  if (v < -5) return "cell-red";
  return "cell-amber";
};

/** Conditional formatting: returns inline style with graduated bg + text color based on upside % */
const pctBgStyle = (n: number | undefined | null): Record<string, string | number> => {
  if (n == null) return {};
  const v = n * 100; // always decimal → percentage
  // Graduated intensity: higher magnitude = stronger background
  const intensity = Math.min(Math.abs(v) / 50, 1); // max out at ±50%
  const alpha = 0.04 + intensity * 0.12; // range from 0.04 to 0.16
  if (v > 15) return { color: "var(--color-positive)", background: `rgba(5, 150, 105, ${alpha.toFixed(2)})`, fontWeight: 600 };
  if (v > 5) return { color: "var(--color-positive)", background: `rgba(5, 150, 105, ${(alpha * 0.6).toFixed(2)})` };
  if (v > 0) return { color: "var(--color-positive)" };
  if (v > -5) return { color: "var(--color-negative)" };
  if (v > -15) return { color: "var(--color-negative)", background: `rgba(220, 38, 38, ${(alpha * 0.6).toFixed(2)})` };
  return { color: "var(--color-negative)", background: `rgba(220, 38, 38, ${alpha.toFixed(2)})`, fontWeight: 600 };
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

// ── Treemap Heatmap Utilities ──
interface TreeRect { id: string; x: number; y: number; w: number; h: number; value: number }
interface TreeItem { id: string; value: number }

function squarify(items: TreeItem[], container: { x: number; y: number; w: number; h: number }): TreeRect[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const totalValue = sorted.reduce((s, i) => s + i.value, 0);
  if (totalValue <= 0) return [];
  const result: TreeRect[] = [];
  let cx = container.x, cy = container.y, cw = container.w, ch = container.h;
  let remaining = totalValue;

  const worstRatio = (row: TreeItem[], rowTotal: number, side: number, span: number): number => {
    let worst = 0;
    for (const it of row) {
      const d = (it.value / rowTotal) * side;
      if (d > 0 && span > 0) worst = Math.max(worst, Math.max(span / d, d / span));
      else worst = Infinity;
    }
    return worst;
  };

  const layoutRow = (row: TreeItem[], rowTotal: number) => {
    const isVert = cw >= ch;
    const span = remaining > 0 ? (rowTotal / remaining) * (isVert ? cw : ch) : 0;
    const side = isVert ? ch : cw;
    let off = 0;
    for (const item of row) {
      const frac = item.value / rowTotal;
      const d = frac * side;
      if (isVert) {
        result.push({ id: item.id, x: cx, y: cy + off, w: span, h: d, value: item.value });
        off += d;
      } else {
        result.push({ id: item.id, x: cx + off, y: cy, w: d, h: span, value: item.value });
        off += d;
      }
    }
    if (isVert) { cx += span; cw -= span; } else { cy += span; ch -= span; }
    remaining -= rowTotal;
  };

  let idx = 0;
  while (idx < sorted.length && cw > 0.1 && ch > 0.1) {
    const isVert = cw >= ch;
    const side = isVert ? ch : cw;
    let row: TreeItem[] = [];
    let rowTotal = 0;
    let bestWorst = Infinity;

    while (idx < sorted.length) {
      const c = sorted[idx];
      const nt = rowTotal + c.value;
      const span = remaining > 0 ? (nt / remaining) * (isVert ? cw : ch) : 0;
      if (span <= 0) { idx++; continue; }
      const w = worstRatio([...row, c], nt, side, span);
      if (row.length > 0 && w > bestWorst) break;
      row.push(c); rowTotal = nt; bestWorst = w; idx++;
    }
    if (row.length > 0) layoutRow(row, rowTotal);
  }
  return result;
}

function heatmapColor(value: number | null | undefined, mode: string): string {
  if (value == null || isNaN(value)) return "rgb(45, 48, 55)";
  if (mode === "conviction") {
    const v = Math.max(1, Math.min(5, value));
    const blues: Record<number, string> = { 5: "rgb(37, 99, 235)", 4: "rgb(59, 130, 246)", 3: "rgb(96, 165, 250)", 2: "rgb(71, 85, 105)", 1: "rgb(100, 116, 139)" };
    return blues[Math.round(v)] || "rgb(45, 48, 55)";
  }
  const range = (mode === "upsideBase" || mode === "upsideBear" || mode === "upsideBull") ? 30 : mode === "pnl" ? 30 : 3;
  const pct = (mode === "upsideBase" || mode === "upsideBear" || mode === "upsideBull" || mode === "pnl") ? value * 100 : value;
  const t = Math.max(-1, Math.min(1, pct / range));
  if (t >= 0) {
    const r = Math.round(45 + (20 - 45) * t);
    const g = Math.round(48 + (170 - 48) * t);
    const b = Math.round(55 + (70 - 55) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const at = -t;
    const r = Math.round(45 + (210 - 45) * at);
    const g = Math.round(48 + (35 - 48) * at);
    const b = Math.round(55 + (35 - 55) * at);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

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
const SKELETON_WIDTHS = [75, 60, 85, 70, 80, 65, 90, 55];
const SkeletonRow = () => (
  <tr>
    {SKELETON_WIDTHS.map((w, i) => (
      <td key={i}><div className="skeleton skeleton-text" style={{ width: `${w}%` }} /></td>
    ))}
  </tr>
);

const KpiSkeleton = () => (
  <div className="kpi-card animate-fade-in-up">
    <div className="skeleton" style={{ height: 12, width: "50%", marginBottom: 12 }} />
    <div className="skeleton" style={{ height: 28, width: "70%" }} />
  </div>
);

// ── Sparkline Component ──
const Sparkline = ({ data, width = 320, height = 80 }: { data: ChartPoint[]; width?: number; height?: number }) => {
  const gradientId = useId();
  if (!data.length) return null;
  const closes = data.map(d => d.close).filter((c): c is number => c != null);
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const pts = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * width;
    const y = height - 4 - ((c - min) / range) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const first = closes[0], last = closes[closes.length - 1];
  const up = last >= first;
  const stroke = up ? "var(--color-positive)" : "var(--color-negative)";
  const fillPts = `0,${height} ${pts.join(" ")} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.15" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#${gradientId})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={Number(pts[pts.length - 1].split(",")[1])} r="3" fill={stroke} />
    </svg>
  );
};

// TechnicalChart dynamically imported above (lightweight-charts ~200KB code-split)

// ── Range Bar (52W or Day range) ──
const RangeBar = ({ low, high, current, label }: { low: number; high: number; current: number; label: string }) => {
  const range = high - low || 1;
  const pct = Math.max(0, Math.min(100, ((current - low) / range) * 100));
  return (
    <div>
      <div className="flex justify-between mb-1" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
        <span>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ position: "relative", height: 6, background: "var(--color-bg-hover)", borderRadius: 3 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: 6, width: `${pct}%`, background: pct > 70 ? "var(--color-positive)" : pct < 30 ? "var(--color-negative)" : "var(--color-warning)", borderRadius: 3, transition: "width 0.4s ease" }} />
        <div style={{ position: "absolute", left: `${pct}%`, top: -3, width: 12, height: 12, background: "var(--color-text-primary)", borderRadius: "50%", transform: "translateX(-50%)", border: "2px solid var(--color-bg-primary)" }} />
      </div>
      <div className="flex justify-between mt-1" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
        <span>₹{low.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
        <span>₹{high.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
      </div>
    </div>
  );
};

// ── Analyst Consensus Bar ──
const AnalystBar = ({ strongBuy, buy, hold, sell, strongSell }: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }) => {
  const total = strongBuy + buy + hold + sell + strongSell;
  if (!total) return <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>No analyst data</span>;
  const segments = [
    { value: strongBuy, color: "#059669", label: "Strong Buy" },
    { value: buy, color: "#34D399", label: "Buy" },
    { value: hold, color: "#FBBF24", label: "Hold" },
    { value: sell, color: "#F87171", label: "Sell" },
    { value: strongSell, color: "#DC2626", label: "Strong Sell" },
  ];
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 1 }}>
        {segments.filter(s => s.value > 0).map(s => (
          <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="flex justify-between mt-1" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
        {segments.filter(s => s.value > 0).map(s => <span key={s.label}>{s.label.split(" ").pop()} {s.value}</span>)}
      </div>
    </div>
  );
};

// ── Sortable table header (module-scope to avoid remount) ──
const Th = ({ col, label, sortCol, sortDir, onSort }: { col: string; label: string; sortCol: string; sortDir: "asc" | "desc"; onSort: (col: string) => void }) => (
  <th className={sortCol === col ? (sortDir === "asc" ? "sort-asc" : "sort-desc") : ""} onClick={() => onSort(col)} role="columnheader" aria-sort={sortCol === col ? (sortDir === "asc" ? "ascending" : "descending") : "none"} tabIndex={0} onKeyDown={e => e.key === "Enter" && onSort(col)}>{label}</th>
);

// ── Sector Allocation Bar (module-scope, manages its own expand state) ──
const SectorBar = <T extends { tikr: string; companyShort: string; liveCmp?: number; base_current?: number; upsideBaseCalc?: number; conviction?: number; sector?: string; subsector?: string; }>({ sectors, groupBy, sourceStocks, onSelectStock }: {
  sectors: Record<string, { count: number; avgUpsideBase: number; avgUpsideBear: number }>;
  groupBy: "sector" | "subsector";
  sourceStocks: T[];
  onSelectStock: (stock: T) => void;
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const sorted = Object.entries(sectors).sort((a, b) => b[1].count - a[1].count);
  const max = sorted.length > 0 ? sorted[0][1].count : 1;
  return (
    <div className="space-y-1">
      {sorted.map(([sec, d]) => {
        const isOpen = expanded[sec];
        const sectorStocks = sourceStocks.filter(s => {
          const val = groupBy === "subsector" ? (s.subsector && s.subsector !== "0" ? s.subsector : s.sector) || "Other" : s.sector || "Other";
          return val === sec;
        }).sort((a, b) => (b.upsideBaseCalc || 0) - (a.upsideBaseCalc || 0));
        return (
          <div key={sec}>
            <div className="flex items-center gap-3 cursor-pointer py-1 rounded-md transition-all" style={{ background: isOpen ? "var(--color-bg-hover)" : "transparent", paddingLeft: 4, paddingRight: 4 }} onClick={() => setExpanded(prev => ({ ...prev, [sec]: !prev[sec] }))}>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", width: 14, textAlign: "center" }}>{isOpen ? "▾" : "▸"}</span>
              <span className="min-w-[120px] text-right truncate sector-label" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{sec}</span>
              <div className="flex-1 relative" style={{ height: 22, background: "var(--color-bg-hover)", borderRadius: "var(--radius-sm)" }}>
                <div className="sector-bar" style={{ width: `${(d.count / max) * 100}%` }}>
                  {d.count}
                </div>
              </div>
              <span className="font-mono min-w-[55px] text-right" style={{ fontSize: "var(--text-xs)", color: d.avgUpsideBase >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}>
                {d.avgUpsideBase >= 0 ? "+" : ""}{d.avgUpsideBase.toFixed(1)}%
              </span>
            </div>
            {isOpen && (
              <div className="ml-8 mb-2 mt-1 rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border-subtle)" }}>
                <table className="data-table w-full"><thead><tr><th>Company</th><th>CMP</th><th>Base</th><th>↑ Base</th><th>Conv.</th></tr></thead>
                  <tbody>{sectorStocks.map(st => (
                    <tr key={st.tikr} className="cursor-pointer" onClick={() => onSelectStock(st)} tabIndex={0} onKeyDown={e => e.key === "Enter" && onSelectStock(st)}>
                      <td className="font-semibold" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-primary)" }}>{st.companyShort}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{st.liveCmp ? `₹${fmt(st.liveCmp, 0)}` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{st.base_current ? `₹${fmt(st.base_current, 0)}` : "—"}</td>
                      <td className={pctColor(st.upsideBaseCalc)} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{st.upsideBaseCalc != null ? fmtPct(st.upsideBaseCalc) : "—"}</td>
                      <td className="text-center" style={{ fontSize: "var(--text-xs)", color: "#A78BFA" }}>{st.conviction ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Permanently removed stocks (excluded from all tabs) ──
const REMOVED_STOCKS = [
  "aptus", "monarch network", "recltd", "rec ltd", "repco",
  "dam capital", "deepak fert", "disa india", "elecon",
  "emkay", "kpit", "mallcom", "patels airtemp", "rpsg",
  "somany", "sunteck", "arihant",
];

function isRemovedStock(s: { tikr: string; official_name?: string }): boolean {
  const t = s.tikr.toLowerCase();
  const o = (s.official_name || "").toLowerCase();
  return REMOVED_STOCKS.some(term => t.includes(term) || o.includes(term));
}

// ═══════════════════════════════ MAIN ═══════════════════════════════
export default function DashboardClient({ stocks, tickerMap, metadata }: Props) {
  const [activeTab, setActiveTab] = useState<"octopus" | "holdings" | "comparison" | "decisions">("octopus");
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [failedTikrs, setFailedTikrs] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortCol, setSortCol] = useState<string>("upside_1y");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterSector, setFilterSector] = useState<string>("all");
  const [filterVP, setFilterVP] = useState<string>("all");
  const [filterConviction, setFilterConviction] = useState<string>("all");
  const [filterHoldingsOnly, setFilterHoldingsOnly] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
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

  // Decision Support: configurable thresholds
  const [buyZoneLow, setBuyZoneLow] = useState(-10);
  const [buyZoneHigh, setBuyZoneHigh] = useState(200);
  const [sellZoneLow, setSellZoneLow] = useState(-5);
  const [sellZoneHigh, setSellZoneHigh] = useState(10);
  const [baseZoneLow, setBaseZoneLow] = useState(-10);
  const [baseZoneHigh, setBaseZoneHigh] = useState(10);
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);

  // Zone table sorting
  const [zoneSorts, setZoneSorts] = useState<Record<string, { col: string; dir: "asc" | "desc" }>>({});
  const toggleZoneSort = useCallback((zone: string, col: string) => {
    setZoneSorts(prev => {
      const cur = prev[zone];
      if (cur?.col === col) return { ...prev, [zone]: { col, dir: cur.dir === "asc" ? "desc" : "asc" } };
      return { ...prev, [zone]: { col, dir: "desc" } };
    });
  }, []);
  const sortZoneData = useCallback(<T extends Record<string, unknown>>(zone: string, data: T[]): T[] => {
    const s = zoneSorts[zone];
    if (!s) return data;
    return [...data].sort((a, b) => {
      const av = a[s.col], bv = b[s.col];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return s.dir === "asc" ? av - bv : bv - av;
      return s.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [zoneSorts]);

  // Zone alerts (stored, not auto-popup)
  const [zoneAlerts, setZoneAlerts] = useState<{ id: number; msg: string; type: "buy" | "sell" | "overvalued" | "exit"; ts: number }[]>([]);
  const [showZoneAlerts, setShowZoneAlerts] = useState(false);
  const [unseenAlertCount, setUnseenAlertCount] = useState(0);
  const previousZonesRef = useRef<Record<string, string[]>>({});
  const zonesInitialized = useRef(false);
  const alertIdRef = useRef(0);

  // Scatter chart
  const [scatterHover, setScatterHover] = useState<{ tikr: string; x: number; y: number } | null>(null);
  const [scatterSectorFilters, setScatterSectorFilters] = useState<Set<string>>(new Set());
  const [scatterConvictionFilters, setScatterConvictionFilters] = useState<Set<number>>(new Set());

  // Holdings table sort
  const [holdSortCol, setHoldSortCol] = useState<string>("value");
  const [holdSortDir, setHoldSortDir] = useState<"asc" | "desc">("desc");

  // Treemap heatmap
  const [hmColorMode, setHmColorMode] = useState<"dayChange" | "upsideBase" | "upsideBear" | "upsideBull" | "pnl" | "conviction">("dayChange");
  const [hmSizeMode, setHmSizeMode] = useState<"holding" | "equal" | "marketCap">("holding");
  const [hmGroupBy, setHmGroupBy] = useState<"sector" | "subsector" | "flat">("sector");
  const [hmScope, setHmScope] = useState<"portfolio" | "all">("all");
  const [dsScope, setDsScope] = useState<"all" | "holdings">("all");
  const [sectorGroupBy, setSectorGroupBy] = useState<"sector" | "subsector">("sector");
  const [hmHover, setHmHover] = useState<{ tikr: string; x: number; y: number } | null>(null);

  // VP/SA expandable rows
  const [expandedVP, setExpandedVP] = useState<string | null>(null);
  const [expandedSA, setExpandedSA] = useState<string | null>(null);

  // Enrichment & Chart (lazy-loaded per stock)
  const [enrichmentCache, setEnrichmentCache] = useState<Record<string, EnrichmentData>>({});
  const [enrichmentLoading, setEnrichmentLoading] = useState<Record<string, boolean>>({});
  const [chartCache, setChartCache] = useState<Record<string, ChartPoint[]>>({});
  const [chartLoading, setChartLoading] = useState<Record<string, boolean>>({});
  const [chartRange, setChartRange] = useState("1mo");

  // Tier 2B: What-If Scenario Simulator
  const [simCmpOverrides, setSimCmpOverrides] = useState<Record<string, number>>({});

  // Tier 3A: Decision Journal
  interface JournalEntry { id: number; tikr: string; event_type: string; zone_name: string | null; annotation: string | null; cmp_at_event: number | null; upside_bear: number | null; upside_base: number | null; upside_bull: number | null; cds_at_event: number | null; user_email: string | null; created_at: string; }
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalFilter, setJournalFilter] = useState<"all" | "transitions" | "annotations">("all");
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalAnnotation, setJournalAnnotation] = useState("");
  const [journalTikr, setJournalTikr] = useState("");
  const journalFetched = useRef(false);

  // Theme
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Watchlists & hidden stocks
  const [hiddenStocks, setHiddenStocks] = useState<Set<string>>(new Set());
  const [watchlists, setWatchlists] = useState<Record<string, string[]>>({});
  const [activeWatchlist, setActiveWatchlist] = useState<string>("all");
  const [showWatchlistModal, setShowWatchlistModal] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  // ── Snapshot: load last persisted sync on mount (survives page refresh) ──
  useEffect(() => {
    fetch("/api/snapshot")
      .then((r) => r.json())
      .then((data) => {
        if (data.stocks?.length > 0 && data.source === "supabase") {
          setLiveStocks(data.stocks as Stock[]);
          if (data.synced_at) setDataLastRefreshed(data.synced_at as string);
        }
      })
      .catch(() => {/* silent — falls back to prop data from database.json */});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme: apply class to html element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Safe JSON parse — prevents crashes from corrupted storage (M-5)
  const safeParse = (raw: string | null): unknown => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  // Persist watchlists & hidden stocks to sessionStorage (H-2: no persistent client-side storage)
  useEffect(() => {
    try {
      const saved = safeParse(sessionStorage.getItem("octotusk-watchlists"));
      if (saved && typeof saved === "object") setWatchlists(saved as Record<string, string[]>);
      const hidden = safeParse(sessionStorage.getItem("octotusk-hidden"));
      if (Array.isArray(hidden)) setHiddenStocks(new Set(hidden as string[]));
      const savedTheme = sessionStorage.getItem("octotusk-theme");
      if (savedTheme === "dark") setTheme("dark");
      const savedThresholds = safeParse(sessionStorage.getItem("octotusk-thresholds"));
      if (savedThresholds && typeof savedThresholds === "object") {
        const t = savedThresholds as Record<string, number>;
        if (t.buyZoneLow != null) setBuyZoneLow(t.buyZoneLow);
        if (t.buyZoneHigh != null) setBuyZoneHigh(t.buyZoneHigh);
        if (t.sellZoneLow != null) setSellZoneLow(t.sellZoneLow);
        if (t.sellZoneHigh != null) setSellZoneHigh(t.sellZoneHigh);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem("octotusk-watchlists", JSON.stringify(watchlists)); } catch { /* ignore */ }
  }, [watchlists]);

  useEffect(() => {
    try { sessionStorage.setItem("octotusk-hidden", JSON.stringify(Array.from(hiddenStocks))); } catch { /* ignore */ }
  }, [hiddenStocks]);

  useEffect(() => {
    try { sessionStorage.setItem("octotusk-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    try { sessionStorage.setItem("octotusk-thresholds", JSON.stringify({ buyZoneLow, buyZoneHigh, sellZoneLow, sellZoneHigh })); } catch { /* ignore */ }
  }, [buyZoneLow, buyZoneHigh, sellZoneLow, sellZoneHigh]);

  const toggleHideStock = (tikr: string) => {
    setHiddenStocks(prev => {
      const next = new Set(prev);
      if (next.has(tikr)) next.delete(tikr); else next.add(tikr);
      return next;
    });
  };

  const createWatchlist = (name: string) => {
    if (!name.trim() || watchlists[name.trim()]) return;
    setWatchlists(prev => ({ ...prev, [name.trim()]: [] }));
    setNewWatchlistName("");
    setShowWatchlistModal(false);
  };

  const deleteWatchlist = (name: string) => {
    setWatchlists(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (activeWatchlist === name) setActiveWatchlist("all");
  };

  const toggleStockInWatchlist = (wlName: string, tikr: string) => {
    setWatchlists(prev => {
      const list = prev[wlName] || [];
      const next = list.includes(tikr) ? list.filter(t => t !== tikr) : [...list, tikr];
      return { ...prev, [wlName]: next };
    });
  };

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
      if (data.quotes) {
        setQuotes(data.quotes);
        setLastFetched(data.fetchedAt);
      }
      if (data.failedTikrs?.length > 0) {
        setFailedTikrs(data.failedTikrs);
        console.warn(`[quotes] ${data.failedTikrs.length} tickers failed (using stale CMP): ${data.failedTikrs.join(", ")}`);
      } else {
        setFailedTikrs([]);
      }
    } catch (err) { console.error("Failed to fetch quotes:", err); }
    finally { setQuotesLoading(false); }
  }, []);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  // Countdown + auto-fetch delegated to <CountdownTimer /> to avoid 1Hz parent re-renders

  const [syncStatus, setSyncStatus] = useState("");
  const refreshData = useCallback(async () => {
    setDataRefreshing(true);
    setSyncStatus("Loading baseline...");
    // Capture holdings + ticker_map from baseline for snapshot persistence
    let snapshotHoldings: unknown[] = [];
    let snapshotTickerMap: Record<string, string> = {};
    try {
      // Step 1: Fetch JVB baseline + vF file list (fast)
      const baseRes = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "baseline" }),
      });
      const baseData = await baseRes.json();
      if (baseData.error) { alert("Sync failed: " + baseData.error); return; }

      snapshotHoldings = (baseData.holdings ?? []) as unknown[];
      snapshotTickerMap = (baseData.ticker_map ?? {}) as Record<string, string>;

      let currentStocks = baseData.stocks;
      setLiveStocks(currentStocks);
      setDataLastRefreshed(baseData.refreshedAt);

      const vfFiles = baseData.vfFiles || [];
      const totalFiles = vfFiles.length;
      if (totalFiles === 0) {
        // Persist even if no vF files (baseline-only snapshot)
        try {
          const snapRes = await fetch("/api/snapshot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stocks: currentStocks, holdings: snapshotHoldings, ticker_map: snapshotTickerMap }),
          });
          if (!snapRes.ok) console.error("[snapshot] Save failed:", snapRes.status, await snapRes.text().catch(() => ""));
          else console.log("[snapshot] Baseline snapshot saved to Supabase");
        } catch (e) { console.error("[snapshot] Save error:", e); }
        setSyncStatus("Done (no vF files found)");
        return;
      }

      // Step 2: Process vF files in batches of 15
      const BATCH = 15;
      let totalMatched = 0;
      const allFailures: string[] = [];
      for (let offset = 0; offset < totalFiles; offset += BATCH) {
        const batchNum = Math.floor(offset / BATCH) + 1;
        const totalBatches = Math.ceil(totalFiles / BATCH);
        setSyncStatus(`Syncing vF files... (${batchNum}/${totalBatches})`);

        const vfRes = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "vf",
            offset,
            batchSize: BATCH,
            vfFiles,
            baselineStocks: currentStocks,
          }),
        });
        const vfData = await vfRes.json();
        if (vfData.error) { console.error("vF batch error:", vfData.error); allFailures.push(vfData.error); continue; }
        if (vfData.stocks) {
          currentStocks = vfData.stocks;
          setLiveStocks(currentStocks);
        }
        totalMatched += vfData.matched || 0;
        if (vfData.failures?.length) allFailures.push(...vfData.failures);
        if (vfData.unmatchedVf?.length) console.warn("[sync] Unmatched vF:", vfData.unmatchedVf);
      }

      setDataLastRefreshed(new Date().toISOString());

      // Persist final merged snapshot to Supabase so it survives page refreshes
      try {
        const snapRes = await fetch("/api/snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stocks: currentStocks, holdings: snapshotHoldings, ticker_map: snapshotTickerMap }),
        });
        if (!snapRes.ok) console.error("[snapshot] Save failed:", snapRes.status, await snapRes.text().catch(() => ""));
        else console.log("[snapshot] Snapshot saved to Supabase");
      } catch (e) { console.error("[snapshot] Save error:", e); }

      setSyncStatus(`Done: ${totalMatched} stocks updated from ${totalFiles} vF files`);
      console.log(`[sync] Complete: ${totalMatched} matched, ${allFailures.length} failures`);
      if (allFailures.length > 0) console.warn("[sync] Failures:", allFailures);
    } catch (err) {
      console.error("Failed to sync data:", err);
      alert("Sync failed — check console for details.");
      setSyncStatus("Failed");
    }
    finally { setDataRefreshing(false); }
  }, []);

  const enrichmentCacheRef = useRef(enrichmentCache);
  enrichmentCacheRef.current = enrichmentCache;
  const enrichmentLoadingRef = useRef(enrichmentLoading);
  enrichmentLoadingRef.current = enrichmentLoading;

  const fetchEnrichment = useCallback(async (tikr: string) => {
    if (enrichmentCacheRef.current[tikr] || enrichmentLoadingRef.current[tikr]) return;
    setEnrichmentLoading(prev => ({ ...prev, [tikr]: true }));
    try {
      const res = await fetch(`/api/enrichment/${encodeURIComponent(tikr)}`);
      const data = await res.json();
      if (!data.error) setEnrichmentCache(prev => ({ ...prev, [tikr]: data }));
    } catch { /* silent */ }
    finally { setEnrichmentLoading(prev => ({ ...prev, [tikr]: false })); }
  }, []);

  // Tier 3B: Batch enrichment — fetch all tickers in batches of 30
  const [batchEnrichmentLoaded, setBatchEnrichmentLoaded] = useState(false);
  const fetchBatchEnrichment = useCallback(async () => {
    if (batchEnrichmentLoaded || liveStocks.length === 0) return;
    const uncached = liveStocks.map(s => s.tikr).filter(t => t && !enrichmentCache[t]);
    if (uncached.length === 0) { setBatchEnrichmentLoaded(true); return; }
    // Fetch in chunks of 30
    for (let i = 0; i < uncached.length; i += 30) {
      const chunk = uncached.slice(i, i + 30);
      try {
        const res = await fetch("/api/enrichment/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tikrs: chunk }),
        });
        const data = await res.json();
        if (data.enrichments) {
          setEnrichmentCache(prev => ({ ...prev, ...data.enrichments }));
        }
      } catch { /* silent — individual stock fallback still works */ }
    }
    setBatchEnrichmentLoaded(true);
  }, [batchEnrichmentLoaded, liveStocks, enrichmentCache]);

  // Auto-trigger batch enrichment after quotes load
  useEffect(() => {
    if (Object.keys(quotes).length > 0 && !batchEnrichmentLoaded) {
      fetchBatchEnrichment();
    }
  }, [quotes, batchEnrichmentLoaded, fetchBatchEnrichment]);

  // Tier 3A: Fetch journal entries
  const fetchJournal = useCallback(async (tikr?: string) => {
    setJournalLoading(true);
    try {
      const url = tikr ? `/api/journal?tikr=${encodeURIComponent(tikr)}&limit=200` : "/api/journal?limit=200";
      const res = await fetch(url);
      if (res.ok) { const data = await res.json(); setJournalEntries(data.entries || []); }
    } catch { /* silent */ }
    setJournalLoading(false);
  }, []);

  const postJournalEntry = useCallback(async (entry: { tikr: string; event_type: string; zone_name?: string; annotation?: string; cmp_at_event?: number; upside_bear?: number; upside_base?: number; upside_bull?: number; cds_at_event?: number }) => {
    try {
      await fetch("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
    } catch { /* silent */ }
  }, []);

  // Auto-fetch journal on decisions tab
  useEffect(() => {
    if (activeTab === "decisions" && !journalFetched.current) {
      journalFetched.current = true;
      fetchJournal();
    }
  }, [activeTab, fetchJournal]);

  const fetchChart = useCallback(async (tikr: string, range = "1mo") => {
    const key = `${tikr}_${range}`;
    if (chartCache[key] || chartLoading[key]) return;
    setChartLoading(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`/api/chart/${encodeURIComponent(tikr)}?range=${range}`);
      const data = await res.json();
      if (data.data) setChartCache(prev => ({ ...prev, [key]: data.data }));
    } catch { /* silent */ }
    finally { setChartLoading(prev => ({ ...prev, [key]: false })); }
  }, [chartCache, chartLoading]);

  // Trigger enrichment + chart fetch when detail panel opens
  useEffect(() => {
    if (detailStock?.tikr) {
      fetchEnrichment(detailStock.tikr);
      fetchChart(detailStock.tikr, "1mo");
      setChartRange("1mo");
    }
  }, [detailStock?.tikr]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch chart data when range changes
  useEffect(() => {
    if (detailStock?.tikr && chartRange) {
      fetchChart(detailStock.tikr, chartRange);
    }
  }, [chartRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch enrichment for comparison stocks
  useEffect(() => {
    selectedCompare.forEach(tikr => fetchEnrichment(tikr));
  }, [selectedCompare]); // eslint-disable-line react-hooks/exhaustive-deps

  const filterOptions = useMemo(() => {
    const sectors = Array.from(new Set(liveStocks.map(s => s.sector).filter(Boolean))).sort() as string[];
    const vps = Array.from(new Set(liveStocks.map(s => s.vp).filter(Boolean))).sort() as string[];
    const convictions = Array.from(new Set(liveStocks.map(s => s.conviction).filter(c => c != null))).sort((a, b) => (b as number) - (a as number)) as number[];
    return { sectors, vps, convictions };
  }, [liveStocks]);

  const enrichedStocks: EnrichedStock[] = useMemo(() => {
    return liveStocks.filter(s => !isRemovedStock(s)).map(s => {
      const q = s.tikr ? quotes[s.tikr] : undefined;
      const liveCmp = simCmpOverrides[s.tikr] || q?.price || s.cmp;
      let uB: number | undefined, uBa: number | undefined, uBu: number | undefined;
      if (liveCmp && s.bear_current) uB = (s.bear_current - liveCmp) / liveCmp;
      if (liveCmp && s.base_current) uBa = (s.base_current - liveCmp) / liveCmp;
      if (liveCmp && s.bull_current) uBu = (s.bull_current - liveCmp) / liveCmp;
      let u1Y: number | undefined, u2Y: number | undefined;
      if (liveCmp && s.target_1y) u1Y = (s.target_1y - liveCmp) / liveCmp;
      if (liveCmp && s.target_2y) u2Y = (s.target_2y - liveCmp) / liveCmp;
      // ── Tier 1A: Composite Decision Score (CDS) 0–100 ──
      // Valuation (40%): normalize upsideBaseCalc from [-50%, +50%] → [0, 40]
      const valScore = uBa != null ? Math.max(0, Math.min(40, (uBa + 0.5) * 40)) : 0;
      // Technical (25%): Golden=25, Above50=15, Above200only=8, Death=0, no data=12
      const cmpVal = liveCmp || 0;
      const techScore = (q?.fiftyDayAverage && q?.twoHundredDayAverage && cmpVal)
        ? (cmpVal > q.fiftyDayAverage && cmpVal > q.twoHundredDayAverage ? 25
          : cmpVal > q.fiftyDayAverage ? 15 : cmpVal > q.twoHundredDayAverage ? 8 : 0) : 12;
      // Quality (20%): conviction * 4 (conviction is 1-5)
      const qualScore = Math.min(20, (s.conviction || 0) * 4);
      // 52-Week Position (15%): closer to low = higher score
      const hi52 = q?.fiftyTwoWeekHigh, lo52 = q?.fiftyTwoWeekLow;
      const posScore = (hi52 && lo52 && hi52 > lo52 && cmpVal)
        ? (1 - Math.max(0, Math.min(1, (cmpVal - lo52) / (hi52 - lo52)))) * 15 : 7.5;
      const cds = Math.round(valScore + techScore + qualScore + posScore);
      const cdsBreakdown = { val: Math.round(valScore), tech: Math.round(techScore), qual: Math.round(qualScore), pos: Math.round(posScore) };

      // ── Tier 1B: Derived fields from unused data ──
      // Forward PE using exp_profit_fy27/28 and market cap
      const mktCap = q?.marketCap;
      const forwardPE_fy27 = (mktCap && s.exp_profit_fy27 && s.exp_profit_fy27 > 0)
        ? mktCap / (s.exp_profit_fy27 * 10000000) : undefined; // exp_profit in Cr, marketCap in absolute
      const forwardPE_fy28 = (mktCap && s.exp_profit_fy28 && s.exp_profit_fy28 > 0)
        ? mktCap / (s.exp_profit_fy28 * 10000000) : undefined;
      // Quality composite: average of conviction and understanding (both 1-5)
      const qualityScore = (s.conviction != null && s.understanding != null)
        ? (s.conviction + s.understanding) / 2 : undefined;

      return { ...s, liveCmp, liveChange: q?.change, liveChangePct: q?.changePct, liveVolume: q?.volume, upsideBearCalc: uB, upsideBaseCalc: uBa, upsideBullCalc: uBu, upside1YCalc: u1Y, upside2YCalc: u2Y, displayTikr: cleanTikr(s.tikr), companyShort: getCompanyShort(s), cds, cdsBreakdown, forwardPE_fy27, forwardPE_fy28, qualityScore };
    });
  }, [liveStocks, quotes, simCmpOverrides]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const holdingTikrs = useMemo(() => {
    const set = new Set<string>();
    enrichedStocks.forEach(s => {
      if (s.holding_cash_lakhs && s.holding_cash_lakhs > 0) set.add(s.tikr);
    });
    return set;
  }, [enrichedStocks]);

  const sortedStocks = useMemo(() => {
    const filtered = enrichedStocks.filter(s => {
      // Hidden stocks filter
      if (!showHidden && hiddenStocks.has(s.tikr)) return false;
      // Watchlist filter
      if (activeWatchlist !== "all" && activeWatchlist !== "hidden") {
        const wl = watchlists[activeWatchlist];
        if (!wl || !wl.includes(s.tikr)) return false;
      }
      if (activeWatchlist === "hidden") {
        if (!hiddenStocks.has(s.tikr)) return false;
      }
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        if (!(s.tikr?.toLowerCase().includes(t) || s.displayTikr?.toLowerCase().includes(t) || s.companyShort?.toLowerCase().includes(t) || s.sector?.toLowerCase().includes(t) || s.official_name?.toLowerCase().includes(t) || s.vp?.toLowerCase().includes(t) || s.sa?.toLowerCase().includes(t))) return false;
      }
      if (filterSector !== "all" && s.sector !== filterSector) return false;
      if (filterVP !== "all" && s.vp !== filterVP) return false;
      if (filterConviction !== "all" && (s.conviction == null || (s.conviction as number) < Number(filterConviction))) return false;
      if (filterHoldingsOnly && !holdingTikrs.has(s.tikr)) return false;
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
  }, [enrichedStocks, searchTerm, sortCol, sortDir, filterSector, filterVP, filterConviction, filterHoldingsOnly, holdingTikrs, hiddenStocks, showHidden, activeWatchlist, watchlists]);

  // Holdings — session + PIN gated
  const unlockHoldings = async () => {
    setHoldingsLoading(true); setHoldingsError("");
    try {
      const res = await fetch("/api/holdings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: holdingsPin }) });
      const data = await res.json();
      if (data.unlocked) { setHoldingsData(data.holdings); setHoldingsUnlocked(true); }
      else setHoldingsError(data.error || "Invalid PIN");
    } catch { setHoldingsError("Failed to verify"); }
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
      "Nippon India ETF Nifty PSU Bank BeES": "XBOM:590108",
      "National Stock Exchange of India": "National Stock Exchange (NSE)",
      "Can Fin Homes": "CANFINHOME", "Can Fin Homes Limited": "CANFINHOME",
      "HDFC Asset Management Company": "HDFCAMC", "HDFC Asset Management": "HDFCAMC", "HDFC AMC": "HDFCAMC",
      "Bank Of India": "BANKINDIA", "Bank of India": "BANKINDIA",
      "Bank Of Baroda": "BANKBARODA", "Bank of Baroda": "BANKBARODA",
      "Punjab National Bank": "PNB",
    };
    // Fuzzy fallback: match holdings asset_name against stock official_name (best-ratio wins)
    const fuzzyMatch = (name: string): { tikr: string; officialName: string; ratio: number } | null => {
      const nl = name.toLowerCase().replace(/\s+limited$/, "").replace(/\s+ltd$/, "").trim();
      let best: { tikr: string; officialName: string; ratio: number } | null = null;
      for (const s of enrichedStocks) {
        const ol = (s.official_name || "").toLowerCase().replace(/\s+limited$/, "").replace(/\s+ltd$/, "").trim();
        if (!ol) continue;
        if (ol === nl) return { tikr: s.tikr, officialName: s.official_name || "", ratio: 1 };
        if ((ol.includes(nl) || nl.includes(ol)) && Math.min(nl.length, ol.length) / Math.max(nl.length, ol.length) >= 0.5) {
          const ratio = Math.min(nl.length, ol.length) / Math.max(nl.length, ol.length);
          if (!best || ratio > best.ratio) best = { tikr: s.tikr, officialName: s.official_name || "", ratio };
        }
      }
      return best;
    };
    const fuzzyWarnings: { asset: string; tikr: string; officialName: string; ratio: string }[] = [];
    const unmatched: string[] = [];
    const items = holdingsData.map(h => {
      let tikr = nameToTikr[h.asset_name];
      if (!tikr) {
        const fm = fuzzyMatch(h.asset_name);
        if (fm) {
          tikr = fm.tikr;
          fuzzyWarnings.push({ asset: h.asset_name, tikr: fm.tikr, officialName: fm.officialName, ratio: (fm.ratio * 100).toFixed(0) + "%" });
        } else {
          unmatched.push(h.asset_name);
        }
      }
      const stockData = tikr ? enrichedStocks.find(s => s.tikr === tikr) : null;
      const livePrice = tikr && quotes[tikr] ? quotes[tikr].price : h.current_price;
      const liveChange = tikr && quotes[tikr] ? quotes[tikr].change || 0 : 0;
      const liveChangePct = tikr && quotes[tikr] ? quotes[tikr].changePct || 0 : 0;
      const liveValue = livePrice * h.quantity;
      const liveGain = liveValue - h.amt_invested;
      const liveGainPct = h.amt_invested > 0 ? (liveGain / h.amt_invested) * 100 : 0;
      const dayPnl = liveChange * h.quantity;
      const dayPnlPct = h.amt_invested > 0 ? (dayPnl / h.amt_invested) * 100 : 0;
      return { ...h, tikr, stockData, livePrice, liveChange, liveChangePct, liveValue, liveGain, liveGainPct, dayPnl, dayPnlPct,
        upsideToBear: stockData?.bear_current && livePrice ? ((stockData.bear_current - livePrice) / livePrice) * 100 : null,
        upsideToBase: stockData?.base_current && livePrice ? ((stockData.base_current - livePrice) / livePrice) * 100 : null,
        upsideToBull: stockData?.bull_current && livePrice ? ((stockData.bull_current - livePrice) / livePrice) * 100 : null,
      };
    });
    if (fuzzyWarnings.length > 0) {
      console.warn("[Holdings] Fuzzy-matched holdings (verify accuracy):");
      console.table(fuzzyWarnings);
    }
    if (unmatched.length > 0) {
      console.warn("[Holdings] Unmatched holdings (no stock data):", unmatched);
    }
    return items;
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

  // Decision data (uses configurable thresholds)

  const decisionData = useMemo(() => {
    const bLow = buyZoneLow / 100, bHigh = buyZoneHigh / 100;
    const sLow = sellZoneLow / 100, sHigh = sellZoneHigh / 100;
    const baseLow = baseZoneLow / 100, baseHigh = baseZoneHigh / 100;
    const sourceStocks = dsScope === "holdings" ? enrichedStocks.filter(s => holdingTikrs.has(s.tikr)) : enrichedStocks;
    const withCmp = sourceStocks.filter(s => s.liveCmp && s.bear_current && s.base_current && s.bull_current);
    const buyZone = withCmp.filter(s => s.upsideBearCalc != null && s.upsideBearCalc >= bLow && s.upsideBearCalc <= bHigh).sort((a, b) => (b.upsideBaseCalc || 0) - (a.upsideBaseCalc || 0));
    const sellZone = withCmp.filter(s => s.upsideBullCalc != null && s.upsideBullCalc >= sLow && s.upsideBullCalc <= sHigh).sort((a, b) => (a.upsideBullCalc || 0) - (b.upsideBullCalc || 0));
    const bestUpside = [...withCmp].filter(s => s.upsideBaseCalc != null && s.upsideBaseCalc > 0).sort((a, b) => (b.upsideBaseCalc || 0) - (a.upsideBaseCalc || 0)).slice(0, 10);
    const worstDownside = [...withCmp].filter(s => s.upsideBearCalc != null && s.upsideBearCalc < 0).sort((a, b) => (a.upsideBearCalc || 0) - (b.upsideBearCalc || 0)).slice(0, 10);
    const overvalued = withCmp.filter(s => s.upsideBullCalc != null && s.upsideBullCalc < sLow).sort((a, b) => (a.upsideBullCalc || 0) - (b.upsideBullCalc || 0));
    const cmpNearBase = withCmp.filter(s => s.upsideBaseCalc != null && s.upsideBaseCalc >= baseLow && s.upsideBaseCalc <= baseHigh).sort((a, b) => Math.abs(a.upsideBaseCalc || 0) - Math.abs(b.upsideBaseCalc || 0));

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
    sourceStocks.forEach(s => {
      const vp = s.vp || "Unassigned";
      if (!vpStats[vp]) vpStats[vp] = { count: 0, avgUpside: 0, holdingsValue: 0, holdingsStocks: 0 };
      vpStats[vp].count++;
      if (s.upsideBaseCalc != null) vpStats[vp].avgUpside += (s.upsideBaseCalc || 0) * 100;
      if (s.holding_cash_lakhs && s.holding_cash_lakhs > 0) { vpStats[vp].holdingsValue += s.holding_cash_lakhs; vpStats[vp].holdingsStocks++; }
    });
    Object.values(vpStats).forEach(v => { v.avgUpside = v.count > 0 ? v.avgUpside / v.count : 0; });

    const saStats: Record<string, { count: number; avgUpside: number; holdingsValue: number; holdingsStocks: number }> = {};
    sourceStocks.forEach(s => {
      const sa = s.sa || "Unassigned";
      if (!saStats[sa]) saStats[sa] = { count: 0, avgUpside: 0, holdingsValue: 0, holdingsStocks: 0 };
      saStats[sa].count++;
      if (s.upsideBaseCalc != null) saStats[sa].avgUpside += (s.upsideBaseCalc || 0) * 100;
      if (s.holding_cash_lakhs && s.holding_cash_lakhs > 0) { saStats[sa].holdingsValue += s.holding_cash_lakhs; saStats[sa].holdingsStocks++; }
    });
    Object.values(saStats).forEach(v => { v.avgUpside = v.count > 0 ? v.avgUpside / v.count : 0; });

    // KPI aggregates
    const totalHoldingsValue = sourceStocks.reduce((sum, s) => sum + (s.holding_cash_lakhs || 0), 0);
    const avgBaseUpside = withCmp.length > 0 ? withCmp.reduce((sum, s) => sum + (s.upsideBaseCalc || 0), 0) / withCmp.length * 100 : 0;
    const avgBearDownside = withCmp.length > 0 ? withCmp.reduce((sum, s) => sum + (s.upsideBearCalc || 0), 0) / withCmp.length * 100 : 0;

    return { buyZone, sellZone, bestUpside, worstDownside, overvalued, cmpNearBase, sectors, vpStats, saStats, totalWithCmp: withCmp.length, totalStocks: sourceStocks.length, totalHoldingsValue, avgBaseUpside, avgBearDownside };
  }, [enrichedStocks, buyZoneLow, buyZoneHigh, sellZoneLow, sellZoneHigh, baseZoneLow, baseZoneHigh, dsScope, holdingTikrs]);

  // Separate memo for sector grouping — avoids recomputing all decision data when toggling sector/subsector
  const sectorDisplayData = useMemo(() => {
    const sourceStocks = dsScope === "holdings" ? enrichedStocks.filter(s => holdingTikrs.has(s.tikr)) : enrichedStocks;
    const withCmp = sourceStocks.filter(s => s.liveCmp && s.bear_current && s.base_current && s.bull_current);
    const sectors: Record<string, { count: number; avgUpsideBase: number; avgUpsideBear: number }> = {};
    withCmp.forEach(s => {
      const sec = sectorGroupBy === "subsector" ? ((s.subsector && s.subsector !== "0" ? s.subsector : s.sector) || "Other") : (s.sector || "Other");
      if (!sectors[sec]) sectors[sec] = { count: 0, avgUpsideBase: 0, avgUpsideBear: 0 };
      sectors[sec].count++;
      sectors[sec].avgUpsideBase += (s.upsideBaseCalc || 0) * 100;
      sectors[sec].avgUpsideBear += (s.upsideBearCalc || 0) * 100;
    });
    Object.values(sectors).forEach(v => { v.avgUpsideBase /= v.count || 1; v.avgUpsideBear /= v.count || 1; });
    return sectors;
  }, [enrichedStocks, dsScope, holdingTikrs, sectorGroupBy]);

  // Helper: get zone badge for a stock
  const getStockZone = useCallback((tikr: string) => {
    if (!decisionData) return null;
    if (decisionData.buyZone.some(s => s.tikr === tikr)) return { label: "Buy", color: "var(--color-positive)" };
    if (decisionData.sellZone.some(s => s.tikr === tikr)) return { label: "Sell", color: "var(--color-warning)" };
    if (decisionData.overvalued.some(s => s.tikr === tikr)) return { label: "Overvalued", color: "var(--color-negative)" };
    return null;
  }, [decisionData]);

  // Treemap heatmap layout
  const heatmapLayout = useMemo(() => {
    const W = 1000, H = 560, PAD = 2, SPAD = 18;
    // Filter by scope
    let pool = enrichedStocks.filter(s => s.liveCmp);
    if (hmScope === "portfolio") pool = pool.filter(s => s.holding_cash_lakhs && s.holding_cash_lakhs > 0);
    if (!pool.length) return { rects: [] as (TreeRect & { tikr: string; sector: string; changePct: number; label: string; colorVal: number; sectorLabel: string })[], W, H };

    // Compute value per stock
    const getValue = (s: EnrichedStock): number => {
      if (hmSizeMode === "equal") return 1;
      if (hmSizeMode === "marketCap") return (quotes[s.tikr]?.marketCap || 0) / 10000000 || 1;
      return s.holding_cash_lakhs || 0.1;
    };
    // Compute color value per stock
    const getColorVal = (s: EnrichedStock): number => {
      if (hmColorMode === "dayChange") return s.liveChangePct || 0;
      if (hmColorMode === "upsideBase") return s.upsideBaseCalc || 0;
      if (hmColorMode === "upsideBear") return s.upsideBearCalc || 0;
      if (hmColorMode === "upsideBull") return s.upsideBullCalc || 0;
      if (hmColorMode === "conviction") return s.conviction || 1;
      return 0; // pnl handled below if holdings available
    };

    // Group stocks
    const groupKey = (s: EnrichedStock): string => {
      if (hmGroupBy === "flat") return "All";
      if (hmGroupBy === "subsector") return (s.subsector && s.subsector !== "0" ? s.subsector : s.sector) || "Other";
      return s.sector || "Other";
    };
    const groups: Record<string, EnrichedStock[]> = {};
    pool.forEach(s => { const k = groupKey(s); (groups[k] ||= []).push(s); });

    // Level 1: sector rects
    const sectorItems: TreeItem[] = Object.entries(groups).map(([sec, stocks]) => ({
      id: sec, value: stocks.reduce((sum, s) => sum + getValue(s), 0),
    })).sort((a, b) => b.value - a.value);

    const sectorRects = squarify(sectorItems, { x: 0, y: 0, w: W, h: H });

    // Level 2: stock rects within each sector
    const allRects: (TreeRect & { tikr: string; sector: string; changePct: number; label: string; colorVal: number; sectorLabel: string })[] = [];
    for (const sr of sectorRects) {
      const stocks = groups[sr.id] || [];
      const stockItems: TreeItem[] = stocks.map(s => ({ id: s.tikr, value: Math.max(getValue(s), 0.01) }));
      const topPad = hmGroupBy !== "flat" && sr.h > 30 ? SPAD : PAD;
      const inner = { x: sr.x + PAD, y: sr.y + topPad, w: Math.max(sr.w - PAD * 2, 1), h: Math.max(sr.h - topPad - PAD, 1) };
      const stockRects = squarify(stockItems, inner);
      for (const rect of stockRects) {
        const stock = stocks.find(s => s.tikr === rect.id);
        if (!stock) continue;
        allRects.push({
          ...rect, tikr: stock.tikr, sector: stock.sector || "Other",
          changePct: stock.liveChangePct || 0, label: stock.companyShort,
          colorVal: getColorVal(stock), sectorLabel: sr.id,
        });
      }
    }
    return { rects: allRects, W, H, sectorRects };
  }, [enrichedStocks, quotes, hmColorMode, hmSizeMode, hmGroupBy, hmScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zone transition alerts
  useEffect(() => {
    if (!decisionData) return;
    // Build current zone map
    const currentZones: Record<string, string[]> = {};
    decisionData.buyZone.forEach(s => { currentZones[s.tikr] = [...(currentZones[s.tikr] || []), "buy"]; });
    decisionData.sellZone.forEach(s => { currentZones[s.tikr] = [...(currentZones[s.tikr] || []), "sell"]; });
    decisionData.overvalued.forEach(s => { currentZones[s.tikr] = [...(currentZones[s.tikr] || []), "overvalued"]; });

    if (!zonesInitialized.current) {
      // First run: initialize without alerting
      previousZonesRef.current = currentZones;
      zonesInitialized.current = true;
      // Load saved zones from server
      fetch("/api/zones").then(r => r.ok ? r.json() : null).then(data => {
        if (data?.zones) {
          previousZonesRef.current = data.zones;
        }
      }).catch(() => {});
      return;
    }

    const prev = previousZonesRef.current;
    const newAlerts: typeof zoneAlerts = [];
    const allTikrs = new Set([...Object.keys(prev), ...Object.keys(currentZones)]);

    allTikrs.forEach(tikr => {
      const prevZ = prev[tikr] || [];
      const currZ = currentZones[tikr] || [];
      const stock = enrichedStocks.find(s => s.tikr === tikr);
      const name = stock?.companyShort || tikr;
      const cmpStr = stock?.liveCmp ? ` (CMP ₹${fmt(stock.liveCmp, 0)})` : "";

      // New entries
      currZ.forEach(z => {
        if (!prevZ.includes(z)) {
          const tid = ++alertIdRef.current;
          const label = z === "buy" ? "Buy Zone" : z === "sell" ? "Take Profit Zone" : "Overvalued";
          newAlerts.push({ id: tid, msg: `${name} entered ${label}${cmpStr}`, type: z as "buy" | "sell" | "overvalued", ts: Date.now() });
        }
      });
      // Exits
      prevZ.forEach(z => {
        if (!currZ.includes(z)) {
          const tid = ++alertIdRef.current;
          const label = z === "buy" ? "Buy Zone" : z === "sell" ? "Take Profit Zone" : "Overvalued";
          newAlerts.push({ id: tid, msg: `${name} exited ${label}${cmpStr}`, type: "exit", ts: Date.now() });
        }
      });
    });

    if (newAlerts.length > 0) {
      setZoneAlerts(prev => [...prev, ...newAlerts].slice(-50));
      setUnseenAlertCount(prev => prev + newAlerts.length);
      // Build transitions for journal logging
      const transitions = newAlerts.map(a => {
        const stock = enrichedStocks.find(s => a.msg.includes(s.companyShort || "___"));
        return { tikr: stock?.tikr || "", event_type: a.type === "exit" ? "zone_exit" : "zone_enter", zone_name: a.type === "exit" ? "" : a.type, cmp: stock?.liveCmp, upsideBear: stock?.upsideBearCalc ? Math.round(stock.upsideBearCalc * 10000) / 100 : undefined, upsideBase: stock?.upsideBaseCalc ? Math.round(stock.upsideBaseCalc * 10000) / 100 : undefined, upsideBull: stock?.upsideBullCalc ? Math.round(stock.upsideBullCalc * 10000) / 100 : undefined, cds: stock?.cds };
      }).filter(t => t.tikr);
      // Persist zones + log transitions to journal
      fetch("/api/zones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zones: currentZones, transitions }) }).catch(() => {});
    }
    previousZonesRef.current = currentZones;
  }, [decisionData, enrichedStocks]);

  // Clean up old alerts (keep last 24h)
  useEffect(() => {
    if (zoneAlerts.length === 0) return;
    const t = setTimeout(() => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      setZoneAlerts(prev => prev.filter(t => t.ts > cutoff));
    }, 1000);
    return () => clearTimeout(t);
  }, [zoneAlerts]);

  // Sector colors for scatter chart
  const sectorColors = useMemo(() => {
    const palette = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316", "#14B8A6", "#6366F1", "#84CC16", "#D946EF", "#0EA5E9", "#F43F5E", "#A3E635", "#FB923C", "#2DD4BF", "#818CF8", "#FBBF24", "#E879F9", "#22D3EE", "#FB7185", "#A78BFA", "#4ADE80", "#FACC15"];
    const sectors = Array.from(new Set(enrichedStocks.map(s => s.sector || "Other")));
    const map: Record<string, string> = {};
    sectors.forEach((s, i) => { map[s] = palette[i % palette.length]; });
    return map;
  }, [enrichedStocks]);

  // Th moved to module scope to avoid remount on every render

  const activeFilters = [filterSector, filterVP, filterConviction].filter(f => f !== "all").length + (filterHoldingsOnly ? 1 : 0);


  // ── Pill toggle style helper ──
  const pillStyle = (active: boolean) => ({
    background: active ? "var(--color-accent-blue)" : "var(--color-bg-hover)",
    color: active ? "#fff" : "var(--color-text-muted)",
    fontWeight: (active ? 600 : 400) as number,
  });

  // SectorBar moved to module scope to avoid remount on every render

  // ══════════════════════════════════════════════════════════
  //  STOCK DETAIL PANEL
  // ══════════════════════════════════════════════════════════
  if (detailStock) {
    const s = detailStock;
    const q = s.tikr ? quotes[s.tikr] : undefined;
    const enr = s.tikr ? enrichmentCache[s.tikr] : undefined;
    const enrLoading = s.tikr ? enrichmentLoading[s.tikr] : false;
    const chartData = s.tikr ? chartCache[`${s.tikr}_${chartRange}`] : undefined;
    const chartIsLoading = s.tikr ? chartLoading[`${s.tikr}_${chartRange}`] : false;
    const convLabel: Record<number, string> = { 5: "Very High", 4: "High", 3: "Medium", 2: "Low", 1: "Very Low" };

    const fmtCrore = (n: number | null | undefined): string => {
      if (n == null) return "—";
      const cr = n / 10000000;
      if (cr >= 1000) return `₹${(cr / 100).toFixed(1)}K Cr`;
      return `₹${cr.toFixed(1)} Cr`;
    };
    const fmtVol = (n: number | null | undefined): string => {
      if (n == null) return "—";
      if (n >= 10000000) return `${(n / 10000000).toFixed(1)} Cr`;
      if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
      if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
      return String(n);
    };
    const volRatio = q?.avgVolume3Month && q.volume ? (q.volume / q.avgVolume3Month) : null;

    return (
      <div className="max-w-[1400px] mx-auto px-3 md:px-5 py-3 md:py-5 dash-wrapper animate-fade-in">
        <button onClick={() => setDetailStock(null)} className="btn btn-ghost btn-sm mb-4" aria-label="Go back to previous view">
          <span aria-hidden="true">←</span> Back to {activeTab === "octopus" ? "Octopus" : activeTab === "comparison" ? "Comparison" : "Decision Support"}
        </button>

        {/* Header */}
        <div className="metric-card mb-4 animate-fade-in-up delay-1">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h2 className="font-bold" style={{ fontSize: "clamp(1rem, 4vw, var(--text-2xl))", color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>{s.companyShort}</h2>
                <span className="pill pill-blue">{s.sector}</span>
                {s.subsector && s.subsector !== s.sector && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{s.subsector}</span>}
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
              <div className="font-bold detail-header-price" style={{ fontSize: "clamp(1.25rem, 5vw, var(--text-3xl))", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>
                {s.liveCmp ? <>₹<CountUp value={s.liveCmp} decimals={2} /></> : "—"}
              </div>
              {s.liveChangePct != null && (
                <div className="font-bold" style={{ fontSize: "var(--text-sm)", color: s.liveChangePct >= 0 ? "var(--color-positive)" : "var(--color-negative)", fontFamily: "var(--font-mono)" }}>
                  {s.liveChange != null ? `${s.liveChange >= 0 ? "+" : ""}${s.liveChange.toFixed(2)}` : ""} ({s.liveChangePct >= 0 ? "+" : ""}{s.liveChangePct.toFixed(2)}%)
                </div>
              )}
              <div style={{ fontSize: "var(--text-xs)", color: simCmpOverrides[s.tikr] ? "#8B5CF6" : "var(--color-text-muted)", marginBottom: 8 }}>{simCmpOverrides[s.tikr] ? "Simulated Price" : "Current Market Price"}</div>
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

        {/* ── Technical Chart (Full Width) ── */}
        <div className="metric-card animate-fade-in-up delay-1 mb-4">
          <TechnicalChartDynamic
            data={chartData || []}
            height={280}
            onRangeChange={setChartRange}
            activeRange={chartRange}
            loading={chartIsLoading}
          />
        </div>

        {/* ── Market Data + Technical Metrics ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Left: Ranges & Market Data */}
          <div className="metric-card animate-fade-in-up delay-2">
            <h3 className="font-bold uppercase tracking-wider mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Market Data</h3>
            <div className="space-y-4">
              {q?.fiftyTwoWeekLow != null && q?.fiftyTwoWeekHigh != null && s.liveCmp && (
                <RangeBar low={q.fiftyTwoWeekLow} high={q.fiftyTwoWeekHigh} current={s.liveCmp} label="52-Week Range" />
              )}
              {q?.dayLow != null && q?.dayHigh != null && s.liveCmp && (
                <RangeBar low={q.dayLow} high={q.dayHigh} current={s.liveCmp} label="Today's Range" />
              )}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2" style={{ fontSize: "var(--text-sm)" }}>
                {[
                  ["Market Cap", q?.marketCap ? fmtCrore(q.marketCap) : "—"],
                  ["Open", q?.open ? `₹${fmt(q.open, 2)}` : "—"],
                  ["Prev Close", q?.prevClose ? `₹${fmt(q.prevClose, 2)}` : "—"],
                  ["Volume", fmtVol(q?.volume)],
                  ["Avg Vol (3M)", fmtVol(q?.avgVolume3Month)],
                  ["Vol Ratio", volRatio ? `${volRatio.toFixed(2)}x` : "—"],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between">
                    <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
                    <span className="font-bold" style={{ fontFamily: "var(--font-mono)", color: label === "Vol Ratio" && volRatio ? (volRatio > 1.5 ? "var(--color-positive)" : volRatio < 0.5 ? "var(--color-negative)" : "var(--color-text-primary)") : undefined }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Technical Metrics */}
          <div className="metric-card animate-fade-in-up delay-3">
            <h3 className="font-bold uppercase tracking-wider mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Technical Indicators</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2" style={{ fontSize: "var(--text-sm)" }}>
              {[
                ["50-Day MA", q?.fiftyDayAverage ? `₹${fmt(q.fiftyDayAverage, 1)}` : "—", q?.fiftyDayAverage && s.liveCmp ? (s.liveCmp > q.fiftyDayAverage ? "var(--color-positive)" : "var(--color-negative)") : undefined],
                ["200-Day MA", q?.twoHundredDayAverage ? `₹${fmt(q.twoHundredDayAverage, 1)}` : "—", q?.twoHundredDayAverage && s.liveCmp ? (s.liveCmp > q.twoHundredDayAverage ? "var(--color-positive)" : "var(--color-negative)") : undefined],
                ["Trailing PE", q?.trailingPE ? `${q.trailingPE.toFixed(1)}x` : "—"],
                ["Forward PE", q?.forwardPE ? `${q.forwardPE.toFixed(1)}x` : "—"],
                ["Price/Book", q?.priceToBook ? `${q.priceToBook.toFixed(2)}x` : "—"],
                ["EPS (TTM)", q?.epsTrailingTwelveMonths ? `₹${q.epsTrailingTwelveMonths.toFixed(2)}` : "—"],
                ["Div Yield", q?.dividendYield ? `${(q.dividendYield * 100).toFixed(2)}%` : "—"],
                ["Day Change", q?.changePct != null ? `${q.changePct > 0 ? "+" : ""}${q.changePct.toFixed(2)}%` : "—", q?.changePct != null ? (q.changePct >= 0 ? "var(--color-positive)" : "var(--color-negative)") : undefined],
              ].map(([label, val, color]) => (
                <div key={label as string} className="flex justify-between">
                  <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
                  <span className="font-bold" style={{ fontFamily: "var(--font-mono)", color: (color as string) || undefined }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
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

        {/* ── Tier 2B: What-If Scenario Simulator ── */}
        <div className="metric-card mb-4 animate-fade-in-up delay-3" style={{ borderTop: "3px solid #8B5CF6" }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold uppercase tracking-wider" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>What-If Simulator</h3>
            {simCmpOverrides[s.tikr] && (
              <button onClick={() => setSimCmpOverrides(prev => { const next = { ...prev }; delete next[s.tikr]; return next; })} className="btn btn-ghost btn-sm" style={{ fontSize: "var(--text-xs)", color: "var(--color-accent-blue)" }}>Reset to Live</button>
            )}
          </div>
          {(() => {
            const realCmp = (s.tikr ? quotes[s.tikr]?.price : undefined) || s.cmp || 0;
            const simCmp = simCmpOverrides[s.tikr] || realCmp;
            const lo = Math.round(realCmp * 0.5);
            const hi = Math.round(realCmp * 1.5);
            const simActive = !!simCmpOverrides[s.tikr];
            const simUpside = s.base_current && simCmp ? ((s.base_current - simCmp) / simCmp) : undefined;
            return (
              <div>
                <div className="flex items-center gap-4 mb-2">
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", minWidth: 54 }}>₹{fmt(lo, 0)}</span>
                  <input type="range" min={lo} max={hi} step={1} value={Math.round(simCmp)} onChange={e => { const v = Number(e.target.value); setSimCmpOverrides(prev => ({ ...prev, [s.tikr]: v })); }} className="flex-1" style={{ accentColor: "#8B5CF6" }} />
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", minWidth: 54, textAlign: "right" }}>₹{fmt(hi, 0)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Simulated CMP:</span>
                    <span className="font-bold" style={{ fontSize: "var(--text-lg)", fontFamily: "var(--font-mono)", color: simActive ? "#8B5CF6" : "var(--color-text-primary)" }}>₹{fmt(simCmp, 1)}</span>
                    {simActive && <span style={{ fontSize: "var(--text-xs)", color: simCmp > realCmp ? "var(--color-positive)" : simCmp < realCmp ? "var(--color-negative)" : "var(--color-text-muted)" }}>({simCmp > realCmp ? "+" : ""}{(((simCmp - realCmp) / realCmp) * 100).toFixed(1)}% vs live)</span>}
                  </div>
                  {simUpside != null && (
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Upside to Base:</span>
                      <span className="font-bold" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-mono)", color: simUpside >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}>{simUpside >= 0 ? "+" : ""}{(simUpside * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {simActive && s.cds != null && (
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>CDS:</span>
                      <span className="font-bold" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-mono)", color: s.cds >= 80 ? "#059669" : s.cds >= 60 ? "#10B981" : s.cds >= 40 ? "#D97706" : "#EF4444" }}>{s.cds}</span>
                    </div>
                  )}
                </div>
                {!simActive && <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>Drag the slider to simulate a different CMP. All scores auto-recalculate.</p>}
              </div>
            );
          })()}
        </div>

        {/* ── Tier 3A: Stock Journal Notes ── */}
        <div className="metric-card mb-4 animate-fade-in-up delay-4" style={{ borderTop: "2px solid #8B5CF680" }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold uppercase tracking-wider" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Decision Notes</h3>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: "var(--text-xs)", color: "#8B5CF6" }} onClick={() => fetchJournal(s.tikr)}>↻ Refresh</button>
          </div>
          {(() => {
            const stockEntries = journalEntries.filter(e => e.tikr === s.tikr).slice(0, 10);
            return (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input value={journalTikr === s.tikr ? journalAnnotation : ""} onFocus={() => setJournalTikr(s.tikr)} onChange={e => { setJournalTikr(s.tikr); setJournalAnnotation(e.target.value); }} placeholder="Add a note about this stock..." style={{ flex: 1, padding: "6px 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "var(--text-xs)", background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }} />
                  <button disabled={journalTikr !== s.tikr || !journalAnnotation.trim()} onClick={async () => {
                    await postJournalEntry({ tikr: s.tikr, event_type: "annotation", annotation: journalAnnotation.trim(), cmp_at_event: s.liveCmp, upside_base: s.upsideBaseCalc ? Math.round(s.upsideBaseCalc * 10000) / 100 : undefined, cds_at_event: s.cds });
                    setJournalAnnotation(""); fetchJournal();
                  }} className="btn btn-sm" style={{ background: "#8B5CF6", color: "#fff", fontSize: "var(--text-xs)", opacity: (journalTikr !== s.tikr || !journalAnnotation.trim()) ? 0.4 : 1 }}>Save</button>
                </div>
                {stockEntries.length > 0 ? (
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {stockEntries.map(e => (
                      <div key={e.id} style={{ padding: "4px 0", borderBottom: "1px solid var(--color-border)", fontSize: "var(--text-xs)" }}>
                        <div className="flex items-center gap-2">
                          <span style={{ color: e.event_type === "annotation" ? "#8B5CF6" : e.event_type === "zone_enter" ? "var(--color-positive)" : "var(--color-text-muted)", fontWeight: 600 }}>
                            {e.event_type === "annotation" ? "Note" : e.event_type === "zone_enter" ? `→ ${e.zone_name === "buy" ? "Buy Zone" : e.zone_name === "sell" ? "Take Profit" : "Overvalued"}` : `← Exited`}
                          </span>
                          <span style={{ color: "var(--color-text-muted)" }}>·</span>
                          <span style={{ color: "var(--color-text-muted)" }}>{new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} {new Date(e.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                          {e.cmp_at_event != null && <span style={{ color: "var(--color-text-muted)" }}>· ₹{fmt(e.cmp_at_event, 0)}</span>}
                        </div>
                        {e.annotation && <div style={{ color: "var(--color-text-secondary)", marginTop: 2 }}>{e.annotation}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "8px 0", color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>No notes yet for this stock.</div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-4 mb-4 metrics-grid">
          {[
            { label: "1Y Target", value: s.target_1y ? `₹${fmt(s.target_1y, 0)}` : "—", sub: s.upside1YCalc != null ? fmtPct(s.upside1YCalc) : undefined, subColor: s.upside1YCalc != null ? (s.upside1YCalc >= 0 ? "var(--color-positive)" : "var(--color-negative)") : undefined },
            { label: "2Y Target", value: s.target_2y ? `₹${fmt(s.target_2y, 0)}` : "—", sub: s.upside2YCalc != null ? fmtPct(s.upside2YCalc) : undefined, subColor: s.upside2YCalc != null ? (s.upside2YCalc >= 0 ? "var(--color-positive)" : "var(--color-negative)") : undefined },
            { label: "Dividend Yield", value: q?.dividendYield ? `${(q.dividendYield * 100).toFixed(2)}%` : s.div_yield != null ? `${s.div_yield.toFixed(1)}%` : "—", sub: q?.dividendRate ? `₹${q.dividendRate.toFixed(2)}/share` : undefined },
            { label: "Score", value: String(s.score ?? "—"), sub: s.score_adj_1y != null ? `1Y adj: ${s.score_adj_1y}` : undefined },
          ].map((m, idx) => (
            <div key={m.label} className={`metric-card animate-fade-in-up delay-${idx + 1}`}>
              <div className="uppercase tracking-wide" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{m.label}</div>
              <div className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{m.value}</div>
              {m.sub && <div className="font-bold mt-1" style={{ fontSize: "var(--text-xs)", color: m.subColor || "var(--color-text-muted)" }}>{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* ── Tier 1: Decision Signals ── */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          {/* CDS Badge */}
          <div className="metric-card animate-fade-in-up delay-5">
            <div className="uppercase tracking-wide" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>CDS Score</div>
            <div className="font-bold mt-1" style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-mono)", color: s.cds != null ? (s.cds >= 80 ? "#059669" : s.cds >= 60 ? "#10B981" : s.cds >= 40 ? "#D97706" : "#EF4444") : "var(--color-text-muted)" }}>{s.cds ?? "—"}<span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", fontWeight: 400 }}>/100</span></div>
            {s.cdsBreakdown && <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>V:{s.cdsBreakdown.val} T:{s.cdsBreakdown.tech} Q:{s.cdsBreakdown.qual} P:{s.cdsBreakdown.pos}</div>}
          </div>
          {/* Quality Score */}
          <div className="metric-card animate-fade-in-up delay-5">
            <div className="uppercase tracking-wide" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Quality</div>
            <div className="font-bold mt-1" style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{s.qualityScore != null ? s.qualityScore.toFixed(1) : "—"}<span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", fontWeight: 400 }}>/5</span></div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>Conv: {s.conviction ?? "—"} · Und: {s.understanding ?? "—"}</div>
          </div>
          {/* Forward PE (Tier 1B) */}
          <div className="metric-card animate-fade-in-up delay-5">
            <div className="uppercase tracking-wide" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Fwd PE (FY27/28)</div>
            <div className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
              {s.forwardPE_fy27 ? `${s.forwardPE_fy27.toFixed(1)}x` : "—"}{s.forwardPE_fy28 ? <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}> / {s.forwardPE_fy28.toFixed(1)}x</span> : null}
            </div>
            {(s.exp_profit_fy27 || s.exp_profit_fy28) && <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>Exp Profit: {s.exp_profit_fy27 ? `₹${s.exp_profit_fy27.toFixed(0)} Cr` : "—"} / {s.exp_profit_fy28 ? `₹${s.exp_profit_fy28.toFixed(0)} Cr` : "—"}</div>}
          </div>
          {/* Analyst Divergence (Tier 1C) */}
          <div className="metric-card animate-fade-in-up delay-5">
            <div className="uppercase tracking-wide" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Street Divergence</div>
            {(() => {
              const e = s.tikr ? enrichmentCache[s.tikr] : undefined;
              const div = (e?.targetMeanPrice && s.base_current) ? (e.targetMeanPrice - s.base_current) / s.base_current : undefined;
              const flagged = div != null && Math.abs(div) > 0.2;
              return (<>
                <div className="font-bold mt-1" style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-mono)", color: div != null ? (flagged ? (div > 0 ? "#059669" : "#EF4444") : "var(--color-text-primary)") : "var(--color-text-muted)" }}>
                  {div != null ? `${div >= 0 ? "+" : ""}${(div * 100).toFixed(1)}%` : (enrichmentLoading[s.tikr] ? "…" : "—")}
                </div>
                {e?.targetMeanPrice && <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>Street: ₹{fmt(e.targetMeanPrice, 0)} vs Base: ₹{fmt(s.base_current, 0)}</div>}
                {flagged && <div style={{ fontSize: "var(--text-xs)", marginTop: 2, color: div! > 0 ? "#059669" : "#EF4444", fontWeight: 600 }}>{div! > 0 ? "Street more bullish" : "Street more bearish"}</div>}
              </>);
            })()}
          </div>
        </div>

        {/* Valuation Table — Enhanced with live data */}
        <div className="metric-card mb-4 animate-fade-in-up delay-5">
          <h3 className="font-bold uppercase tracking-wider mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Valuation Multiples</h3>
          <table className="data-table w-full" role="table" aria-label="Valuation multiples">
            <thead><tr><th>Metric</th><th>Bear</th><th>Base</th><th>Bull</th><th>+2 SD</th><th>Live</th></tr></thead>
            <tbody>
              <tr><td style={{ color: "var(--color-text-secondary)" }}>PE</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-red)" }}>{s.bear_pe ? `${s.bear_pe.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-green)" }}>{s.bull_pe ? `${s.bull_pe.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_pe_2sd ? `${s.base_pe_2sd.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-blue)" }}>{q?.trailingPE ? `${q.trailingPE.toFixed(1)}x` : "—"}</td></tr>
              <tr><td style={{ color: "var(--color-text-secondary)" }}>PB</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-red)" }}>{s.bear_pb ? `${s.bear_pb.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_pb ? `${s.base_pb.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-green)" }}>{s.bull_pb ? `${s.bull_pb.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_pb_2sd ? `${s.base_pb_2sd.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-blue)" }}>{q?.priceToBook ? `${q.priceToBook.toFixed(2)}x` : "—"}</td></tr>
              <tr><td style={{ color: "var(--color-text-secondary)" }}>EV/EBITDA</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-red)" }}>{s.bear_evebitda ? `${s.bear_evebitda.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_evebitda ? `${s.base_evebitda.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-green)" }}>{s.bull_evebitda ? `${s.bull_evebitda.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)" }}>{s.base_evebitda_2sd ? `${s.base_evebitda_2sd.toFixed(1)}x` : "—"}</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-blue)" }}>{enr?.enterpriseToEbitda ? `${enr.enterpriseToEbitda.toFixed(1)}x` : "—"}</td></tr>
              <tr><td style={{ color: "var(--color-text-secondary)" }}>Forward PE</td><td style={{ fontFamily: "var(--font-mono)" }}>—</td><td style={{ fontFamily: "var(--font-mono)" }}>—</td><td style={{ fontFamily: "var(--font-mono)" }}>—</td><td style={{ fontFamily: "var(--font-mono)" }}>—</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-blue)" }}>{q?.forwardPE ? `${q.forwardPE.toFixed(1)}x` : "—"}</td></tr>
              <tr><td style={{ color: "var(--color-text-secondary)" }}>PEG Ratio</td><td style={{ fontFamily: "var(--font-mono)" }}>—</td><td style={{ fontFamily: "var(--font-mono)" }}>—</td><td style={{ fontFamily: "var(--font-mono)" }}>—</td><td style={{ fontFamily: "var(--font-mono)" }}>—</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent-blue)" }}>{enr?.pegRatio ? `${enr.pegRatio.toFixed(2)}` : "—"}</td></tr>
            </tbody>
          </table>
        </div>

        {/* ── Deep Enrichment: Financials + Analyst (lazy loaded) ── */}
        {(enr || enrLoading) && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Financial Health */}
            <div className="metric-card animate-fade-in-up">
              <h3 className="font-bold uppercase tracking-wider mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Financial Health {enrLoading && <span className="skeleton" style={{ display: "inline-block", width: 40, height: 12, verticalAlign: "middle", marginLeft: 8 }} />}</h3>
              {enr ? (
                <div className="space-y-2" style={{ fontSize: "var(--text-sm)" }}>
                  {[
                    ["Revenue", enr.totalRevenue ? fmtCrore(enr.totalRevenue) : "—"],
                    ["Revenue Growth", enr.revenueGrowth != null ? `${(enr.revenueGrowth * 100).toFixed(1)}%` : "—"],
                    ["Earnings Growth", enr.earningsGrowth != null ? `${(enr.earningsGrowth * 100).toFixed(1)}%` : "—"],
                    ["Profit Margin", enr.profitMargins != null ? `${(enr.profitMargins * 100).toFixed(1)}%` : "—"],
                    ["EBITDA Margin", enr.ebitdaMargins != null ? `${(enr.ebitdaMargins * 100).toFixed(1)}%` : "—"],
                    ["ROE", enr.returnOnEquity != null ? `${(enr.returnOnEquity * 100).toFixed(1)}%` : "—"],
                    ["D/E", enr.debtToEquity != null ? `${enr.debtToEquity.toFixed(1)}%` : "—"],
                    ["Current Ratio", enr.currentRatio != null ? enr.currentRatio.toFixed(2) : "—"],
                    ["Free Cash Flow", enr.freeCashflow ? fmtCrore(enr.freeCashflow) : "—"],
                    ["Beta", enr.beta != null ? enr.beta.toFixed(2) : "—"],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between">
                      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
                      <span className="font-bold" style={{ fontFamily: "var(--font-mono)" }}>{val}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">{SKELETON_WIDTHS.map((w, i) => <div key={i} className="skeleton" style={{ height: 16, width: `${w}%` }} />)}</div>
              )}
            </div>

            {/* Analyst Consensus */}
            <div className="metric-card animate-fade-in-up">
              <h3 className="font-bold uppercase tracking-wider mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Analyst Consensus {enrLoading && <span className="skeleton" style={{ display: "inline-block", width: 40, height: 12, verticalAlign: "middle", marginLeft: 8 }} />}</h3>
              {enr ? (
                <div className="space-y-3">
                  {enr.recommendationKey && (
                    <div className="flex items-center gap-2">
                      <span className="inline-block px-3 py-1 rounded-full font-bold uppercase" style={{ fontSize: "var(--text-xs)", background: enr.recommendationKey === "buy" || enr.recommendationKey === "strong_buy" ? "var(--color-positive-bg)" : enr.recommendationKey === "sell" || enr.recommendationKey === "strong_sell" ? "var(--color-negative-bg)" : "var(--color-warning-bg)", color: enr.recommendationKey === "buy" || enr.recommendationKey === "strong_buy" ? "var(--color-positive)" : enr.recommendationKey === "sell" || enr.recommendationKey === "strong_sell" ? "var(--color-negative)" : "var(--color-warning)" }}>
                        {enr.recommendationKey.replace("_", " ")}
                      </span>
                      {enr.numberOfAnalystOpinions != null && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>({enr.numberOfAnalystOpinions} analysts)</span>}
                    </div>
                  )}
                  {(enr.strongBuy != null || enr.buy != null) && (
                    <AnalystBar strongBuy={enr.strongBuy || 0} buy={enr.buy || 0} hold={enr.hold || 0} sell={enr.sell || 0} strongSell={enr.strongSell || 0} />
                  )}
                  <div className="space-y-2 mt-2" style={{ fontSize: "var(--text-sm)" }}>
                    {[
                      ["Target Mean", enr.targetMeanPrice ? `₹${fmt(enr.targetMeanPrice, 0)}` : "—"],
                      ["Target High", enr.targetHighPrice ? `₹${fmt(enr.targetHighPrice, 0)}` : "—"],
                      ["Target Low", enr.targetLowPrice ? `₹${fmt(enr.targetLowPrice, 0)}` : "—"],
                      ["Earnings Date", enr.earningsDate ? new Date(enr.earningsDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"],
                      ["Ex-Div Date", enr.exDividendDate ? new Date(enr.exDividendDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex justify-between">
                        <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
                        <span className="font-bold" style={{ fontFamily: "var(--font-mono)" }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">{SKELETON_WIDTHS.map((w, i) => <div key={i} className="skeleton" style={{ height: 16, width: `${w}%` }} />)}</div>
              )}
            </div>
          </div>
        )}

        {/* Position & Profit — removed per user request */}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  //  MAIN DASHBOARD
  // ══════════════════════════════════════════════════════════
  return (
    <div className="max-w-[1600px] mx-auto px-3 md:px-5 py-3 md:py-4 dash-wrapper">

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
          <button onClick={refreshData} disabled={dataRefreshing} className="btn btn-primary btn-sm" aria-label="Sync data from OneDrive">
            {dataRefreshing ? (syncStatus || "Syncing...") : "⟳ Sync Data"}
          </button>
          <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 4px" }} />
          {lastFetched && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>CMP: {new Date(lastFetched).toLocaleTimeString("en-IN")}{failedTikrs.length > 0 && <span style={{ color: "var(--color-warning)", marginLeft: 6 }} title={`Stale CMP: ${failedTikrs.join(", ")}`}>({failedTikrs.length} stale)</span>}</span>}
          <CountdownTimer active={autoRefresh} onTick={fetchQuotes} />
          <button onClick={fetchQuotes} disabled={quotesLoading} className="btn btn-ghost btn-sm" aria-label="Refresh market prices">
            {quotesLoading ? "Fetching..." : "Refresh CMP"}
          </button>
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`btn btn-sm ${autoRefresh ? "btn-success" : "btn-ghost"}`} aria-label={`Auto refresh is ${autoRefresh ? "on" : "off"}`} aria-pressed={autoRefresh}>
            {autoRefresh ? "Auto: ON" : "Auto: OFF"}
          </button>
          <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 4px" }} />
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="btn btn-ghost btn-sm" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            )}
          </button>
        </div>
      </div>

      {/* ═══════════════════ TAB 1: OCTOPUS ═══════════════════ */}
      {activeTab === "octopus" && (
        <div id="panel-octopus" role="tabpanel" aria-labelledby="tab-octopus" className="animate-fade-in">
          <div className="flex flex-wrap items-center gap-3 mb-3 filter-bar">
            <input type="text" placeholder="Search company, sector, VP..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-dark flex-1 md:min-w-[250px] max-w-md w-full" aria-label="Search stocks" />
            <select value={filterSector} onChange={e => setFilterSector(e.target.value)} className="select-dark" aria-label="Filter by sector"><option value="all">All Sectors</option>{filterOptions.sectors.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <select value={filterVP} onChange={e => setFilterVP(e.target.value)} className="select-dark" aria-label="Filter by VA analyst"><option value="all">All VAs</option>{filterOptions.vps.map(v => <option key={v} value={v}>{v}</option>)}</select>
            <select value={filterConviction} onChange={e => setFilterConviction(e.target.value)} className="select-dark" aria-label="Filter by conviction level"><option value="all">All Conviction</option>{filterOptions.convictions.map(c => <option key={c} value={String(c)}>{c}+</option>)}</select>
            <button onClick={() => setFilterHoldingsOnly(v => !v)} className={`btn btn-sm ${filterHoldingsOnly ? "btn-active" : "btn-ghost"}`} style={filterHoldingsOnly ? { background: "var(--color-accent-blue)", color: "#fff", border: "1px solid var(--color-accent-blue)" } : { color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }} aria-label="Filter by holdings only" title="Show only stocks you hold">Holdings</button>
            {activeFilters > 0 && <button onClick={() => { setFilterSector("all"); setFilterVP("all"); setFilterConviction("all"); setFilterHoldingsOnly(false); }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-accent-blue)" }}>Clear filters ({activeFilters})</button>}
            <span className="ml-auto filter-stats" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{sortedStocks.length} stocks · {Object.keys(quotes).length} live</span>
          </div>

          {/* Watchlist bar */}
          <div className="flex items-center gap-2 mb-3 flex-wrap" style={{ fontSize: "var(--text-xs)" }}>
            <span style={{ color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>View:</span>
            <button onClick={() => { setActiveWatchlist("all"); setShowHidden(false); }} className={`btn btn-sm ${activeWatchlist === "all" && !showHidden ? "btn-primary" : "btn-ghost"}`}>All Stocks</button>
            {Object.keys(watchlists).map(wl => (
              <div key={wl} className="inline-flex items-center gap-0">
                <button onClick={() => { setActiveWatchlist(wl); setShowHidden(false); }} className={`btn btn-sm ${activeWatchlist === wl ? "btn-primary" : "btn-ghost"}`} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
                  {wl} <span style={{ opacity: 0.7 }}>({watchlists[wl].length})</span>
                </button>
                <button onClick={() => deleteWatchlist(wl)} className="btn btn-ghost btn-sm" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: "var(--space-1) var(--space-2)", color: "var(--color-negative)" }} aria-label={`Delete watchlist ${wl}`} title="Delete watchlist">&times;</button>
              </div>
            ))}
            {hiddenStocks.size > 0 && (
              <button onClick={() => { setActiveWatchlist("hidden"); setShowHidden(true); }} className={`btn btn-sm ${activeWatchlist === "hidden" ? "btn-primary" : "btn-ghost"}`}>
                Hidden ({hiddenStocks.size})
              </button>
            )}
            <div style={{ width: 1, height: 20, background: "var(--color-border)" }} />
            <button onClick={() => setShowWatchlistModal(true)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-accent-blue)" }} aria-label="Create new watchlist">+ Watchlist</button>
          </div>

          {/* Watchlist creation modal */}
          {showWatchlistModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowWatchlistModal(false)}>
              <div className="metric-card max-w-sm w-full mx-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-lg)", color: "var(--color-text-primary)" }}>Create Watchlist</h3>
                <input type="text" placeholder="Watchlist name..." value={newWatchlistName} onChange={e => setNewWatchlistName(e.target.value)} onKeyDown={e => e.key === "Enter" && createWatchlist(newWatchlistName)} className="input-dark w-full mb-3" autoFocus aria-label="New watchlist name" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowWatchlistModal(false)} className="btn btn-ghost btn-sm">Cancel</button>
                  <button onClick={() => createWatchlist(newWatchlistName)} disabled={!newWatchlistName.trim()} className="btn btn-primary btn-sm">Create</button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl overflow-auto table-scroll-container" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", maxHeight: "calc(100vh - 310px)" }}>
            <table className="data-table w-full" role="table" aria-label="Stock data table">
              <thead><tr>
                <th style={{ width: 40, cursor: "default" }}></th>
                <Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="companyShort" label="Company" /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="sector" label="Sector" /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="liveCmp" label="CMP" />
                <Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="bear_current" label="Bear" /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="base_current" label="Base" /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="bull_current" label="Bull" />
                <Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="upsideBearCalc" label="↑ Bear" /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="upsideBaseCalc" label="↑ Base" /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="upsideBullCalc" label="↑ Bull" />
                <Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="upside1YCalc" label="1Y Upside" /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="upside2YCalc" label="2Y Upside" />
                <Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="base_pe" label="PE" /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="base_pb" label="PB" /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="base_evebitda" label="EV/EBITDA" />
                <Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="conviction" label="Conv." /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="vp" label="VA" /><Th sortCol={sortCol} sortDir={sortDir} onSort={handleSort} col="sa" label="SA" />
              </tr></thead>
              <tbody>
                {quotesLoading && Object.keys(quotes).length === 0 ? (
                  Array.from({ length: 15 }).map((_, i) => <SkeletonRow key={i} />)
                ) : sortedStocks.map((s, i) => {
                  const isBuy = s.liveCmp && s.bear_current && s.liveCmp <= s.bear_current * 1.05;
                  const isSell = s.liveCmp && s.bull_current && s.liveCmp >= s.bull_current * 0.95;
                  return (
                    <tr key={`${s.tikr}-${i}`} className={`cursor-pointer ${isBuy ? "row-buy-zone" : isSell ? "row-sell-zone" : ""}`} onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)} role="row" aria-label={`${s.companyShort} - click for details`}>
                      <td onClick={e => e.stopPropagation()} style={{ padding: "var(--space-1)", position: "relative" }}>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => toggleHideStock(s.tikr)} className="stock-action-btn" title={hiddenStocks.has(s.tikr) ? "Unhide stock" : "Hide stock"} aria-label={hiddenStocks.has(s.tikr) ? "Unhide stock" : "Hide stock"}>
                            {hiddenStocks.has(s.tikr) ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 01-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            )}
                          </button>
                          {Object.keys(watchlists).length > 0 && (
                            <div className="watchlist-dropdown-wrap">
                              <button className="stock-action-btn" title="Add to watchlist" aria-label="Add to watchlist">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                              </button>
                              <div className="watchlist-dropdown">
                                {Object.keys(watchlists).map(wl => (
                                  <button key={wl} onClick={() => toggleStockInWatchlist(wl, s.tikr)} className="watchlist-dropdown-item">
                                    <span style={{ width: 16, display: "inline-block" }}>{watchlists[wl].includes(s.tikr) ? "✓" : ""}</span>
                                    {wl}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="font-semibold" style={{ whiteSpace: "normal", minWidth: 120, maxWidth: 220, color: "var(--color-text-primary)" }}>{s.companyShort}</td>
                      <td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{s.sector || "—"}</td>
                      <td className="font-semibold" style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                        {s.liveCmp ? `₹${fmt(s.liveCmp, 1)}` : "—"}
                        {s.liveChangePct != null && (
                          <div style={{ fontSize: "0.625rem", color: s.liveChangePct >= 0 ? "var(--color-positive)" : "var(--color-negative)", lineHeight: 1, marginTop: 1 }}>
                            {s.liveChangePct >= 0 ? "▲" : "▼"} {Math.abs(s.liveChangePct).toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{s.bear_current ? `₹${fmt(s.bear_current, 0)}` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{s.base_current ? `₹${fmt(s.base_current, 0)}` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{s.bull_current ? `₹${fmt(s.bull_current, 0)}` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...pctBgStyle(s.upsideBearCalc) }}>{s.upsideBearCalc != null ? fmtPct(s.upsideBearCalc) : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 600, ...pctBgStyle(s.upsideBaseCalc) }}>{s.upsideBaseCalc != null ? fmtPct(s.upsideBaseCalc) : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...pctBgStyle(s.upsideBullCalc) }}>{s.upsideBullCalc != null ? fmtPct(s.upsideBullCalc) : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...pctBgStyle(s.upside1YCalc) }}>{s.upside1YCalc != null ? fmtPct(s.upside1YCalc) : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...pctBgStyle(s.upside2YCalc) }}>{s.upside2YCalc != null ? fmtPct(s.upside2YCalc) : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{s.base_pb ? `${s.base_pb.toFixed(1)}x` : "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{s.base_evebitda ? `${s.base_evebitda.toFixed(1)}x` : "—"}</td>
                      <td className="text-center"><ConvictionDots level={s.conviction ?? 0} /></td>
                      <td className="text-center" style={{ color: "var(--color-text-secondary)" }}>{s.vp || "—"}</td>
                      <td className="text-center" style={{ color: "var(--color-text-secondary)" }}>{s.sa || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Portfolio Heatmap Treemap ── */}
          <div className="metric-card animate-fade-in-up mt-4" style={{ borderTop: "3px solid var(--color-accent-blue)" }}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-bold" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Portfolio Heatmap</h3>
            </div>
            {/* Toggle pills */}
            <div className="flex flex-wrap gap-2 mb-3" style={{ fontSize: "var(--text-xs)" }}>
              <span style={{ color: "var(--color-text-muted)", fontWeight: 600, alignSelf: "center" }}>Scope:</span>
              {(["portfolio", "all"] as const).map(v => (
                <button key={v} className="scatter-pill" style={{ background: hmScope === v ? "var(--color-accent-blue)" : "var(--color-bg-hover)", color: hmScope === v ? "#fff" : "var(--color-text-muted)" }} onClick={() => setHmScope(v)}>{v === "portfolio" ? "Portfolio" : "Full Universe"}</button>
              ))}
              <span style={{ width: 1, height: 20, background: "var(--color-border)", alignSelf: "center", margin: "0 4px" }} />
              <span style={{ color: "var(--color-text-muted)", fontWeight: 600, alignSelf: "center" }}>Color:</span>
              {(["dayChange", "upsideBear", "upsideBase", "upsideBull", "conviction"] as const).map(v => (
                <button key={v} className="scatter-pill" style={{ background: hmColorMode === v ? "var(--color-accent-blue)" : "var(--color-bg-hover)", color: hmColorMode === v ? "#fff" : "var(--color-text-muted)" }} onClick={() => setHmColorMode(v)}>{{ dayChange: "Day Chg", upsideBear: "↑ Bear", upsideBase: "↑ Base", upsideBull: "↑ Bull", conviction: "Conviction" }[v]}</button>
              ))}
              <span style={{ width: 1, height: 20, background: "var(--color-border)", alignSelf: "center", margin: "0 4px" }} />
              <span style={{ color: "var(--color-text-muted)", fontWeight: 600, alignSelf: "center" }}>Size:</span>
              {(["holding", "equal", "marketCap"] as const).map(v => (
                <button key={v} className="scatter-pill" style={{ background: hmSizeMode === v ? "var(--color-accent-blue)" : "var(--color-bg-hover)", color: hmSizeMode === v ? "#fff" : "var(--color-text-muted)" }} onClick={() => setHmSizeMode(v)}>{{holding: "Holding ₹", equal: "Equal", marketCap: "Mkt Cap"}[v]}</button>
              ))}
              <span style={{ width: 1, height: 20, background: "var(--color-border)", alignSelf: "center", margin: "0 4px" }} />
              <span style={{ color: "var(--color-text-muted)", fontWeight: 600, alignSelf: "center" }}>Group:</span>
              {(["sector", "subsector", "flat"] as const).map(v => (
                <button key={v} className="scatter-pill" style={{ background: hmGroupBy === v ? "var(--color-accent-blue)" : "var(--color-bg-hover)", color: hmGroupBy === v ? "#fff" : "var(--color-text-muted)" }} onClick={() => setHmGroupBy(v)}>{{sector: "Sector", subsector: "Subsector", flat: "Flat"}[v]}</button>
              ))}
            </div>
            {/* SVG Treemap */}
            {heatmapLayout.rects.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", padding: 20, textAlign: "center" }}>No stocks with holdings data. Switch to &quot;Full Universe&quot; to see all stocks.</p>
            ) : (
              <svg viewBox={`0 0 ${heatmapLayout.W} ${heatmapLayout.H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto", display: "block", borderRadius: 8, background: "rgb(24, 26, 32)" }}>
                {/* Sector group borders + labels */}
                {heatmapLayout.sectorRects?.map(sr => {
                  const maxLabelChars = Math.max(3, Math.floor(sr.w / 7));
                  const label = sr.id.length > maxLabelChars ? sr.id.slice(0, maxLabelChars - 1).trim() + "…" : sr.id;
                  return (
                    <g key={`sg-${sr.id}`}>
                      <rect x={sr.x} y={sr.y} width={sr.w} height={sr.h} fill="none" stroke="rgb(24, 26, 32)" strokeWidth={2.5} />
                      {hmGroupBy !== "flat" && sr.w > 30 && sr.h > 20 && (
                        <text x={sr.x + 4} y={sr.y + 12} fill="rgba(255,255,255,0.65)" style={{ fontSize: Math.max(7, Math.min(10, sr.w / 12)), fontWeight: 700, letterSpacing: "0.04em", pointerEvents: "none", textTransform: "uppercase" as const }}>{label}</text>
                      )}
                    </g>
                  );
                })}
                {/* Clip paths for text containment */}
                <defs>
                  {heatmapLayout.rects.map(r => {
                    const g = 1.5;
                    return <clipPath key={`cp-${r.tikr}`} id={`cp-${r.tikr.replace(/[^a-zA-Z0-9]/g, "_")}`}><rect x={r.x + g / 2 + 2} y={r.y + g / 2 + 1} width={Math.max(r.w - g - 4, 0)} height={Math.max(r.h - g - 2, 0)} /></clipPath>;
                  })}
                </defs>
                {/* Stock rects */}
                {heatmapLayout.rects.map(r => {
                  const isHovered = hmHover?.tikr === r.tikr;
                  const color = heatmapColor(r.colorVal, hmColorMode);
                  const g = 1.5;
                  const bx = r.x + g / 2, by = r.y + g / 2, bw = Math.max(r.w - g, 0), bh = Math.max(r.h - g, 0);
                  const showName = bw > 32 && bh > 22;
                  const showPct = bw > 44 && bh > 32;
                  const showTicker = !showName && bw > 18 && bh > 12;
                  const nf = Math.max(6.5, Math.min(12, bw / 8, bh / 3.5));
                  const pf = Math.max(5.5, Math.min(9, bw / 10, bh / 4.5));
                  const clipId = `cp-${r.tikr.replace(/[^a-zA-Z0-9]/g, "_")}`;
                  const nameStr = r.label || cleanTikr(r.tikr);
                  const maxChars = Math.max(4, Math.floor(bw / (nf * 0.58)));
                  const truncName = nameStr.length > maxChars ? nameStr.slice(0, maxChars - 1).trim() + "…" : nameStr;
                  return (
                    <g key={r.tikr}>
                      <rect x={bx} y={by} width={bw} height={bh} fill={color} stroke={isHovered ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.5)"} strokeWidth={isHovered ? 1.5 : 0.5} rx={1.5}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(e) => { const svg = e.currentTarget.ownerSVGElement; if (!svg) return; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const ctm = svg.getScreenCTM(); if (!ctm) return; const svgPt = pt.matrixTransform(ctm.inverse()); setHmHover({ tikr: r.tikr, x: svgPt.x, y: svgPt.y }); }}
                        onMouseLeave={() => setHmHover(null)}
                        onClick={() => { const s = enrichedStocks.find(s => s.tikr === r.tikr); if (s) setDetailStock(s); }}
                      />
                      <g clipPath={`url(#${clipId})`} style={{ pointerEvents: "none" }}>
                        {showName && (
                          <text x={bx + bw / 2} y={by + bh / 2 - (showPct ? pf * 0.6 : 0)} textAnchor="middle" dominantBaseline="central" fill="#fff" style={{ fontSize: nf, fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{truncName}</text>
                        )}
                        {showName && showPct && (
                          <text x={bx + bw / 2} y={by + bh / 2 + nf * 0.6} textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.9)" style={{ fontSize: pf, fontWeight: 500, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                            {hmColorMode === "dayChange" ? `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%` : (hmColorMode === "upsideBase" || hmColorMode === "upsideBear" || hmColorMode === "upsideBull") ? `${(r.colorVal * 100) >= 0 ? "+" : ""}${(r.colorVal * 100).toFixed(1)}%` : hmColorMode === "conviction" ? `C${r.colorVal}` : ""}
                          </text>
                        )}
                        {showTicker && !showName && (
                          <text x={bx + bw / 2} y={by + bh / 2} textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.8)" style={{ fontSize: Math.max(5.5, Math.min(7.5, bw / 5)), fontWeight: 600 }}>{cleanTikr(r.tikr)}</text>
                        )}
                      </g>
                    </g>
                  );
                })}
                {/* Hover tooltip */}
                {hmHover && (() => {
                  const s = enrichedStocks.find(st => st.tikr === hmHover.tikr);
                  if (!s) return null;
                  const tw = 220, th = 62;
                  let tx = hmHover.x + 12, ty = hmHover.y - th - 6;
                  if (tx + tw > heatmapLayout.W) tx = hmHover.x - tw - 12;
                  if (ty < 0) ty = hmHover.y + 12;
                  return (
                    <g style={{ pointerEvents: "none" }}>
                      <rect x={tx} y={ty} width={tw} height={th} rx={6} fill="rgba(30,32,40,0.95)" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
                      <text x={tx + 10} y={ty + 15} fill="#fff" style={{ fontSize: 11, fontWeight: 700 }}>{s.companyShort}</text>
                      <text x={tx + 10} y={ty + 30} fill="rgba(255,255,255,0.7)" style={{ fontSize: 9.5 }}>CMP ₹{fmt(s.liveCmp, 0)}  |  Day {s.liveChangePct != null ? `${s.liveChangePct >= 0 ? "+" : ""}${s.liveChangePct.toFixed(1)}%` : "—"}</text>
                      <text x={tx + 10} y={ty + 44} fill="rgba(255,255,255,0.7)" style={{ fontSize: 9.5 }}>Hold {s.holding_cash_lakhs ? fmtLakhs(s.holding_cash_lakhs) : "—"}  |  ↑Base {s.upsideBaseCalc != null ? `${((s.upsideBaseCalc) * 100).toFixed(1)}%` : "—"}</text>
                      <text x={tx + 10} y={ty + 57} fill="rgba(255,255,255,0.5)" style={{ fontSize: 8.5 }}>{s.sector}{s.subsector && s.subsector !== "0" ? ` › ${s.subsector}` : ""}</text>
                    </g>
                  );
                })()}
              </svg>
            )}
            {/* Legend bar */}
            <div className="flex items-center justify-between mt-2 px-1" style={{ fontSize: "var(--text-xs)" }}>
              <div className="flex items-center gap-2">
                {hmColorMode !== "conviction" ? (
                  <>
                    <span style={{ color: "var(--color-text-muted)" }}>{hmColorMode === "dayChange" ? "-3%" : "-30%"}</span>
                    <div style={{ width: 140, height: 10, borderRadius: 5, background: "linear-gradient(to right, rgb(210,35,35), rgb(45,48,55), rgb(20,170,70))" }} />
                    <span style={{ color: "var(--color-text-muted)" }}>{hmColorMode === "dayChange" ? "+3%" : "+30%"}</span>
                  </>
                ) : (
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(c => <div key={c} style={{ width: 16, height: 10, borderRadius: 2, background: heatmapColor(c, "conviction") }} />)}
                    <span style={{ color: "var(--color-text-muted)", marginLeft: 4 }}>Conv 1–5</span>
                  </div>
                )}
              </div>
              <span style={{ color: "var(--color-text-muted)" }}>
                {heatmapLayout.rects.length} stocks | {hmColorMode === "dayChange" ? "Day Change" : hmColorMode === "upsideBase" ? "Upside to Base" : hmColorMode === "upsideBear" ? "Upside to Bear" : hmColorMode === "upsideBull" ? "Upside to Bull" : hmColorMode === "conviction" ? "Conviction" : "P&L"}
              </span>
            </div>
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
              <div className="kpi-grid mb-4">
                {(() => {
                  const ti = enrichedHoldings.reduce((s, h) => s + h.amt_invested, 0);
                  const tv = enrichedHoldings.reduce((s, h) => s + h.liveValue, 0);
                  const tg = tv - ti; const tp = ti > 0 ? (tg / ti) * 100 : 0;
                  const bv = enrichedHoldings.reduce((s, h) => s + (h.stockData?.bear_current || h.livePrice) * h.quantity, 0);
                  const buv = enrichedHoldings.reduce((s, h) => s + (h.stockData?.bull_current || h.livePrice) * h.quantity, 0);
                  const dayPnlTotal = enrichedHoldings.reduce((s, h) => s + h.dayPnl, 0);
                  const dayPnlPct = tv > 0 ? (dayPnlTotal / tv) * 100 : 0;
                  const v1y = enrichedHoldings.reduce((s, h) => s + (h.stockData?.target_1y || h.livePrice) * h.quantity, 0);
                  const v2y = enrichedHoldings.reduce((s, h) => s + (h.stockData?.target_2y || h.livePrice) * h.quantity, 0);
                  return (<>
                    <div className="kpi-card animate-fade-in-up delay-1"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Total Invested</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{fmtCr(ti)}</p></div>
                    <div className="kpi-card kpi-positive animate-fade-in-up delay-2"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Current Value</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{fmtCr(tv)}</p></div>
                    <div className={`kpi-card ${tg >= 0 ? "kpi-positive" : "kpi-negative"} animate-fade-in-up delay-3`}><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Unrealized P&L</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: tg >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}>{tg >= 0 ? "+" : ""}{fmtCr(tg)} ({tp.toFixed(1)}%)</p></div>
                    <div className={`kpi-card ${dayPnlTotal >= 0 ? "kpi-positive" : "kpi-negative"} animate-fade-in-up delay-4`}><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Day P&L</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: dayPnlTotal >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}>{dayPnlTotal >= 0 ? "+" : ""}{fmtRupee(dayPnlTotal)} ({dayPnlPct >= 0 ? "+" : ""}{dayPnlPct.toFixed(1)}%)</p></div>
                    <div className="kpi-card kpi-negative animate-fade-in-up delay-5"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Bear Scenario</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-negative)" }}>{fmtCr(bv)}</p><p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Drawdown: {tv ? ((bv - tv) / tv * 100).toFixed(1) : 0}%</p></div>
                    <div className="kpi-card kpi-positive animate-fade-in-up delay-6"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Bull Scenario</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-positive)" }}>{fmtCr(buv)}</p><p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Upside: +{tv ? ((buv - tv) / tv * 100).toFixed(1) : 0}%</p></div>
                    <div className={`kpi-card ${v1y >= tv ? "kpi-positive" : "kpi-negative"} animate-fade-in-up delay-7`}><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>1Y Target Value</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: v1y >= tv ? "var(--color-positive)" : "var(--color-negative)" }}>{fmtCr(v1y)}</p><p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Upside: {tv ? (v1y >= tv ? "+" : "") + ((v1y - tv) / tv * 100).toFixed(1) : 0}%</p></div>
                    <div className={`kpi-card ${v2y >= tv ? "kpi-positive" : "kpi-negative"} animate-fade-in-up delay-8`}><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>2Y Target Value</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: v2y >= tv ? "var(--color-positive)" : "var(--color-negative)" }}>{fmtCr(v2y)}</p><p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Upside: {tv ? (v2y >= tv ? "+" : "") + ((v2y - tv) / tv * 100).toFixed(1) : 0}%</p></div>
                  </>);
                })()}
              </div>
              {(() => {
                // Holdings sort helper
                const holdCols: Record<string, (h: typeof enrichedHoldings[0]) => number | string> = {
                  name: h => h.asset_name || "",
                  qty: h => h.quantity,
                  avgCost: h => h.avg_price,
                  cmp: h => h.livePrice,
                  dayPct: h => h.liveChangePct,
                  dayPnl: h => h.dayPnl,
                  invested: h => h.amt_invested,
                  value: h => h.liveValue,
                  pnl: h => h.liveGain,
                  pnlPct: h => h.liveGainPct,
                  bear: h => h.stockData?.bear_current ?? 0,
                  base: h => h.stockData?.base_current ?? 0,
                  bull: h => h.stockData?.bull_current ?? 0,
                  uBear: h => h.upsideToBear ?? -999,
                  uBase: h => h.upsideToBase ?? -999,
                  uBull: h => h.upsideToBull ?? -999,
                };
                const sortedHoldings = [...enrichedHoldings].sort((a, b) => {
                  const fn = holdCols[holdSortCol] || holdCols.value;
                  const av = fn(a), bv = fn(b);
                  const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
                  return holdSortDir === "desc" ? -cmp : cmp;
                });
                const hTh = (label: string, col: string) => {
                  const active = holdSortCol === col;
                  return (
                    <th key={col} onClick={() => { if (holdSortCol === col) setHoldSortDir(d => d === "asc" ? "desc" : "asc"); else { setHoldSortCol(col); setHoldSortDir("desc"); } }} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", color: active ? "var(--color-accent-blue)" : undefined }}>
                      {label}{active ? (holdSortDir === "desc" ? " ▾" : " ▴") : ""}
                    </th>
                  );
                };
                return (
              <div className="rounded-xl overflow-auto table-scroll-container" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", maxHeight: 1360 }}>
                <table className="data-table w-full" role="table" aria-label="Holdings data">
                  <thead><tr>{hTh("Stock","name")}{hTh("Qty","qty")}{hTh("Avg Cost","avgCost")}{hTh("CMP","cmp")}{hTh("Day %","dayPct")}{hTh("Day P&L","dayPnl")}{hTh("Invested","invested")}{hTh("Value","value")}{hTh("P&L","pnl")}{hTh("P&L %","pnlPct")}{hTh("Bear","bear")}{hTh("Base","base")}{hTh("Bull","bull")}{hTh("↑ Bear","uBear")}{hTh("↑ Base","uBase")}{hTh("↑ Bull","uBull")}</tr></thead>
                  <tbody>
                    {sortedHoldings.map((h, i) => (
                      <tr key={i}>
                        <td className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{h.asset_name}</td>
                        <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{fmt(h.quantity)}</td>
                        <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>₹{fmt(h.avg_price, 1)}</td>
                        <td className="font-semibold" style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>₹{fmt(h.livePrice, 1)}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...pctBgStyle(h.liveChangePct / 100) }}>{h.liveChangePct >= 0 ? "+" : ""}{h.liveChangePct.toFixed(1)}%</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...pctBgStyle(h.dayPnlPct / 100) }}>{h.dayPnl >= 0 ? "+" : ""}{fmtRupee(h.dayPnl)}</td>
                        <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{fmtCr(h.amt_invested)}</td>
                        <td className="font-semibold" style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{fmtCr(h.liveValue)}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...pctBgStyle(h.liveGainPct / 100) }}>{h.liveGain >= 0 ? "+" : ""}{fmtRupee(h.liveGain)}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...pctBgStyle(h.liveGainPct / 100) }}>{h.liveGainPct >= 0 ? "+" : ""}{h.liveGainPct.toFixed(1)}%</td>
                        <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{h.stockData?.bear_current ? `₹${fmt(h.stockData.bear_current, 0)}` : "—"}</td>
                        <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{h.stockData?.base_current ? `₹${fmt(h.stockData.base_current, 0)}` : "—"}</td>
                        <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{h.stockData?.bull_current ? `₹${fmt(h.stockData.bull_current, 0)}` : "—"}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...pctBgStyle(h.upsideToBear != null ? h.upsideToBear / 100 : null) }}>{h.upsideToBear != null ? `${h.upsideToBear >= 0 ? "+" : ""}${h.upsideToBear.toFixed(1)}%` : "—"}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 600, ...pctBgStyle(h.upsideToBase != null ? h.upsideToBase / 100 : null) }}>{h.upsideToBase != null ? `${h.upsideToBase >= 0 ? "+" : ""}${h.upsideToBase.toFixed(1)}%` : "—"}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...pctBgStyle(h.upsideToBull != null ? h.upsideToBull / 100 : null) }}>{h.upsideToBull != null ? `${h.upsideToBull >= 0 ? "+" : ""}${h.upsideToBull.toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
                ); // end IIFE return
              })()} {/* end holdings sort IIFE */}


          {/* ── Tier 2A: Portfolio Risk Dashboard ── */}
          <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid #EC4899" }}>
            <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Portfolio Risk Dashboard</h3>
            {(() => {
              // Only stocks with holding weight
              const held = enrichedStocks.filter(s => s.holding_pct && s.holding_pct > 0);
              const totalWeight = held.reduce((a, s) => a + (s.holding_pct || 0), 0);

              // HHI: sum of (weight%)^2 — ranges 0-10000. <1500 = diversified, >2500 = concentrated
              const hhi = held.reduce((a, s) => { const w = ((s.holding_pct || 0) / totalWeight) * 100; return a + w * w; }, 0);

              // Sector concentration: max sector weight
              const sectorWeights: Record<string, number> = {};
              held.forEach(s => { const sec = s.sector || "Other"; sectorWeights[sec] = (sectorWeights[sec] || 0) + (s.holding_pct || 0); });
              const maxSector = Object.entries(sectorWeights).sort((a, b) => b[1] - a[1]);
              const maxSectorPct = maxSector.length > 0 ? (maxSector[0][1] / totalWeight) * 100 : 0;

              // Top 5 concentration
              const top5 = [...held].sort((a, b) => (b.holding_pct || 0) - (a.holding_pct || 0)).slice(0, 5);
              const top5Pct = top5.reduce((a, s) => a + (s.holding_pct || 0), 0) / totalWeight * 100;

              // Portfolio Beta (from enrichment — batch loaded)
              let portfolioBeta: number | null = null;
              let betaCoverage = 0;
              let betaWeightedSum = 0;
              let betaTotalWeight = 0;
              held.forEach(s => {
                const e = s.tikr ? enrichmentCache[s.tikr] : undefined;
                if (e?.beta != null && s.holding_pct) {
                  betaWeightedSum += e.beta * (s.holding_pct / totalWeight);
                  betaTotalWeight += s.holding_pct / totalWeight;
                  betaCoverage++;
                }
              });
              if (betaTotalWeight > 0.3) portfolioBeta = betaWeightedSum / betaTotalWeight;

              // Scenario P&L: weighted upside across all held stocks per scenario
              const scenarioPnL = (key: "upsideBearCalc" | "upsideBaseCalc" | "upsideBullCalc") => {
                let weightedUpside = 0;
                held.forEach(s => {
                  const u = s[key] as number | undefined;
                  if (u != null && s.holding_pct) weightedUpside += u * (s.holding_pct / totalWeight);
                });
                return weightedUpside;
              };
              const bearPnL = scenarioPnL("upsideBearCalc");
              const basePnL = scenarioPnL("upsideBaseCalc");
              const bullPnL = scenarioPnL("upsideBullCalc");

              // Portfolio total value
              const totalValue = held.reduce((a, s) => a + (s.holding_cash_lakhs || 0), 0);

              const hhiLabel = hhi < 1500 ? "Diversified" : hhi < 2500 ? "Moderate" : "Concentrated";
              const hhiColor = hhi < 1500 ? "var(--color-positive)" : hhi < 2500 ? "#D97706" : "var(--color-negative)";

              // Stocks above base case
              const aboveBase = enrichedStocks.filter(s => s.upsideBaseCalc != null && s.upsideBaseCalc < 0 && s.base_current);

              return (
                <div>
                  {/* Top metrics row */}
                  <div className="grid grid-cols-6 gap-3 mb-4">
                    <div className="p-3 rounded-lg" style={{ background: "var(--color-bg-hover)" }}>
                      <div className="uppercase tracking-wider" style={{ fontSize: 9, color: "var(--color-text-muted)" }}>Portfolio Beta</div>
                      <div className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: portfolioBeta != null ? (portfolioBeta > 1.2 ? "var(--color-negative)" : portfolioBeta < 0.8 ? "var(--color-positive)" : "var(--color-text-primary)") : "var(--color-text-muted)" }}>
                        {portfolioBeta != null ? portfolioBeta.toFixed(2) : "—"}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>{betaCoverage}/{held.length} stocks</div>
                    </div>
                    <div className="p-3 rounded-lg" style={{ background: "var(--color-bg-hover)" }}>
                      <div className="uppercase tracking-wider" style={{ fontSize: 9, color: "var(--color-text-muted)" }}>HHI Index</div>
                      <div className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: hhiColor }}>{Math.round(hhi)}</div>
                      <div style={{ fontSize: 9, color: hhiColor, fontWeight: 600 }}>{hhiLabel}</div>
                    </div>
                    <div className="p-3 rounded-lg" style={{ background: "var(--color-bg-hover)" }}>
                      <div className="uppercase tracking-wider" style={{ fontSize: 9, color: "var(--color-text-muted)" }}>Top Sector</div>
                      <div className="font-bold mt-1" style={{ fontSize: "var(--text-lg)", fontFamily: "var(--font-mono)", color: maxSectorPct > 30 ? "#D97706" : "var(--color-text-primary)" }}>{maxSectorPct.toFixed(1)}%</div>
                      <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>{maxSector[0]?.[0] || "—"}</div>
                    </div>
                    <div className="p-3 rounded-lg" style={{ background: "var(--color-bg-hover)" }}>
                      <div className="uppercase tracking-wider" style={{ fontSize: 9, color: "var(--color-text-muted)" }}>Top 5 Conc.</div>
                      <div className="font-bold mt-1" style={{ fontSize: "var(--text-lg)", fontFamily: "var(--font-mono)", color: top5Pct > 50 ? "#D97706" : "var(--color-text-primary)" }}>{top5Pct.toFixed(1)}%</div>
                      <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>{held.length} stocks</div>
                    </div>
                    <div className="p-3 rounded-lg" style={{ background: "var(--color-bg-hover)" }}>
                      <div className="uppercase tracking-wider" style={{ fontSize: 9, color: "var(--color-text-muted)" }}>Portfolio Value</div>
                      <div className="font-bold mt-1" style={{ fontSize: "var(--text-lg)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{fmtLakhs(totalValue)}</div>
                      <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>{held.length} positions</div>
                    </div>
                    <div className="p-3 rounded-lg" style={{ background: aboveBase.length > 0 ? "rgba(217,119,6,0.1)" : "var(--color-bg-hover)", border: aboveBase.length > 0 ? "1px solid rgba(217,119,6,0.3)" : "none" }}>
                      <div className="uppercase tracking-wider" style={{ fontSize: 9, color: "var(--color-text-muted)" }}>Above Base Case</div>
                      <div className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: aboveBase.length > 0 ? "#D97706" : "var(--color-positive)" }}>{aboveBase.length}<span style={{ fontSize: "var(--text-sm)", fontWeight: 400, color: "var(--color-text-muted)" }}>/{enrichedStocks.filter(s => s.base_current).length}</span></div>
                      <div style={{ fontSize: 9, color: "var(--color-text-muted)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }} title={aboveBase.map(s => s.displayTikr || s.tikr).join(", ")}>{aboveBase.length > 0 ? aboveBase.map(s => s.displayTikr || s.tikr).join(", ") : "None"}</div>
                    </div>
                  </div>

                  {/* Scenario P&L cards */}
                  <div className="pnl-scenario-grid mb-4">
                    {[
                      { label: "Bear Scenario", pnl: bearPnL, color: "var(--color-negative)", bg: "var(--color-negative-bg)" },
                      { label: "Base Scenario", pnl: basePnL, color: "var(--color-warning)", bg: "var(--color-warning-bg)" },
                      { label: "Bull Scenario", pnl: bullPnL, color: "var(--color-positive)", bg: "var(--color-positive-bg)" },
                    ].map(sc => (
                      <div key={sc.label} className="p-3 rounded-lg" style={{ background: sc.bg, border: `1px solid ${sc.color}33` }}>
                        <div className="uppercase tracking-wider" style={{ fontSize: 9, color: "var(--color-text-muted)" }}>{sc.label}</div>
                        <div className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: sc.color }}>
                          {sc.pnl >= 0 ? "+" : ""}{(sc.pnl * 100).toFixed(1)}%
                        </div>
                        {totalValue > 0 && <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>P&L: {sc.pnl >= 0 ? "+" : ""}{fmtLakhs(totalValue * sc.pnl)}</div>}
                      </div>
                    ))}
                  </div>

                  {/* Top 5 holdings table */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold uppercase tracking-wider" style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Top 5 Holdings</span>
                      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                    </div>
                    <div className="overflow-auto table-scroll-container">
                    <table className="data-table w-full"><thead><tr><th>#</th><th>Stock</th><th>Sector</th><th>Weight</th><th>CDS</th><th>Bear</th><th>Base</th><th>Bull</th><th>Beta</th></tr></thead>
                      <tbody>{top5.map((s, i) => {
                        const e = s.tikr ? enrichmentCache[s.tikr] : undefined;
                        return (
                          <tr key={s.tikr} className="cursor-pointer" onClick={() => setDetailStock(s)}>
                            <td style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>{i + 1}</td>
                            <td className="font-semibold" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-primary)" }}>{s.companyShort}</td>
                            <td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{s.sector}</td>
                            <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", fontWeight: 600 }}>{s.holding_pct ? `${((s.holding_pct / totalWeight) * 100).toFixed(1)}%` : "—"}</td>
                            <td className="text-center"><span className="inline-block px-1.5 py-0.5 rounded font-bold" style={{ fontSize: 10, fontFamily: "var(--font-mono)", background: s.cds != null ? (s.cds >= 80 ? "rgba(5,150,105,0.2)" : s.cds >= 60 ? "rgba(52,211,153,0.15)" : s.cds >= 40 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)") : "transparent", color: s.cds != null ? (s.cds >= 80 ? "#059669" : s.cds >= 60 ? "#10B981" : s.cds >= 40 ? "#D97706" : "#EF4444") : "var(--color-text-muted)" }}>{s.cds ?? "—"}</span></td>
                            <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--color-negative)" }}>{s.upsideBearCalc != null ? `${(s.upsideBearCalc * 100).toFixed(1)}%` : "—"}</td>
                            <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", fontWeight: 600, color: s.upsideBaseCalc != null ? (s.upsideBaseCalc >= 0 ? "var(--color-positive)" : "var(--color-negative)") : "var(--color-text-muted)" }}>{s.upsideBaseCalc != null ? `${(s.upsideBaseCalc * 100).toFixed(1)}%` : "—"}</td>
                            <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--color-positive)" }}>{s.upsideBullCalc != null ? `${(s.upsideBullCalc * 100).toFixed(1)}%` : "—"}</td>
                            <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{e?.beta != null ? e.beta.toFixed(2) : "—"}</td>
                          </tr>
                        );
                      })}</tbody></table>
                    </div>
                  </div>

                  {/* Sector breakdown bar */}
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold uppercase tracking-wider" style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Sector Risk Breakdown</span>
                      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                    </div>
                    <div className="flex rounded-lg overflow-hidden" style={{ height: 24 }}>
                      {maxSector.filter(([, w]) => w > 0).map(([sec, w]) => {
                        const pct = (w / totalWeight) * 100;
                        const color = sectorColors[sec] || "#6B7280";
                        return pct > 1 ? (
                          <div key={sec} title={`${sec}: ${pct.toFixed(1)}%`} style={{ width: `${pct}%`, background: color, display: "flex", alignItems: "center", justifyContent: "center", minWidth: pct > 5 ? 0 : undefined, transition: "width 0.3s" }}>
                            {pct > 6 && <span style={{ fontSize: 8, color: "#fff", fontWeight: 700, whiteSpace: "nowrap", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>{sec.length > 8 ? sec.slice(0, 7) + "…" : sec}</span>}
                          </div>
                        ) : null;
                      })}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                      {maxSector.filter(([, w]) => w > 0).slice(0, 8).map(([sec, w]) => (
                        <span key={sec} style={{ fontSize: 9, color: "var(--color-text-muted)" }}>
                          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: sectorColors[sec] || "#6B7280", marginRight: 3 }} />
                          {sec} {((w / totalWeight) * 100).toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

              {/* VA & SA Analysis (moved from Decision Support) */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid #8B5CF6" }}>
                  <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>VA (Analyst) Coverage & Holdings</h3>
                  <div className="overflow-auto max-h-[400px] table-scroll-container"><table className="data-table w-full"><thead><tr><th>VA</th><th>Stocks</th><th>Holdings</th><th>Count</th><th>Avg Upside</th></tr></thead>
                    <tbody>{Object.entries(decisionData.vpStats).sort((a, b) => b[1].holdingsValue - a[1].holdingsValue).map(([vp, d]) => (
                      <Fragment key={vp}>
                      <tr className="cursor-pointer" style={{ background: expandedVP === vp ? "var(--color-bg-hover)" : undefined }} onClick={() => setExpandedVP(p => p === vp ? null : vp)}>
                        <td className="font-semibold" style={{ fontSize: "var(--text-sm)" }}><span style={{ marginRight: 4, fontSize: "var(--text-xs)", opacity: 0.5 }}>{expandedVP === vp ? "▾" : "▸"}</span>{vp}</td><td className="text-center"><span className="pill pill-blue">{d.count}</span></td><td style={{ fontFamily: "var(--font-mono)" }}>{d.holdingsValue > 0 ? fmtLakhs(d.holdingsValue) : "—"}</td><td className="text-center">{d.holdingsStocks > 0 ? d.holdingsStocks : "—"}</td><td><UpsideBar value={d.avgUpside} /></td>
                      </tr>
                      {expandedVP === vp && enrichedStocks.filter(s => (s.vp || "Unassigned") === vp && s.holding_cash_lakhs && s.holding_cash_lakhs > 0).sort((a, b) => (b.holding_cash_lakhs || 0) - (a.holding_cash_lakhs || 0)).map(s => (
                          <tr key={s.tikr} style={{ background: "var(--color-bg-primary)", fontSize: "var(--text-xs)" }}>
                            <td style={{ paddingLeft: 24, color: "var(--color-text-muted)" }}>{s.companyShort}</td>
                            <td style={{ fontFamily: "var(--font-mono)", textAlign: "center" }}>{s.liveCmp ? `₹${fmt(s.liveCmp, 0)}` : "—"}</td>
                            <td style={{ fontFamily: "var(--font-mono)", textAlign: "center" }}>{fmtLakhs(s.holding_cash_lakhs)}</td>
                            <td style={{ fontFamily: "var(--font-mono)", ...pctBgStyle(s.upsideBaseCalc ?? null) }}>{s.upsideBaseCalc != null ? `${((s.upsideBaseCalc) * 100).toFixed(1)}%` : "—"}</td>
                            <td style={{ fontFamily: "var(--font-mono)", ...pctBgStyle(s.upside1YCalc ?? null) }}>{s.upside1YCalc != null ? `${((s.upside1YCalc) * 100).toFixed(1)}%` : "—"}</td>
                          </tr>
                      ))}
                      </Fragment>
                    ))}</tbody></table></div>
                </div>
                <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid #14B8A6" }}>
                  <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>SA (Analyst) Coverage & Holdings</h3>
                  <div className="overflow-auto max-h-[400px] table-scroll-container"><table className="data-table w-full"><thead><tr><th>SA</th><th>Stocks</th><th>Holdings</th><th>Count</th><th>Avg Upside</th></tr></thead>
                    <tbody>{Object.entries(decisionData.saStats).sort((a, b) => b[1].holdingsValue - a[1].holdingsValue).map(([sa, d]) => (
                      <Fragment key={sa}>
                      <tr className="cursor-pointer" style={{ background: expandedSA === sa ? "var(--color-bg-hover)" : undefined }} onClick={() => setExpandedSA(p => p === sa ? null : sa)}>
                        <td className="font-semibold" style={{ fontSize: "var(--text-sm)" }}><span style={{ marginRight: 4, fontSize: "var(--text-xs)", opacity: 0.5 }}>{expandedSA === sa ? "▾" : "▸"}</span>{sa}</td><td className="text-center"><span className="pill pill-blue">{d.count}</span></td><td style={{ fontFamily: "var(--font-mono)" }}>{d.holdingsValue > 0 ? fmtLakhs(d.holdingsValue) : "—"}</td><td className="text-center">{d.holdingsStocks > 0 ? d.holdingsStocks : "—"}</td><td><UpsideBar value={d.avgUpside} /></td>
                      </tr>
                      {expandedSA === sa && enrichedStocks.filter(s => (s.sa || "Unassigned") === sa && s.holding_cash_lakhs && s.holding_cash_lakhs > 0).sort((a, b) => (b.holding_cash_lakhs || 0) - (a.holding_cash_lakhs || 0)).map(s => (
                          <tr key={s.tikr} style={{ background: "var(--color-bg-primary)", fontSize: "var(--text-xs)" }}>
                            <td style={{ paddingLeft: 24, color: "var(--color-text-muted)" }}>{s.companyShort}</td>
                            <td style={{ fontFamily: "var(--font-mono)", textAlign: "center" }}>{s.liveCmp ? `₹${fmt(s.liveCmp, 0)}` : "—"}</td>
                            <td style={{ fontFamily: "var(--font-mono)", textAlign: "center" }}>{fmtLakhs(s.holding_cash_lakhs)}</td>
                            <td style={{ fontFamily: "var(--font-mono)", ...pctBgStyle(s.upsideBaseCalc ?? null) }}>{s.upsideBaseCalc != null ? `${((s.upsideBaseCalc) * 100).toFixed(1)}%` : "—"}</td>
                            <td style={{ fontFamily: "var(--font-mono)", ...pctBgStyle(s.upside1YCalc ?? null) }}>{s.upside1YCalc != null ? `${((s.upside1YCalc) * 100).toFixed(1)}%` : "—"}</td>
                          </tr>
                      ))}
                      </Fragment>
                    ))}</tbody></table></div>
                </div>
              </div>

              {/* ── Sector Pie Chart by Holdings % ── */}
              {(() => {
                // Aggregate sector holdings from enrichedHoldings
                const sectorMap: Record<string, number> = {};
                let totalVal = 0;
                enrichedHoldings.forEach(h => {
                  const sec = h.stockData?.sector || "Other";
                  sectorMap[sec] = (sectorMap[sec] || 0) + h.liveValue;
                  totalVal += h.liveValue;
                });
                if (totalVal === 0) return null;
                const sectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);
                const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06B6D4","#84CC16","#F97316","#6366F1","#14B8A6","#A855F7","#D97706","#0EA5E9","#E11D48","#22C55E","#7C3AED","#0891B2","#CA8A04","#DC2626"];
                // Build pie slices
                const cx = 140, cy = 140, r = 120, ri = 55; // donut
                let startAngle = -Math.PI / 2;
                const slices = sectors.map(([sec, val], i) => {
                  const pct = val / totalVal;
                  const angle = pct * 2 * Math.PI;
                  const endAngle = startAngle + angle;
                  const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
                  const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
                  const ix1 = cx + ri * Math.cos(startAngle), iy1 = cy + ri * Math.sin(startAngle);
                  const ix2 = cx + ri * Math.cos(endAngle), iy2 = cy + ri * Math.sin(endAngle);
                  const large = angle > Math.PI ? 1 : 0;
                  const d = `M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${ri},${ri} 0 ${large},0 ${ix1},${iy1} Z`;
                  const midAngle = startAngle + angle / 2;
                  const lx = cx + (r + 14) * Math.cos(midAngle);
                  const ly = cy + (r + 14) * Math.sin(midAngle);
                  const result = { sec, pct, val, d, color: COLORS[i % COLORS.length], lx, ly, midAngle };
                  startAngle = endAngle;
                  return result;
                });
                return (
                  <div className="metric-card animate-fade-in-up mt-4" style={{ borderTop: "3px solid #3B82F6" }}>
                    <h3 className="font-bold mb-4" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Sector Allocation by Holdings Value</h3>
                    <div className="flex items-start gap-8 flex-wrap">
                      {/* Donut chart */}
                      <svg viewBox="0 0 280 280" className="sector-donut-svg">
                        {slices.map((sl, i) => (
                          <path key={i} d={sl.d} fill={sl.color} stroke="var(--color-bg-card)" strokeWidth={2} opacity={0.9} />
                        ))}
                        {/* Centre label */}
                        <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 11, fill: "var(--color-text-muted)" }}>Total</text>
                        <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 13, fontWeight: 700, fill: "var(--color-text-primary)" }}>{fmtCr(totalVal)}</text>
                      </svg>
                      {/* Legend */}
                      <div style={{ flex: 1, minWidth: 200, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", alignContent: "start" }}>
                        {slices.map((sl, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: sl.color, flexShrink: 0 }} />
                            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sl.sec}</span>
                            <span style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", fontWeight: 600 }}>{(sl.pct * 100).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                  { label: "1Y Upside", render: (s: EnrichedStock) => <span className={pctColor(s.upside1YCalc)} style={{ fontFamily: "var(--font-mono)" }}>{s.upside1YCalc != null ? fmtPct(s.upside1YCalc) : "—"}</span> },
                  { label: "2Y Upside", render: (s: EnrichedStock) => <span className={pctColor(s.upside2YCalc)} style={{ fontFamily: "var(--font-mono)" }}>{s.upside2YCalc != null ? fmtPct(s.upside2YCalc) : "—"}</span> },
                ]},
                { title: "Valuation Multiples", rows: [
                  { label: "PE (Bear)", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-negative)" }}>{s.bear_pe ? `${s.bear_pe.toFixed(1)}x` : "—"}</span> },
                  { label: "PE (Base)", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{s.base_pe ? `${s.base_pe.toFixed(1)}x` : "—"}</span> },
                  { label: "PE (Bull)", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-positive)" }}>{s.bull_pe ? `${s.bull_pe.toFixed(1)}x` : "—"}</span> },
                  { label: "PE +2SD", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>{s.base_pe_2sd ? `${s.base_pe_2sd.toFixed(1)}x` : "—"}</span> },
                  { label: "PB (Bear)", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-negative)" }}>{s.bear_pb ? `${s.bear_pb.toFixed(1)}x` : "—"}</span> },
                  { label: "PB (Base)", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{s.base_pb ? `${s.base_pb.toFixed(1)}x` : "—"}</span> },
                  { label: "PB (Bull)", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-positive)" }}>{s.bull_pb ? `${s.bull_pb.toFixed(1)}x` : "—"}</span> },
                  { label: "PB +2SD", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>{s.base_pb_2sd ? `${s.base_pb_2sd.toFixed(1)}x` : "—"}</span> },
                  { label: "EV/EBITDA (Bear)", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-negative)" }}>{s.bear_evebitda ? `${s.bear_evebitda.toFixed(1)}x` : "—"}</span> },
                  { label: "EV/EBITDA (Base)", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{s.base_evebitda ? `${s.base_evebitda.toFixed(1)}x` : "—"}</span> },
                  { label: "EV/EBITDA (Bull)", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-positive)" }}>{s.bull_evebitda ? `${s.bull_evebitda.toFixed(1)}x` : "—"}</span> },
                  { label: "EV/EBITDA +2SD", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>{s.base_evebitda_2sd ? `${s.base_evebitda_2sd.toFixed(1)}x` : "—"}</span> },
                ]},
                { title: "Fundamentals", rows: [
                  { label: "Conviction", render: (s: EnrichedStock) => <span className="font-semibold">{s.conviction ?? "—"}</span> },
                  { label: "CDS", render: (s: EnrichedStock) => <span className="inline-block px-1.5 py-0.5 rounded font-bold" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", background: s.cds != null ? (s.cds >= 80 ? "rgba(5,150,105,0.2)" : s.cds >= 60 ? "rgba(52,211,153,0.15)" : s.cds >= 40 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)") : "transparent", color: s.cds != null ? (s.cds >= 80 ? "#059669" : s.cds >= 60 ? "#10B981" : s.cds >= 40 ? "#D97706" : "#EF4444") : "var(--color-text-muted)" }}>{s.cds ?? "—"}</span> },
                  { label: "Quality", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)" }}>{s.qualityScore != null ? s.qualityScore.toFixed(1) : "—"}</span> },
                  { label: "Fwd PE FY27", render: (s: EnrichedStock) => <span style={{ fontFamily: "var(--font-mono)" }}>{s.forwardPE_fy27 ? `${s.forwardPE_fy27.toFixed(1)}x` : "—"}</span> },
                  { label: "Score", render: (s: EnrichedStock) => <span className="font-semibold" style={{ fontFamily: "var(--font-mono)" }}>{s.score ?? "—"}</span> },
                  { label: "VA / SA", render: (s: EnrichedStock) => <span style={{ color: "var(--color-text-secondary)" }}>{s.vp || "—"} / {s.sa || "—"}</span> },
                ]},
                { title: "Market Data (Live)", rows: [
                  { label: "Market Cap", render: (s: EnrichedStock) => { const q = quotes[s.tikr]; const mc = q?.marketCap; if (!mc) return <span style={{ color: "var(--color-text-muted)" }}>—</span>; const cr = mc / 10000000; return <span style={{ fontFamily: "var(--font-mono)" }}>{cr >= 1000 ? `₹${(cr/100).toFixed(1)}K Cr` : `₹${cr.toFixed(0)} Cr`}</span>; }},
                  { label: "52W High", render: (s: EnrichedStock) => { const q = quotes[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{q?.fiftyTwoWeekHigh ? `₹${fmt(q.fiftyTwoWeekHigh, 1)}` : "—"}</span>; }},
                  { label: "52W Low", render: (s: EnrichedStock) => { const q = quotes[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{q?.fiftyTwoWeekLow ? `₹${fmt(q.fiftyTwoWeekLow, 1)}` : "—"}</span>; }},
                  { label: "Trailing PE", render: (s: EnrichedStock) => { const q = quotes[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{q?.trailingPE ? `${q.trailingPE.toFixed(1)}x` : "—"}</span>; }},
                  { label: "Forward PE", render: (s: EnrichedStock) => { const q = quotes[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{q?.forwardPE ? `${q.forwardPE.toFixed(1)}x` : "—"}</span>; }},
                  { label: "P/B", render: (s: EnrichedStock) => { const q = quotes[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{q?.priceToBook ? `${q.priceToBook.toFixed(1)}x` : "—"}</span>; }},
                  { label: "50-Day MA", render: (s: EnrichedStock) => { const q = quotes[s.tikr]; const above = q?.fiftyDayAverage && s.liveCmp ? s.liveCmp > q.fiftyDayAverage : null; return <span style={{ fontFamily: "var(--font-mono)", color: above === true ? "var(--color-positive)" : above === false ? "var(--color-negative)" : undefined }}>{q?.fiftyDayAverage ? `₹${fmt(q.fiftyDayAverage, 1)}` : "—"}</span>; }},
                  { label: "200-Day MA", render: (s: EnrichedStock) => { const q = quotes[s.tikr]; const above = q?.twoHundredDayAverage && s.liveCmp ? s.liveCmp > q.twoHundredDayAverage : null; return <span style={{ fontFamily: "var(--font-mono)", color: above === true ? "var(--color-positive)" : above === false ? "var(--color-negative)" : undefined }}>{q?.twoHundredDayAverage ? `₹${fmt(q.twoHundredDayAverage, 1)}` : "—"}</span>; }},
                  { label: "Div Yield", render: (s: EnrichedStock) => { const q = quotes[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{q?.dividendYield ? `${(q.dividendYield * 100).toFixed(2)}%` : "—"}</span>; }},
                  { label: "Beta", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.beta ? e.beta.toFixed(2) : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "ROE", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.returnOnEquity != null ? `${(e.returnOnEquity * 100).toFixed(1)}%` : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "D/E", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.debtToEquity != null ? e.debtToEquity.toFixed(1) : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "Analyst Target", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.targetMeanPrice ? `₹${fmt(e.targetMeanPrice, 0)}` : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "Recommendation", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; if (!e?.recommendationKey) return <span style={{ color: "var(--color-text-muted)" }}>{enrichmentLoading[s.tikr] ? "…" : "—"}</span>; const key = e.recommendationKey.toUpperCase(); const color = key.includes("BUY") ? "var(--color-positive)" : key.includes("SELL") ? "var(--color-negative)" : "var(--color-warning)"; return <span className="font-semibold" style={{ color }}>{key}</span>; }},
                ]},
                { title: "Profitability & Growth", rows: [
                  { label: "Revenue Growth", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span className={pctColor(e?.revenueGrowth ?? null)} style={{ fontFamily: "var(--font-mono)" }}>{e?.revenueGrowth != null ? `${(e.revenueGrowth * 100).toFixed(1)}%` : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "Earnings Growth", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span className={pctColor(e?.earningsGrowth ?? null)} style={{ fontFamily: "var(--font-mono)" }}>{e?.earningsGrowth != null ? `${(e.earningsGrowth * 100).toFixed(1)}%` : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "EBITDA Margin", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.ebitdaMargins != null ? `${(e.ebitdaMargins * 100).toFixed(1)}%` : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "Operating Margin", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.operatingMargins != null ? `${(e.operatingMargins * 100).toFixed(1)}%` : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "Profit Margin", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.profitMargins != null ? `${(e.profitMargins * 100).toFixed(1)}%` : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "ROA", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.returnOnAssets != null ? `${(e.returnOnAssets * 100).toFixed(1)}%` : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "PEG Ratio", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.pegRatio != null ? e.pegRatio.toFixed(2) : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "Current Ratio", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.currentRatio != null ? e.currentRatio.toFixed(2) : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "Free Cash Flow", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.freeCashflow ? fmtCr(e.freeCashflow) : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
                  { label: "Enterprise Value", render: (s: EnrichedStock) => { const e = enrichmentCache[s.tikr]; return <span style={{ fontFamily: "var(--font-mono)" }}>{e?.enterpriseValue ? fmtCr(e.enterpriseValue) : enrichmentLoading[s.tikr] ? "…" : "—"}</span>; }},
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

          {/* Universe Filter */}
          <div className="flex items-center gap-2">
            {(["all", "holdings"] as const).map(v => (
              <button key={v} className="scatter-pill" style={pillStyle(dsScope === v)} onClick={() => setDsScope(v)}>
                {v === "holdings" ? "Holdings Only" : "Full Universe"}
              </button>
            ))}
            {dsScope === "holdings" && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Showing {holdingTikrs.size} holdings</span>}
          </div>

          {/* Threshold Settings */}
          <div className="metric-card animate-fade-in-up" style={{ padding: showThresholdSettings ? undefined : "8px 16px" }}>
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowThresholdSettings(p => !p)}>
              <h3 className="font-bold" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
                <span style={{ marginRight: 6, fontSize: "var(--text-xs)" }}>{showThresholdSettings ? "▾" : "▸"}</span>
                Zone Thresholds
              </h3>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Buy: {buyZoneLow}% to {buyZoneHigh}% | Base: {baseZoneLow}% to {baseZoneHigh}% | Sell: {sellZoneLow}% to {sellZoneHigh}%</span>
            </div>
            {showThresholdSettings && (
              <div className="grid grid-cols-3 gap-6 mt-4">
                <div>
                  <p className="mb-2 font-semibold" style={{ fontSize: "var(--text-xs)", color: "var(--color-positive)" }}>Buy Zone (Upside to Bear)</p>
                  <div className="flex items-center gap-3 mb-1">
                    <label style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", minWidth: 60 }}>Low: {buyZoneLow}%</label>
                    <input type="range" min={-30} max={0} value={buyZoneLow} onChange={e => setBuyZoneLow(Number(e.target.value))} className="flex-1" style={{ accentColor: "var(--color-positive)" }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <label style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", minWidth: 60 }}>High: {buyZoneHigh}%</label>
                    <input type="range" min={0} max={200} value={buyZoneHigh} onChange={e => setBuyZoneHigh(Number(e.target.value))} className="flex-1" style={{ accentColor: "var(--color-positive)" }} />
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-semibold" style={{ fontSize: "var(--text-xs)", color: "var(--color-negative)" }}>Sell Zone (Upside to Bull)</p>
                  <div className="flex items-center gap-3 mb-1">
                    <label style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", minWidth: 60 }}>Low: {sellZoneLow}%</label>
                    <input type="range" min={-20} max={0} value={sellZoneLow} onChange={e => setSellZoneLow(Number(e.target.value))} className="flex-1" style={{ accentColor: "var(--color-negative)" }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <label style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", minWidth: 60 }}>High: {sellZoneHigh}%</label>
                    <input type="range" min={0} max={200} value={sellZoneHigh} onChange={e => setSellZoneHigh(Number(e.target.value))} className="flex-1" style={{ accentColor: "var(--color-negative)" }} />
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-semibold" style={{ fontSize: "var(--text-xs)", color: "#3B82F6" }}>Base Zone (Upside to Base)</p>
                  <div className="flex items-center gap-3 mb-1">
                    <label style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", minWidth: 60 }}>Low: {baseZoneLow}%</label>
                    <input type="range" min={-30} max={0} value={baseZoneLow} onChange={e => setBaseZoneLow(Number(e.target.value))} className="flex-1" style={{ accentColor: "#3B82F6" }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <label style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", minWidth: 60 }}>High: {baseZoneHigh}%</label>
                    <input type="range" min={0} max={200} value={baseZoneHigh} onChange={e => setBaseZoneHigh(Number(e.target.value))} className="flex-1" style={{ accentColor: "#3B82F6" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Buy & Sell Zones */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card animate-fade-in-up delay-1" style={{ borderTop: "3px solid var(--color-positive)" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Buy Zone — CMP Near Bear <span className="pill pill-green ml-2">{decisionData.buyZone.length}</span></h3>
              {decisionData.buyZone.length === 0 ? <p className="py-4" style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>None currently</p> : (
                <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><Th sortCol={zoneSorts.buy?.col || ""} sortDir={zoneSorts.buy?.dir || "desc"} onSort={c => toggleZoneSort("buy", c)} col="companyShort" label="Company" /><Th sortCol={zoneSorts.buy?.col || ""} sortDir={zoneSorts.buy?.dir || "desc"} onSort={c => toggleZoneSort("buy", c)} col="liveCmp" label="CMP" /><Th sortCol={zoneSorts.buy?.col || ""} sortDir={zoneSorts.buy?.dir || "desc"} onSort={c => toggleZoneSort("buy", c)} col="bear_current" label="Bear" /><Th sortCol={zoneSorts.buy?.col || ""} sortDir={zoneSorts.buy?.dir || "desc"} onSort={c => toggleZoneSort("buy", c)} col="upsideBearCalc" label="↑ Bear" /><Th sortCol={zoneSorts.buy?.col || ""} sortDir={zoneSorts.buy?.dir || "desc"} onSort={c => toggleZoneSort("buy", c)} col="upsideBaseCalc" label="↑ Base" /></tr></thead>
                  <tbody>{sortZoneData("buy", decisionData.buyZone).map((s, i) => (<tr key={i} className="row-buy-zone cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.bear_current, 0)}</td><td><UpsideBar value={(s.upsideBearCalc || 0) * 100} /></td><td><UpsideBar value={(s.upsideBaseCalc || 0) * 100} /></td></tr>))}</tbody></table></div>
              )}
            </div>
            <div className="metric-card animate-fade-in-up delay-2" style={{ borderTop: "3px solid var(--color-negative)" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Take Profit — CMP Near Bull <span className="pill pill-red ml-2">{decisionData.sellZone.length}</span></h3>
              {decisionData.sellZone.length === 0 ? <p className="py-4" style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>None currently</p> : (
                <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><Th sortCol={zoneSorts.sell?.col || ""} sortDir={zoneSorts.sell?.dir || "desc"} onSort={c => toggleZoneSort("sell", c)} col="companyShort" label="Company" /><Th sortCol={zoneSorts.sell?.col || ""} sortDir={zoneSorts.sell?.dir || "desc"} onSort={c => toggleZoneSort("sell", c)} col="liveCmp" label="CMP" /><Th sortCol={zoneSorts.sell?.col || ""} sortDir={zoneSorts.sell?.dir || "desc"} onSort={c => toggleZoneSort("sell", c)} col="bull_current" label="Bull" /><Th sortCol={zoneSorts.sell?.col || ""} sortDir={zoneSorts.sell?.dir || "desc"} onSort={c => toggleZoneSort("sell", c)} col="upsideBullCalc" label="Upside to Bull" /></tr></thead>
                  <tbody>{sortZoneData("sell", decisionData.sellZone).map((s, i) => (<tr key={i} className="row-sell-zone cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.bull_current, 0)}</td><td><UpsideBar value={(s.upsideBullCalc || 0) * 100} /></td></tr>))}</tbody></table></div>
              )}
            </div>
          </div>

          {/* Overvalued & High Conviction */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid #DC2626" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Overvalued — CMP Above Bull <span className="pill pill-red ml-2">{decisionData.overvalued.length}</span></h3>
              {decisionData.overvalued.length === 0 ? <p className="py-4" style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>None currently</p> : (
                <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><Th sortCol={zoneSorts.overvalued?.col || ""} sortDir={zoneSorts.overvalued?.dir || "desc"} onSort={c => toggleZoneSort("overvalued", c)} col="companyShort" label="Company" /><Th sortCol={zoneSorts.overvalued?.col || ""} sortDir={zoneSorts.overvalued?.dir || "desc"} onSort={c => toggleZoneSort("overvalued", c)} col="liveCmp" label="CMP" /><Th sortCol={zoneSorts.overvalued?.col || ""} sortDir={zoneSorts.overvalued?.dir || "desc"} onSort={c => toggleZoneSort("overvalued", c)} col="bull_current" label="Bull" /><Th sortCol={zoneSorts.overvalued?.col || ""} sortDir={zoneSorts.overvalued?.dir || "desc"} onSort={c => toggleZoneSort("overvalued", c)} col="upsideBullCalc" label="% Above Bull" /></tr></thead>
                  <tbody>{sortZoneData("overvalued", decisionData.overvalued).map((s, i) => (<tr key={i} className="cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.bull_current, 0)}</td><td style={{ fontFamily: "var(--font-mono)", color: "var(--color-negative)", fontWeight: 600 }}>{s.upsideBullCalc != null ? `${(s.upsideBullCalc * 100).toFixed(1)}%` : "—"}</td></tr>))}</tbody></table></div>
              )}
            </div>
            <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid #3B82F6" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>CMP Near Base <span className="pill ml-2" style={{ background: "rgba(59,130,246,0.15)", color: "#3B82F6" }}>{decisionData.cmpNearBase.length}</span></h3>
              {decisionData.cmpNearBase.length === 0 ? <p className="py-4" style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>None currently</p> : (
                <div className="overflow-auto max-h-[300px]"><table className="data-table w-full"><thead><tr><Th sortCol={zoneSorts.nearBase?.col || ""} sortDir={zoneSorts.nearBase?.dir || "desc"} onSort={c => toggleZoneSort("nearBase", c)} col="companyShort" label="Company" /><Th sortCol={zoneSorts.nearBase?.col || ""} sortDir={zoneSorts.nearBase?.dir || "desc"} onSort={c => toggleZoneSort("nearBase", c)} col="liveCmp" label="CMP" /><Th sortCol={zoneSorts.nearBase?.col || ""} sortDir={zoneSorts.nearBase?.dir || "desc"} onSort={c => toggleZoneSort("nearBase", c)} col="base_current" label="Base" /><Th sortCol={zoneSorts.nearBase?.col || ""} sortDir={zoneSorts.nearBase?.dir || "desc"} onSort={c => toggleZoneSort("nearBase", c)} col="upsideBaseCalc" label="Upside to Base" /></tr></thead>
                  <tbody>{sortZoneData("nearBase", decisionData.cmpNearBase).map((s, i) => (
                    <tr key={i} className="cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.base_current, 0)}</td><td><UpsideBar value={(s.upsideBaseCalc || 0) * 100} /></td></tr>
                  ))}</tbody></table></div>
              )}
            </div>
          </div>

          {/* Upside & Downside */}
          <div className="grid grid-cols-2 gap-4">
            <div className="metric-card animate-fade-in-up delay-3" style={{ borderTop: "3px solid var(--color-accent-blue)" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Top 10 — Highest Upside to Base</h3>
              <div className="overflow-auto max-h-[340px]"><table className="data-table w-full"><thead><tr><th>#</th><Th sortCol={zoneSorts.bestUp?.col || ""} sortDir={zoneSorts.bestUp?.dir || "desc"} onSort={c => toggleZoneSort("bestUp", c)} col="companyShort" label="Company" /><Th sortCol={zoneSorts.bestUp?.col || ""} sortDir={zoneSorts.bestUp?.dir || "desc"} onSort={c => toggleZoneSort("bestUp", c)} col="sector" label="Sector" /><Th sortCol={zoneSorts.bestUp?.col || ""} sortDir={zoneSorts.bestUp?.dir || "desc"} onSort={c => toggleZoneSort("bestUp", c)} col="liveCmp" label="CMP" /><Th sortCol={zoneSorts.bestUp?.col || ""} sortDir={zoneSorts.bestUp?.dir || "desc"} onSort={c => toggleZoneSort("bestUp", c)} col="base_current" label="Base" /><Th sortCol={zoneSorts.bestUp?.col || ""} sortDir={zoneSorts.bestUp?.dir || "desc"} onSort={c => toggleZoneSort("bestUp", c)} col="upsideBaseCalc" label="Upside" /></tr></thead>
                <tbody>{sortZoneData("bestUp", decisionData.bestUpside).map((s, i) => (<tr key={i} className="cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>{i + 1}</td><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{s.sector}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.base_current, 0)}</td><td><UpsideBar value={(s.upsideBaseCalc || 0) * 100} /></td></tr>))}</tbody></table></div>
            </div>
            <div className="metric-card animate-fade-in-up delay-4" style={{ borderTop: "3px solid var(--color-warning)" }}>
              <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Top 10 — Largest Downside to Bear</h3>
              <div className="overflow-auto max-h-[340px]"><table className="data-table w-full"><thead><tr><th>#</th><Th sortCol={zoneSorts.worstDown?.col || ""} sortDir={zoneSorts.worstDown?.dir || "desc"} onSort={c => toggleZoneSort("worstDown", c)} col="companyShort" label="Company" /><Th sortCol={zoneSorts.worstDown?.col || ""} sortDir={zoneSorts.worstDown?.dir || "desc"} onSort={c => toggleZoneSort("worstDown", c)} col="sector" label="Sector" /><Th sortCol={zoneSorts.worstDown?.col || ""} sortDir={zoneSorts.worstDown?.dir || "desc"} onSort={c => toggleZoneSort("worstDown", c)} col="liveCmp" label="CMP" /><Th sortCol={zoneSorts.worstDown?.col || ""} sortDir={zoneSorts.worstDown?.dir || "desc"} onSort={c => toggleZoneSort("worstDown", c)} col="bear_current" label="Bear" /><Th sortCol={zoneSorts.worstDown?.col || ""} sortDir={zoneSorts.worstDown?.dir || "desc"} onSort={c => toggleZoneSort("worstDown", c)} col="upsideBearCalc" label="Downside" /></tr></thead>
                <tbody>{sortZoneData("worstDown", decisionData.worstDownside).map((s, i) => (<tr key={i} className="cursor-pointer" onClick={() => setDetailStock(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetailStock(s)}><td style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>{i + 1}</td><td className="font-semibold" style={{ whiteSpace: "normal", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{s.companyShort}</td><td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{s.sector}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.liveCmp, 0)}</td><td style={{ fontFamily: "var(--font-mono)" }}>₹{fmt(s.bear_current, 0)}</td><td><UpsideBar value={(s.upsideBearCalc || 0) * 100} /></td></tr>))}</tbody></table></div>
            </div>
          </div>

          {/* Sector Allocation */}
          <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid var(--color-accent-blue)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Sector Allocation & Avg Upside</h3>
              <div className="flex gap-1">
                {(["sector", "subsector"] as const).map(v => (
                  <button key={v} className="scatter-pill" style={pillStyle(sectorGroupBy === v)} onClick={() => setSectorGroupBy(v)}>
                    {v === "sector" ? "Sectors" : "Subsectors"}
                  </button>
                ))}
              </div>
            </div>
            <SectorBar sectors={sectorDisplayData} groupBy={sectorGroupBy} sourceStocks={dsScope === "holdings" ? enrichedStocks.filter(s => holdingTikrs.has(s.tikr)) : enrichedStocks} onSelectStock={setDetailStock} />
          </div>

          {/* Risk/Reward Scatter Chart */}
          <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid var(--color-accent-blue)" }}>
            <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Risk / Reward Scatter — Base Upside vs Bear Downside</h3>
            {/* Sector filter pills */}
            <div className="flex flex-wrap gap-1 mb-2">
              <button className="scatter-pill" style={{ background: scatterSectorFilters.size === 0 ? "var(--color-accent-blue)" : "var(--color-bg-hover)", color: scatterSectorFilters.size === 0 ? "#fff" : "var(--color-text-muted)" }} onClick={() => setScatterSectorFilters(new Set())}>All Sectors</button>
              {Object.entries(sectorColors).filter(([sec]) => enrichedStocks.some(s => s.sector === sec)).map(([sec, color]) => {
                const active = scatterSectorFilters.size === 0 || scatterSectorFilters.has(sec);
                return <button key={sec} className="scatter-pill" style={{ opacity: active ? 1 : 0.35, background: active ? "var(--color-bg-hover)" : "transparent", borderColor: active ? color : "var(--color-border)" }} onClick={() => { const nf = new Set(scatterSectorFilters); if (scatterSectorFilters.size === 0) { nf.add(sec); } else if (nf.has(sec)) { nf.delete(sec); if (nf.size === 0) { setScatterSectorFilters(new Set()); return; } } else { nf.add(sec); } setScatterSectorFilters(nf); }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", marginRight: 4 }} />{sec}</button>;
              })}
            </div>
            {/* Conviction filter pills */}
            <div className="flex flex-wrap gap-1 mb-3">
              <button className="scatter-pill" style={{ background: scatterConvictionFilters.size === 0 ? "var(--color-accent-blue)" : "var(--color-bg-hover)", color: scatterConvictionFilters.size === 0 ? "#fff" : "var(--color-text-muted)" }} onClick={() => setScatterConvictionFilters(new Set())}>All Convictions</button>
              {[5, 4, 3, 2, 1].map(c => {
                const active = scatterConvictionFilters.size === 0 || scatterConvictionFilters.has(c);
                return <button key={c} className="scatter-pill" style={{ opacity: active ? 1 : 0.35, background: active ? "var(--color-bg-hover)" : "transparent" }} onClick={() => { const nf = new Set(scatterConvictionFilters); if (scatterConvictionFilters.size === 0) { nf.add(c); } else if (nf.has(c)) { nf.delete(c); if (nf.size === 0) { setScatterConvictionFilters(new Set()); return; } } else { nf.add(c); } setScatterConvictionFilters(nf); }}>Conv {c}</button>;
              })}
            </div>
            <div style={{ position: "relative" }}>
              {(() => {
                const W = typeof window !== "undefined" && window.innerWidth < 768 ? window.innerWidth - 32 : 900, H = W < 600 ? 300 : 500, PAD = { t: 20, r: 30, b: 50, l: 60 };
                const allPts = enrichedStocks.filter(s => s.upsideBaseCalc != null && s.upsideBearCalc != null && s.liveCmp);
                const pts = allPts.filter(s => {
                  if (scatterSectorFilters.size > 0 && !scatterSectorFilters.has(s.sector || "Other")) return false;
                  if (scatterConvictionFilters.size > 0 && !scatterConvictionFilters.has(s.conviction || 0)) return false;
                  return true;
                });
                if (allPts.length === 0) return <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", padding: 20 }}>No data</p>;
                // Use allPts for axis scale so axes stay stable when filtering
                const xVals = allPts.map(s => (s.upsideBaseCalc || 0) * 100);
                const yVals = allPts.map(s => (s.upsideBearCalc || 0) * 100);
                const xMin = Math.min(-10, ...xVals) - 5, xMax = Math.max(10, ...xVals) + 5;
                const yMin = Math.min(-50, ...yVals) - 5, yMax = Math.max(10, ...yVals) + 5;
                const xScale = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
                const yScale = (v: number) => H - PAD.b - ((v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
                const hoveredStock = scatterHover ? enrichedStocks.find(s => s.tikr === scatterHover.tikr) : null;
                const xTicks: number[] = []; for (let x = Math.ceil(xMin / 20) * 20; x <= xMax; x += 20) xTicks.push(x);
                const yTicks: number[] = []; for (let y = Math.ceil(yMin / 20) * 20; y <= yMax; y += 20) yTicks.push(y);

                return (
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", maxHeight: 500, cursor: "crosshair" }}>
                    {xTicks.map(x => <line key={`gx${x}`} x1={xScale(x)} y1={PAD.t} x2={xScale(x)} y2={H - PAD.b} stroke="var(--color-border-subtle)" strokeWidth={0.5} strokeDasharray={x === 0 ? "none" : "4,4"} />)}
                    {yTicks.map(y => <line key={`gy${y}`} x1={PAD.l} y1={yScale(y)} x2={W - PAD.r} y2={yScale(y)} stroke="var(--color-border-subtle)" strokeWidth={0.5} strokeDasharray={y === 0 ? "none" : "4,4"} />)}
                    {xMin <= 0 && xMax >= 0 && <line x1={xScale(0)} y1={PAD.t} x2={xScale(0)} y2={H - PAD.b} stroke="var(--color-text-muted)" strokeWidth={1} />}
                    {yMin <= 0 && yMax >= 0 && <line x1={PAD.l} y1={yScale(0)} x2={W - PAD.r} y2={yScale(0)} stroke="var(--color-text-muted)" strokeWidth={1} />}
                    {xTicks.map(x => <text key={`lx${x}`} x={xScale(x)} y={H - PAD.b + 18} textAnchor="middle" fill="var(--color-text-muted)" style={{ fontSize: 10 }}>{x}%</text>)}
                    {yTicks.map(y => <text key={`ly${y}`} x={PAD.l - 8} y={yScale(y) + 3} textAnchor="end" fill="var(--color-text-muted)" style={{ fontSize: 10 }}>{y}%</text>)}
                    <text x={W / 2} y={H - 4} textAnchor="middle" fill="var(--color-text-secondary)" style={{ fontSize: 11, fontWeight: 600 }}>Upside to Base (%)</text>
                    <text x={14} y={H / 2} textAnchor="middle" fill="var(--color-text-secondary)" style={{ fontSize: 11, fontWeight: 600 }} transform={`rotate(-90, 14, ${H / 2})`}>Downside to Bear (%)</text>
                    {xMin <= 0 && yMax >= 0 && <text x={xScale(xMin) + 8} y={yScale(yMax) + 14} fill="var(--color-text-muted)" style={{ fontSize: 9, opacity: 0.6 }}>Low Upside + Low Risk</text>}
                    {xMax >= 0 && yMax >= 0 && <text x={xScale(xMax) - 8} y={yScale(yMax) + 14} textAnchor="end" fill="var(--color-positive)" style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>High Upside + Low Risk</text>}
                    {xMin <= 0 && yMin <= 0 && <text x={xScale(xMin) + 8} y={yScale(yMin) - 6} fill="var(--color-negative)" style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>Low Upside + High Risk</text>}
                    {pts.map(s => {
                      const cx = xScale((s.upsideBaseCalc || 0) * 100);
                      const cy = yScale((s.upsideBearCalc || 0) * 100);
                      const r = Math.max(4, Math.min(16, (s.conviction || 1) * 3));
                      const color = sectorColors[s.sector || "Other"] || "#6B7280";
                      const isHovered = scatterHover?.tikr === s.tikr;
                      return (
                        <circle key={s.tikr} cx={cx} cy={cy} r={isHovered ? r + 2 : r} fill={color} fillOpacity={isHovered ? 0.95 : 0.7} stroke={isHovered ? "var(--color-text-primary)" : "none"} strokeWidth={isHovered ? 2 : 0}
                          style={{ cursor: "pointer", transition: "r 0.15s, fill-opacity 0.15s" }}
                          onMouseEnter={() => setScatterHover({ tikr: s.tikr, x: cx, y: cy })}
                          onMouseLeave={() => setScatterHover(null)}
                          onClick={() => setDetailStock(s)}
                        />
                      );
                    })}
                    {hoveredStock && scatterHover && (
                      <g>
                        <rect x={scatterHover.x + 12} y={scatterHover.y - 48} width={220} height={44} rx={6} fill="var(--color-bg-card)" stroke="var(--color-border)" strokeWidth={1} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))" }} />
                        <text x={scatterHover.x + 20} y={scatterHover.y - 30} fill="var(--color-text-primary)" style={{ fontSize: 11, fontWeight: 700 }}>{hoveredStock.companyShort}</text>
                        <text x={scatterHover.x + 20} y={scatterHover.y - 16} fill="var(--color-text-secondary)" style={{ fontSize: 10 }}>CMP ₹{fmt(hoveredStock.liveCmp, 0)} | Base ↑{((hoveredStock.upsideBaseCalc || 0) * 100).toFixed(1)}% | Bear ↓{((hoveredStock.upsideBearCalc || 0) * 100).toFixed(1)}%</text>
                      </g>
                    )}
                  </svg>
                );
              })()}
              <div className="flex items-center justify-between mt-2 px-2">
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Showing {(() => { const allPts = enrichedStocks.filter(s => s.upsideBaseCalc != null && s.upsideBearCalc != null && s.liveCmp); const filtered = allPts.filter(s => { if (scatterSectorFilters.size > 0 && !scatterSectorFilters.has(s.sector || "Other")) return false; if (scatterConvictionFilters.size > 0 && !scatterConvictionFilters.has(s.conviction || 0)) return false; return true; }); return `${filtered.length} of ${allPts.length}`; })()} stocks</span>
              </div>
            </div>
          </div>

          {/* ── 52-Week Range Position ── */}
          <div className="grid grid-cols-2 gap-4">
            {(() => {
              const withRange = enrichedStocks.filter(s => s.liveCmp && s.tikr && quotes[s.tikr]?.fiftyTwoWeekHigh && quotes[s.tikr]?.fiftyTwoWeekLow).map(s => {
                const q = quotes[s.tikr];
                const hi = q.fiftyTwoWeekHigh!, lo = q.fiftyTwoWeekLow!;
                const rangePct = hi > lo ? ((s.liveCmp! - lo) / (hi - lo)) * 100 : 50;
                return { ...s, rangePct, hi52: hi, lo52: lo };
              });
              const nearLow = [...withRange].sort((a, b) => a.rangePct - b.rangePct).slice(0, 10);
              const nearHigh = [...withRange].sort((a, b) => b.rangePct - a.rangePct).slice(0, 10);
              return (<>
                <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid var(--color-positive)" }}>
                  <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Near 52-Week Low <span className="pill pill-green" style={{ marginLeft: 6 }}>{nearLow.length}</span></h3>
                  <div className="overflow-auto max-h-[320px]"><table className="data-table w-full"><thead><tr><th>Stock</th><th>CMP</th><th>52W Low</th><th>52W High</th><th>Position</th></tr></thead>
                    <tbody>{nearLow.map(s => (
                      <tr key={s.tikr} className="cursor-pointer" onClick={() => setDetailStock(s)}>
                        <td className="font-semibold" style={{ fontSize: "var(--text-xs)" }}>{s.companyShort}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.liveCmp, 0)}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.lo52, 0)}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.hi52, 0)}</td>
                        <td style={{ minWidth: 100 }}>
                          <div className="flex items-center gap-2">
                            <div className="range-bar-track flex-1"><div className="range-bar-fill" style={{ width: `${Math.max(2, Math.min(98, s.rangePct))}%`, background: s.rangePct < 15 ? "var(--color-positive)" : s.rangePct > 85 ? "var(--color-warning)" : "var(--color-accent-blue)" }} /><div className="range-bar-marker" style={{ left: `${Math.max(2, Math.min(98, s.rangePct))}%` }} /></div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: s.rangePct < 15 ? "var(--color-positive)" : "var(--color-text-muted)", minWidth: 28 }}>{s.rangePct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}</tbody></table></div>
                </div>
                <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid var(--color-warning)" }}>
                  <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Near 52-Week High <span className="pill pill-amber" style={{ marginLeft: 6 }}>{nearHigh.length}</span></h3>
                  <div className="overflow-auto max-h-[320px]"><table className="data-table w-full"><thead><tr><th>Stock</th><th>CMP</th><th>52W Low</th><th>52W High</th><th>Position</th></tr></thead>
                    <tbody>{nearHigh.map(s => (
                      <tr key={s.tikr} className="cursor-pointer" onClick={() => setDetailStock(s)}>
                        <td className="font-semibold" style={{ fontSize: "var(--text-xs)" }}>{s.companyShort}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.liveCmp, 0)}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.lo52, 0)}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.hi52, 0)}</td>
                        <td style={{ minWidth: 100 }}>
                          <div className="flex items-center gap-2">
                            <div className="range-bar-track flex-1"><div className="range-bar-fill" style={{ width: `${Math.max(2, Math.min(98, s.rangePct))}%`, background: s.rangePct > 85 ? "var(--color-warning)" : s.rangePct < 15 ? "var(--color-positive)" : "var(--color-accent-blue)" }} /><div className="range-bar-marker" style={{ left: `${Math.max(2, Math.min(98, s.rangePct))}%` }} /></div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: s.rangePct > 85 ? "var(--color-warning)" : "var(--color-text-muted)", minWidth: 28 }}>{s.rangePct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}</tbody></table></div>
                </div>
              </>);
            })()}
          </div>

          {/* ── Moving Average Signals ── */}
          <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid #6366F1" }}>
            <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Moving Average Signals — 50 DMA & 200 DMA</h3>
            {(() => {
              const withMA = enrichedStocks.filter(s => s.liveCmp && s.tikr && quotes[s.tikr]?.fiftyDayAverage && quotes[s.tikr]?.twoHundredDayAverage).map(s => {
                const q = quotes[s.tikr];
                const above50 = s.liveCmp! > q.fiftyDayAverage!;
                const above200 = s.liveCmp! > q.twoHundredDayAverage!;
                return { ...s, above50, above200, ma50: q.fiftyDayAverage!, ma200: q.twoHundredDayAverage! };
              });
              const golden = withMA.filter(s => s.above50 && s.above200);
              const death = withMA.filter(s => !s.above50 && !s.above200);
              const above50Only = withMA.filter(s => s.above50 && !s.above200);
              const below50Only = withMA.filter(s => !s.above50 && s.above200);
              // Golden cross stocks in buy zone = strong signal
              const goldenBuy = golden.filter(s => decisionData.buyZone.some(b => b.tikr === s.tikr));
              return (
                <div>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="kpi-card kpi-positive animate-fade-in-up delay-1"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Golden Cross</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-positive)" }}>{golden.length}</p><p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Above both MAs</p></div>
                    <div className="kpi-card animate-fade-in-up delay-2"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Above 50 DMA</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{above50Only.length}</p><p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Above 50, below 200</p></div>
                    <div className="kpi-card animate-fade-in-up delay-3"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Below 50 DMA</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{below50Only.length}</p><p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Below 50, above 200</p></div>
                    <div className="kpi-card kpi-negative animate-fade-in-up delay-4"><p className="uppercase tracking-wide font-medium" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Death Cross</p><p className="font-bold mt-1" style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-mono)", color: "var(--color-negative)" }}>{death.length}</p><p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Below both MAs</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2" style={{ fontSize: "var(--text-xs)", color: "var(--color-positive)" }}>Golden Cross + Buy Zone ({goldenBuy.length})</h4>
                      {goldenBuy.length > 0 ? (
                        <table className="data-table w-full"><thead><tr><th>Stock</th><th>CMP</th><th>50 DMA</th><th>200 DMA</th><th>↑ Base</th></tr></thead>
                          <tbody>{goldenBuy.map(s => (
                            <tr key={s.tikr} className="cursor-pointer" onClick={() => setDetailStock(s)}>
                              <td className="font-semibold" style={{ fontSize: "var(--text-xs)" }}>{s.companyShort}</td>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.liveCmp, 0)}</td>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.ma50, 0)}</td>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.ma200, 0)}</td>
                              <td className="cell-green" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{s.upsideBaseCalc != null ? `+${(s.upsideBaseCalc * 100).toFixed(1)}%` : "—"}</td>
                            </tr>
                          ))}</tbody></table>
                      ) : <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>No stocks in both Golden Cross and Buy Zone</p>}
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2" style={{ fontSize: "var(--text-xs)", color: "var(--color-negative)" }}>Death Cross — Watch List ({death.length})</h4>
                      {death.length > 0 ? (
                        <div className="overflow-auto max-h-[200px]">
                        <table className="data-table w-full"><thead><tr><th>Stock</th><th>CMP</th><th>50 DMA</th><th>200 DMA</th><th>↓ Bear</th></tr></thead>
                          <tbody>{death.sort((a, b) => (a.upsideBearCalc || 0) - (b.upsideBearCalc || 0)).map(s => (
                            <tr key={s.tikr} className="cursor-pointer" onClick={() => setDetailStock(s)}>
                              <td className="font-semibold" style={{ fontSize: "var(--text-xs)" }}>{s.companyShort}</td>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.liveCmp, 0)}</td>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.ma50, 0)}</td>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>₹{fmt(s.ma200, 0)}</td>
                              <td className="cell-red" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{s.upsideBearCalc != null ? `${(s.upsideBearCalc * 100).toFixed(1)}%` : "—"}</td>
                            </tr>
                          ))}</tbody></table></div>
                      ) : <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>No Death Cross stocks</p>}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Concentration Risk Heatmap ── */}
          <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid #EC4899" }}>
            <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Concentration Risk — Sector × Conviction Heatmap</h3>
            {(() => {
              const convLevels = [5, 4, 3, 2, 1];
              const sectorList = Array.from(new Set(enrichedStocks.map(s => s.sector || "Other"))).sort();
              const grid: Record<string, Record<number, { count: number; value: number }>> = {};
              let maxVal = 0;
              sectorList.forEach(sec => {
                grid[sec] = {};
                convLevels.forEach(c => { grid[sec][c] = { count: 0, value: 0 }; });
              });
              enrichedStocks.forEach(s => {
                const sec = s.sector || "Other";
                const conv = s.conviction || 0;
                if (grid[sec] && grid[sec][conv]) {
                  grid[sec][conv].count++;
                  grid[sec][conv].value += s.holding_cash_lakhs || 0;
                  if (grid[sec][conv].value > maxVal) maxVal = grid[sec][conv].value;
                }
              });
              const sectorTotals: Record<string, { count: number; value: number }> = {};
              sectorList.forEach(sec => { sectorTotals[sec] = { count: 0, value: 0 }; convLevels.forEach(c => { sectorTotals[sec].count += grid[sec][c].count; sectorTotals[sec].value += grid[sec][c].value; }); });
              const convTotals: Record<number, { count: number; value: number }> = {};
              convLevels.forEach(c => { convTotals[c] = { count: 0, value: 0 }; sectorList.forEach(sec => { convTotals[c].count += grid[sec][c].count; convTotals[c].value += grid[sec][c].value; }); });

              return (
                <div className="overflow-auto">
                  <table style={{ borderCollapse: "separate", borderSpacing: 2, width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", padding: "4px 8px", textAlign: "left", fontWeight: 600 }}>Sector</th>
                        {convLevels.map(c => <th key={c} style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", padding: "4px 8px", textAlign: "center", fontWeight: 600 }}>Conv {c}</th>)}
                        <th style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", padding: "4px 8px", textAlign: "center", fontWeight: 700 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectorList.filter(sec => sectorTotals[sec].count > 0).sort((a, b) => sectorTotals[b].value - sectorTotals[a].value).map(sec => (
                        <tr key={sec}>
                          <td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-primary)", padding: "2px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>{sec}</td>
                          {convLevels.map(c => {
                            const cell = grid[sec][c];
                            const intensity = maxVal > 0 ? cell.value / maxVal : 0;
                            const bg = cell.count === 0 ? "transparent" : `rgba(99, 102, 241, ${0.08 + intensity * 0.6})`;
                            const textColor = intensity > 0.5 ? "#fff" : "var(--color-text-primary)";
                            return (
                              <td key={c} style={{ padding: 2 }}>
                                <div className="heatmap-cell" style={{ background: bg, color: cell.count > 0 ? textColor : "var(--color-text-muted)" }}>
                                  {cell.count > 0 ? <><span style={{ fontWeight: 700 }}>{cell.count}</span>{cell.value > 0 && <span style={{ fontSize: 9, opacity: 0.8 }}>{fmtLakhs(cell.value)}</span>}</> : "—"}
                                </div>
                              </td>
                            );
                          })}
                          <td style={{ padding: 2 }}>
                            <div className="heatmap-cell" style={{ background: "var(--color-bg-elevated)", fontWeight: 700 }}>
                              <span>{sectorTotals[sec].count}</span>
                              {sectorTotals[sec].value > 0 && <span style={{ fontSize: 9, opacity: 0.8 }}>{fmtLakhs(sectorTotals[sec].value)}</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-primary)", padding: "2px 8px", fontWeight: 700 }}>Total</td>
                        {convLevels.map(c => (
                          <td key={c} style={{ padding: 2 }}>
                            <div className="heatmap-cell" style={{ background: "var(--color-bg-elevated)", fontWeight: 700 }}>
                              <span>{convTotals[c].count}</span>
                              {convTotals[c].value > 0 && <span style={{ fontSize: 9, opacity: 0.8 }}>{fmtLakhs(convTotals[c].value)}</span>}
                            </div>
                          </td>
                        ))}
                        <td style={{ padding: 2 }}>
                          <div className="heatmap-cell" style={{ background: "var(--color-bg-elevated)", fontWeight: 700 }}>
                            <span>{enrichedStocks.length}</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* ── Tier 3A: Decision Journal ── */}
          <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid #8B5CF6" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
                Decision Journal <span className="pill" style={{ background: "#8B5CF620", color: "#8B5CF6", marginLeft: 8 }}>{journalEntries.length}</span>
              </h3>
              <div className="flex items-center gap-2">
                {(["all", "transitions", "annotations"] as const).map(f => (
                  <button key={f} className={`scatter-pill${journalFilter === f ? " active" : ""}`} onClick={() => setJournalFilter(f)} style={journalFilter === f ? { background: "#8B5CF620", color: "#8B5CF6", borderColor: "#8B5CF6" } : {}}>
                    {f === "all" ? "All" : f === "transitions" ? "Zone Changes" : "Notes"}
                  </button>
                ))}
                <button className="scatter-pill" onClick={() => { setShowJournalForm(p => !p); setJournalTikr(""); setJournalAnnotation(""); }} style={{ background: showJournalForm ? "#8B5CF620" : undefined, color: showJournalForm ? "#8B5CF6" : undefined }}>
                  + Add Note
                </button>
                <button className="scatter-pill" onClick={() => fetchJournal()} style={{ fontSize: 10 }}>↻</button>
              </div>
            </div>

            {/* Add annotation form */}
            {showJournalForm && (
              <div style={{ padding: "12px 16px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-md)", marginBottom: 12, border: "1px solid var(--color-border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <select value={journalTikr} onChange={e => setJournalTikr(e.target.value)} style={{ flex: "0 0 200px", padding: "6px 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "var(--text-sm)", background: "var(--color-bg-primary)", color: "var(--color-text-primary)" }}>
                    <option value="">Select stock...</option>
                    {enrichedStocks.filter(s => s.tikr).sort((a, b) => (a.companyShort || "").localeCompare(b.companyShort || "")).map(s => <option key={s.tikr} value={s.tikr}>{s.companyShort || s.tikr}</option>)}
                  </select>
                  <input value={journalAnnotation} onChange={e => setJournalAnnotation(e.target.value)} placeholder="Add your note or thesis update..." style={{ flex: 1, padding: "6px 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "var(--text-sm)", background: "var(--color-bg-primary)", color: "var(--color-text-primary)" }} />
                  <button disabled={!journalTikr || !journalAnnotation.trim()} onClick={async () => {
                    const stock = enrichedStocks.find(s => s.tikr === journalTikr);
                    await postJournalEntry({ tikr: journalTikr, event_type: "annotation", annotation: journalAnnotation.trim(), cmp_at_event: stock?.liveCmp, upside_base: stock?.upsideBaseCalc ? Math.round(stock.upsideBaseCalc * 10000) / 100 : undefined, cds_at_event: stock?.cds });
                    setJournalAnnotation(""); setShowJournalForm(false);
                    fetchJournal();
                  }} className="btn btn-primary btn-sm" style={{ background: "#8B5CF6", opacity: (!journalTikr || !journalAnnotation.trim()) ? 0.4 : 1 }}>Save</button>
                </div>
              </div>
            )}

            {/* Journal timeline */}
            {journalLoading ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>Loading journal...</div>
            ) : (() => {
              const filtered = journalEntries.filter(e => {
                if (journalFilter === "transitions") return e.event_type === "zone_enter" || e.event_type === "zone_exit";
                if (journalFilter === "annotations") return e.event_type === "annotation";
                return true;
              });
              if (filtered.length === 0) return (
                <div style={{ padding: 24, textAlign: "center" }}>
                  <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
                    {journalEntries.length === 0 ? "No journal entries yet. Zone transitions will be logged automatically." : "No entries match this filter."}
                  </p>
                </div>
              );
              // Group by date
              const byDate: Record<string, typeof filtered> = {};
              filtered.forEach(e => {
                const d = new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                if (!byDate[d]) byDate[d] = [];
                byDate[d].push(e);
              });
              return (
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  {Object.entries(byDate).map(([date, entries]) => (
                    <div key={date} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", fontWeight: 600, padding: "4px 0", borderBottom: "1px solid var(--color-border)", marginBottom: 6 }}>{date}</div>
                      {entries.map(e => {
                        const isEnter = e.event_type === "zone_enter";
                        const isExit = e.event_type === "zone_exit";
                        const isNote = e.event_type === "annotation";
                        const color = isEnter ? (e.zone_name === "buy" ? "var(--color-positive)" : e.zone_name === "overvalued" ? "var(--color-negative)" : "#F59E0B") : isExit ? "var(--color-text-muted)" : "#8B5CF6";
                        const icon = isEnter ? "→" : isExit ? "←" : "✎";
                        const zoneLabel = e.zone_name === "buy" ? "Buy Zone" : e.zone_name === "sell" ? "Take Profit" : e.zone_name === "overvalued" ? "Overvalued" : e.zone_name || "";
                        const stock = enrichedStocks.find(s => s.tikr === e.tikr);
                        const name = stock?.companyShort || e.tikr;
                        const time = new Date(e.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
                        return (
                          <div key={e.id} style={{ display: "flex", gap: 8, padding: "6px 8px", borderRadius: "var(--radius-md)", cursor: "pointer", transition: "background 0.15s" }} className="hover-highlight" onClick={() => { const s = enrichedStocks.find(x => x.tikr === e.tikr); if (s) setDetailStock(s); }}>
                            <div style={{ fontSize: 14, color, width: 20, textAlign: "center", flexShrink: 0, marginTop: 1 }}>{icon}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
                                <span className="font-semibold">{name}</span>
                                {(isEnter || isExit) && <span style={{ color }}> {isEnter ? "entered" : "exited"} {zoneLabel}</span>}
                                {isNote && <span style={{ color: "var(--color-text-muted)" }}> — note</span>}
                              </div>
                              {isNote && e.annotation && <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", marginTop: 2, lineHeight: 1.4 }}>{e.annotation}</div>}
                              <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>
                                {time}
                                {e.cmp_at_event != null && <span> · CMP ₹{fmt(e.cmp_at_event, 0)}</span>}
                                {e.upside_base != null && <span> · Base {e.upside_base > 0 ? "+" : ""}{fmt(e.upside_base, 1)}%</span>}
                                {e.cds_at_event != null && <span> · CDS {e.cds_at_event}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* ── Tier 2C: Catalyst Calendar & Analysis Freshness ── */}
          <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid #F59E0B" }}>
            <h3 className="font-bold mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Catalyst Calendar — Earnings, Ex-Dividend & Analysis Freshness</h3>
            {(() => {
              const now = new Date();
              type CalEvent = { tikr: string; name: string; type: "Earnings" | "Ex-Dividend" | "Stale Analysis"; date: Date; daysUntil: number; sector?: string };
              const events: CalEvent[] = [];
              // Enrichment-based events (earnings, ex-div)
              Object.entries(enrichmentCache).forEach(([tikr, data]) => {
                const stock = enrichedStocks.find(s => s.tikr === tikr);
                const name = stock?.companyShort || tikr;
                const sector = stock?.sector;
                if (data.earningsDate) {
                  const d = new Date(data.earningsDate);
                  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  if (diff >= -7 && diff <= 90) events.push({ tikr, name, type: "Earnings", date: d, daysUntil: diff, sector });
                }
                if (data.exDividendDate) {
                  const d = new Date(data.exDividendDate);
                  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  if (diff >= -7 && diff <= 90) events.push({ tikr, name, type: "Ex-Dividend", date: d, daysUntil: diff, sector });
                }
              });
              // last_updated staleness (from database.json — available on all stocks)
              const staleStocks = enrichedStocks.filter(s => {
                if (!s.last_updated) return true; // never updated = stale
                const d = new Date(s.last_updated);
                return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) > 60;
              }).sort((a, b) => {
                const da = a.last_updated ? new Date(a.last_updated).getTime() : 0;
                const db = b.last_updated ? new Date(b.last_updated).getTime() : 0;
                return da - db;
              });

              events.sort((a, b) => a.date.getTime() - b.date.getTime());
              const enrichedCount = Object.keys(enrichmentCache).length;

              // Group events by week
              const weekGroups: { label: string; events: CalEvent[] }[] = [];
              events.forEach(e => {
                const weekStart = new Date(e.date);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                const label = e.daysUntil < 0 ? "Recent" : e.daysUntil <= 7 ? "This Week" : e.daysUntil <= 14 ? "Next Week" : weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " week";
                const existing = weekGroups.find(g => g.label === label);
                if (existing) existing.events.push(e);
                else weekGroups.push({ label, events: [e] });
              });

              const typeColor = (t: string) => t === "Earnings" ? { bg: "var(--color-info-bg)", fg: "var(--color-accent-blue)", border: "rgba(79,142,247,0.25)" } : t === "Ex-Dividend" ? { bg: "var(--color-positive-bg)", fg: "var(--color-positive)", border: "var(--color-positive-border)" } : { bg: "rgba(251,191,36,0.15)", fg: "#D97706", border: "rgba(251,191,36,0.3)" };

              return (
                <div>
                  {enrichedCount < enrichedStocks.length && (
                    <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 8, padding: "4px 8px", background: "var(--color-bg-hover)", borderRadius: "var(--radius-sm)" }}>Catalyst data loaded for {enrichedCount} of {enrichedStocks.length} stocks. Click stocks in Octopus tab to load more.</p>
                  )}

                  {/* Timeline view */}
                  {weekGroups.length > 0 ? (
                    <div className="space-y-3 mb-4">
                      {weekGroups.map(g => (
                        <div key={g.label}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold uppercase tracking-wider" style={{ fontSize: 10, color: g.label === "This Week" ? "#F59E0B" : "var(--color-text-muted)" }}>{g.label}</span>
                            <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                            <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{g.events.length} event{g.events.length > 1 ? "s" : ""}</span>
                          </div>
                          <div className="grid grid-cols-1 gap-1">
                            {g.events.map((e, i) => {
                              const tc = typeColor(e.type);
                              return (
                                <div key={`${e.tikr}-${e.type}-${i}`} className="flex items-center gap-3 px-3 py-1.5 rounded cursor-pointer" style={{ background: "var(--color-bg-hover)" }} onClick={() => { const st = enrichedStocks.find(x => x.tikr === e.tikr); if (st) setDetailStock(st); }}>
                                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: e.daysUntil <= 7 && e.daysUntil >= 0 ? "#F59E0B" : "var(--color-text-muted)", minWidth: 52 }}>{e.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                                  <span className="pill" style={{ background: tc.bg, color: tc.fg, border: `1px solid ${tc.border}`, fontSize: 9, minWidth: 65, textAlign: "center" }}>{e.type}</span>
                                  <span className="font-semibold flex-1" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-primary)" }}>{e.name}</span>
                                  {e.sector && <span style={{ fontSize: 9, color: "var(--color-text-muted)" }}>{e.sector}</span>}
                                  <span className="font-bold" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: e.daysUntil < 0 ? "var(--color-text-muted)" : e.daysUntil <= 7 ? "#F59E0B" : "var(--color-text-primary)", minWidth: 36, textAlign: "right" }}>{e.daysUntil < 0 ? `${Math.abs(e.daysUntil)}d ago` : e.daysUntil === 0 ? "Today" : `${e.daysUntil}d`}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", padding: 12 }}>No upcoming events. Click stocks in the Octopus tab to load enrichment data.</p>}

                  {/* Analysis Freshness — Stale Stocks */}
                  {staleStocks.length > 0 && (
                    <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12, marginTop: 8 }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span style={{ fontSize: 14 }}>⏰</span>
                        <span className="font-bold" style={{ fontSize: "var(--text-sm)", color: "#D97706" }}>Stale Analysis — Not Updated in 60+ Days</span>
                        <span className="pill pill-amber" style={{ marginLeft: 4 }}>{staleStocks.length}</span>
                      </div>
                      <div className="overflow-auto max-h-[240px]">
                        <table className="data-table w-full"><thead><tr><th>Stock</th><th>Sector</th><th>Last Updated</th><th>Age</th><th>Conv.</th><th>CDS</th></tr></thead>
                          <tbody>{staleStocks.slice(0, 20).map(s => {
                            const d = s.last_updated ? new Date(s.last_updated) : null;
                            const age = d ? Math.ceil((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)) : null;
                            return (
                              <tr key={s.tikr} className="cursor-pointer" onClick={() => setDetailStock(s)}>
                                <td className="font-semibold" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-primary)" }}>{s.companyShort}</td>
                                <td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{s.sector || "—"}</td>
                                <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "Never"}</td>
                                <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: age && age > 90 ? "#EF4444" : "#D97706", fontWeight: 600 }}>{age ? `${age}d` : "∞"}</td>
                                <td className="text-center"><ConvictionDots level={s.conviction ?? 0} /></td>
                                <td className="text-center"><span className="inline-block px-1.5 py-0.5 rounded font-bold" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", background: s.cds != null ? (s.cds >= 80 ? "rgba(5,150,105,0.2)" : s.cds >= 60 ? "rgba(52,211,153,0.15)" : s.cds >= 40 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)") : "transparent", color: s.cds != null ? (s.cds >= 80 ? "#059669" : s.cds >= 60 ? "#10B981" : s.cds >= 40 ? "#D97706" : "#EF4444") : "var(--color-text-muted)" }}>{s.cds ?? "—"}</span></td>
                              </tr>
                            );
                          })}</tbody></table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

        </div>
      )}

      {/* Zone Alerts Button (fixed bottom-right) */}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999 }}>
        <button onClick={() => { setShowZoneAlerts(p => !p); setUnseenAlertCount(0); }} className="btn btn-primary" style={{ borderRadius: "50%", width: 48, height: 48, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.25)", position: "relative" }} aria-label="Zone Alerts">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          {unseenAlertCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "var(--color-negative)", color: "#fff", borderRadius: "50%", width: 20, height: 20, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unseenAlertCount > 9 ? "9+" : unseenAlertCount}</span>}
        </button>
        {showZoneAlerts && (
          <div style={{ position: "absolute", bottom: 56, right: 0, width: "min(360px, calc(100vw - 32px))", maxHeight: 420, background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-elevated)", overflow: "hidden", animation: "fadeInUp 0.2s ease" }}>
            <div className="flex items-center justify-between" style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
              <h4 className="font-bold" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Zone Alerts</h4>
              <div className="flex items-center gap-2">
                {zoneAlerts.length > 0 && <button onClick={() => setZoneAlerts([])} className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}>Clear all</button>}
                <button onClick={() => setShowZoneAlerts(false)} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto", padding: "8px 0" }}>
              {zoneAlerts.length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center" }}>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>No zone alerts yet</p>
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>Alerts appear when stocks enter or exit Buy/Sell/Overvalued zones on CMP refresh</p>
                </div>
              ) : (
                [...zoneAlerts].reverse().map(a => (
                  <div key={a.id} className={`zone-alert-item zone-alert-${a.type}`} onClick={() => setZoneAlerts(prev => prev.filter(x => x.id !== a.id))}>
                    <span className="zone-alert-icon">{a.type === "buy" ? "▲" : a.type === "sell" ? "▼" : a.type === "overvalued" ? "⚠" : "○"}</span>
                    <div className="flex-1">
                      <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-primary)", fontWeight: 500 }}>{a.msg}</p>
                      <p style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 1 }}>{new Date(a.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
