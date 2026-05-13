"use client";

import { useMemo } from "react";
import { displayName } from "@/lib/displayName";

export interface UpsideStock {
  tikr: string;
  name?: string;
  dayPct: number | null;
  cmp: number | null;
  oneYearPrice: number | null;
  oneYearUpside: number | null;
}

interface Props {
  stocks: UpsideStock[];
  focusedTikr: string | null;
  pinnedTikr: string | null;
  onRowHover: (tikr: string | null) => void;
  onRowClick: (tikr: string) => void;
}

// Bucket thresholds (fractional upside). Easy to tune.
const BUCKETS: Array<{ key: string; label: string; range: string; min: number | null; max: number | null }> = [
  { key: "high", label: "High Upside",     range: "≥ 20%",   min: 0.20, max: null },
  { key: "mod",  label: "Moderate Upside", range: "10–20%",  min: 0.10, max: 0.20 },
  { key: "low",  label: "Low Upside",      range: "0–10%",   min: 0,    max: 0.10 },
  { key: "down", label: "Downside",        range: "< 0%",    min: null, max: 0 },
];

function fmtPctSigned(p: number | null): string {
  if (p == null || !isFinite(p)) return "—";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(2)}%`;
}

function fmtCmp(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dirOf(p: number | null): "up" | "down" | "flat" | "null" {
  if (p == null) return "null";
  if (Math.abs(p) < 0.05) return "flat";
  return p > 0 ? "up" : "down";
}

// Live-recompute upside from oneYearPrice / cmp; fall back to recorded value.
// Returns fractional upside (e.g. 0.20 = +20%).
function liveUpside(s: UpsideStock): number | null {
  if (s.oneYearPrice != null && s.cmp != null && s.cmp > 0) {
    return s.oneYearPrice / s.cmp - 1;
  }
  return s.oneYearUpside ?? null;
}

function bucketOf(u: number | null): string {
  if (u == null) return "unrated";
  for (const b of BUCKETS) {
    const gte = b.min == null || u >= b.min;
    const lt = b.max == null || u < b.max;
    if (gte && lt) return b.key;
  }
  return "unrated";
}

function chunk<T>(arr: T[], n: number): T[][] {
  if (n <= 1 || arr.length <= n) return arr.length ? [arr] : [];
  const size = Math.ceil(arr.length / n);
  return Array.from({ length: n }, (_, i) => arr.slice(i * size, (i + 1) * size)).filter((c) => c.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface Row {
  s: UpsideStock;
  upside: number | null;
}

interface Bucket {
  key: string;
  label: string;
  range: string;
  rows: Row[];
  medianUpside: number | null;
}

export function StockUpsideTable({ stocks, focusedTikr, pinnedTikr, onRowHover, onRowClick }: Props) {
  const buckets: Bucket[] = useMemo(() => {
    const grouped: Record<string, Row[]> = { high: [], mod: [], low: [], down: [], unrated: [] };
    for (const s of stocks) {
      const u = liveUpside(s);
      const k = bucketOf(u);
      grouped[k].push({ s, upside: u });
    }
    // Sort each bucket by upside desc; Unrated by tikr.
    for (const k of Object.keys(grouped)) {
      if (k === "unrated") {
        grouped[k].sort((a, b) => a.s.tikr.localeCompare(b.s.tikr));
      } else {
        grouped[k].sort((a, b) => (b.upside ?? -Infinity) - (a.upside ?? -Infinity));
      }
    }
    const result: Bucket[] = [];
    for (const b of BUCKETS) {
      const rows = grouped[b.key];
      const med = median(rows.map((r) => r.upside).filter((u): u is number => u != null));
      result.push({ key: b.key, label: b.label, range: b.range, rows, medianUpside: med });
    }
    if (grouped.unrated.length) {
      result.push({
        key: "unrated",
        label: "Unrated",
        range: "no 1Y target",
        rows: grouped.unrated,
        medianUpside: null,
      });
    }
    return result.filter((b) => b.rows.length > 0);
  }, [stocks]);

  return (
    <div className="ox-upside">
      {buckets.map((b) => {
        const cols = chunk(b.rows, 3);
        return (
          <section key={b.key} className="ox-upside-bucket" data-bucket={b.key}>
            <header className="ox-upside-bucket-head">
              <span className="ox-upside-bucket-label">
                {b.label} <span className="ox-upside-bucket-range">{b.range}</span>
              </span>
              <span className="ox-upside-bucket-meta">
                {b.rows.length} {b.rows.length === 1 ? "stock" : "stocks"}
                {b.medianUpside != null && (
                  <>
                    {" · median "}
                    <span className="ox-upside-bucket-median">
                      {fmtPctSigned(b.medianUpside * 100)}
                    </span>
                  </>
                )}
              </span>
            </header>
            <div className="ox-upside-bucket-body">
              {cols.map((col, i) => (
                <div key={i} className="ox-upside-bucket-col">
                  {col.map(({ s, upside }) => {
                    const dir = dirOf(s.dayPct);
                    const isFocused = focusedTikr === s.tikr || pinnedTikr === s.tikr;
                    const isPinned = pinnedTikr === s.tikr;
                    const upPctFraction = upside == null ? null : upside;
                    const upPctClass =
                      upPctFraction == null
                        ? "null"
                        : upPctFraction > 0
                        ? "up"
                        : upPctFraction < 0
                        ? "down"
                        : "flat";
                    return (
                      <button
                        key={s.tikr}
                        type="button"
                        className="ox-upside-row"
                        data-dir={dir}
                        data-focused={isFocused || undefined}
                        data-pinned={isPinned || undefined}
                        onMouseEnter={() => onRowHover(s.tikr)}
                        onMouseLeave={() => onRowHover(null)}
                        onClick={() => onRowClick(s.tikr)}
                      >
                        <span className="ox-table-name-cell">
                          <span className="ox-table-name">{displayName(s.tikr, s.name)}</span>
                          <span className="ox-table-tikr">{s.tikr}</span>
                        </span>
                        <span className="ox-table-cmp">
                          {s.cmp != null ? (
                            <>
                              <span className="ox-table-rupee">₹</span>
                              {fmtCmp(s.cmp)}
                            </>
                          ) : (
                            "—"
                          )}
                        </span>
                        <span className="ox-table-target">
                          {s.oneYearPrice != null ? (
                            <>
                              <span className="ox-table-rupee">₹</span>
                              {fmtCmp(s.oneYearPrice)}
                            </>
                          ) : (
                            "—"
                          )}
                        </span>
                        <span className="ox-upside-pct" data-dir={upPctClass}>
                          {upPctFraction == null
                            ? "—"
                            : `${upPctFraction >= 0 ? "+" : ""}${(upPctFraction * 100).toFixed(1)}%`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
