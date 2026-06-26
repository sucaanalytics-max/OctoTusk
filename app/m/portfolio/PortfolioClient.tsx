"use client";
import { useMemo, useState } from "react";
import type { MobileStock } from "@/lib/mobile/types";
import { useQuotes } from "@/lib/mobile/useQuotes";
import { useHoldings } from "@/lib/mobile/useHoldings";
import { computeLivePnl, portfolioTotals, type RawHolding } from "@/lib/holdingsPnl";
import { resolveHoldingTikr } from "@/lib/holdings-match";
import { fmtMoney, fmtPctRaw, fmtRupee } from "@/lib/format";
import { getCompanyShort } from "@/lib/companyName";
import BreakdownView from "./BreakdownView";
import type { BreakdownInput } from "@/lib/holdingsBreakdown";

type SortKey = "value" | "day" | "gain";

function PinGate({
  onUnlock,
  loading,
  error,
  retryAfter,
}: {
  onUnlock: (pin: string) => void;
  loading: boolean;
  error: string | null;
  retryAfter: number | null;
}) {
  const [pin, setPin] = useState("");
  const locked = retryAfter != null;
  return (
    <div className="m-pingate">
      <div className="m-pingate-icon" aria-hidden>
        🔒
      </div>
      <h2 className="m-section-title">Portfolio is PIN-protected</h2>
      <p className="m-empty" style={{ padding: 0 }}>
        Enter your holdings PIN to view live P&amp;L.
      </p>
      <input
        className="m-search"
        type="password"
        inputMode="text"
        autoComplete="off"
        placeholder="••••"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && pin && !loading && !locked) onUnlock(pin);
        }}
        aria-label="Holdings PIN"
        disabled={locked}
      />
      {error && <p className="m-note-err" role="alert">{error}{retryAfter ? ` (~${retryAfter}s)` : ""}</p>}
      <button
        className="m-composer-save"
        style={{ width: "100%" }}
        onClick={() => onUnlock(pin)}
        disabled={!pin || loading || locked}
      >
        {loading ? "Unlocking…" : "Unlock"}
      </button>
    </div>
  );
}

export default function PortfolioClient({ stocks }: { stocks: MobileStock[] }) {
  const { unlocked, holdings, foPositions, holdingsDate, loading, error, retryAfter, unlock, lock } =
    useHoldings();
  const { quotes, state } = useQuotes();
  const [sort, setSort] = useState<SortKey>("value");
  const [view, setView] = useState<"holdings" | "breakdown">("holdings");

  const matchable = useMemo(() => stocks.map((s) => ({ tikr: s.tikr, official_name: s.name })), [stocks]);
  const stockByTikr = useMemo(() => {
    const m = new Map<string, MobileStock>();
    for (const s of stocks) m.set(s.tikr.toLowerCase(), s);
    return m;
  }, [stocks]);

  const enriched = useMemo(() => {
    return (holdings as RawHolding[]).map((h) => {
      const tikr = h.tikr || resolveHoldingTikr(h.asset_name, matchable).tikr || null;
      const quote = tikr ? quotes[tikr] : undefined;
      const pnl = computeLivePnl(h, quote);
      const sd = tikr ? stockByTikr.get(tikr.toLowerCase()) : undefined;
      const upsideToBase =
        sd?.base != null && pnl.livePrice > 0 ? ((sd.base - pnl.livePrice) / pnl.livePrice) * 100 : null;
      const name = sd ? getCompanyShort({ official_name: sd.name, tikr: sd.tikr }) : h.asset_name;
      return { ...h, tikr, ...pnl, upsideToBase, name };
    });
  }, [holdings, quotes, matchable, stockByTikr]);

  const sorted = useMemo(() => {
    const arr = [...enriched];
    if (sort === "day") arr.sort((a, b) => b.dayPnl - a.dayPnl);
    else if (sort === "gain") arr.sort((a, b) => b.liveGain - a.liveGain);
    else arr.sort((a, b) => b.liveValue - a.liveValue);
    return arr;
  }, [enriched, sort]);

  const totals = useMemo(() => portfolioTotals(enriched), [enriched]);

  const breakdownItems = useMemo<BreakdownInput[]>(
    () =>
      enriched.map((h) => ({
        assetName: h.name,
        tikr: h.tikr,
        value: h.liveValue,
        invested: h.amt_invested,
        gain: h.liveGain,
      })),
    [enriched],
  );

  if (!unlocked) {
    return (
      <div className="m-page">
        <header className="m-pagehead">
          <h1 className="m-title">Portfolio</h1>
        </header>
        <PinGate onUnlock={unlock} loading={loading} error={error} retryAfter={retryAfter} />
      </div>
    );
  }

  const dateLabel = holdingsDate
    ? new Date(holdingsDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : null;

  return (
    <div className="m-page">
      <header className="m-pagehead">
        <h1 className="m-title">Portfolio</h1>
        <button className="m-note-add" onClick={lock} aria-label="Lock holdings">
          🔒 Lock
        </button>
      </header>

      {/* Summary */}
      <div className="m-summary">
        <div className="m-sum-main">
          <span className="m-sum-label">Current value</span>
          <span className="m-sum-value">{fmtMoney(totals.value)}</span>
        </div>
        <div className="m-sum-grid">
          <div className="m-metric">
            <span className="m-metric-label">Invested</span>
            <span className="m-metric-val">{fmtMoney(totals.invested)}</span>
          </div>
          <div className="m-metric">
            <span className="m-metric-label">Total P&amp;L</span>
            <span className={`m-metric-val ${totals.gain >= 0 ? "is-up" : "is-down"}`}>
              {fmtMoney(totals.gain)} ({fmtPctRaw(totals.gainPct)})
            </span>
          </div>
          <div className="m-metric">
            <span className="m-metric-label">Day P&amp;L</span>
            <span className={`m-metric-val ${totals.dayPnl >= 0 ? "is-up" : "is-down"}`}>
              {fmtMoney(totals.dayPnl)} ({fmtPctRaw(totals.dayPnlPct)})
            </span>
          </div>
          <div className="m-metric">
            <span className="m-metric-label">Holdings</span>
            <span className="m-metric-val">
              {enriched.length}
              {state === "LIVE" ? " · live" : state === "CLOSED" ? " · closed" : ""}
            </span>
          </div>
        </div>
        {dateLabel && <span className="m-count" style={{ textAlign: "left" }}>As of {dateLabel}</span>}
      </div>

      {/* View toggle */}
      <div className="m-chips">
        {(["holdings", "breakdown"] as const).map((v) => (
          <button
            key={v}
            className={`m-chip${view === v ? " is-active" : ""}`}
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {v === "holdings" ? "Holdings" : "Sectors"}
          </button>
        ))}
      </div>

      {view === "holdings" && (<>
      {/* Sort */}
      <div className="m-chips">
        {(["value", "day", "gain"] as SortKey[]).map((k) => (
          <button
            key={k}
            className={`m-chip${sort === k ? " is-active" : ""}`}
            aria-pressed={sort === k}
            onClick={() => setSort(k)}
          >
            {k === "value" ? "Value" : k === "day" ? "Day P&L" : "Total P&L"}
          </button>
        ))}
      </div>

      {/* Holdings */}
      <div className="m-cardlist">
        {sorted.map((h) => (
          <div key={h.asset_name} className="m-card">
            <div className="m-card-row1">
              <div className="m-card-id">
                <span className="m-card-name">{h.name}</span>
                <span className="m-card-meta">
                  {h.quantity} @ {fmtRupee(h.avg_price)} → {fmtRupee(h.livePrice)}
                </span>
              </div>
              {h.priced ? (
                <span className={`m-delta ${h.dayPnl >= 0 ? "is-up" : "is-down"}`}>
                  {fmtPctRaw(h.liveChangePct)}
                </span>
              ) : (
                <span className="m-delta is-flat" title="No live quote — showing last snapshot price">
                  no live
                </span>
              )}
            </div>
            <div className="m-card-row2">
              <span className="m-card-cmp">{fmtMoney(h.liveValue)}</span>
              <span className={`m-card-upside ${h.liveGain >= 0 ? "is-up" : "is-down"}`}>
                {fmtMoney(h.liveGain)} ({fmtPctRaw(h.liveGainPct)})
              </span>
            </div>
            <div className="m-holding-foot">
              <span className={h.dayPnl >= 0 ? "is-up" : "is-down"}>Day {fmtMoney(h.dayPnl)}</span>
              {h.upsideToBase != null && (
                <span className="m-holding-base">Base {fmtPctRaw(h.upsideToBase)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      </>)}

      {view === "breakdown" && <BreakdownView items={breakdownItems} />}

      {/* F&O */}
      {foPositions.length > 0 && (
        <section className="m-section">
          <h2 className="m-section-title">F&amp;O positions</h2>
          <div className="m-notelist">
            {foPositions.map((p, i) => {
              const pnl = p.unrealised_pnl;
              return (
                <div key={`${p.instrument_name}-${i}`} className="m-fo-row">
                  <div className="m-card-id">
                    <span className="m-card-name" style={{ fontSize: "var(--text-sm)" }}>
                      {p.instrument_name}
                    </span>
                    <span className="m-card-meta">
                      {p.direction} {p.quantity} @ {fmtRupee(p.avg_cost)}
                    </span>
                  </div>
                  <span className={`m-delta ${pnl >= 0 ? "is-up" : "is-down"}`}>{fmtMoney(pnl)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
