// Pure live-P&L helpers for holdings. Re-expressed from app/dashboard/DashboardClient.tsx
// (enrichment ~L1570-1583, totals ~L2805-2824) so the mobile Portfolio matches the desktop
// math exactly without importing the frozen monolith. Keep in sync if the desktop changes.

import type { Quote } from "@/lib/mobile/types";

export interface RawHolding {
  asset_name: string;
  quantity: number;
  avg_price: number;
  amt_invested: number;
  current_price: number;
  overall_gain: number;
  overall_gain_pct: number;
  current_value: number;
  tikr?: string | null;
}

export interface LivePnl {
  priced: boolean; // false ⇒ no live quote matched; livePrice fell back to the snapshot price
  livePrice: number;
  liveChange: number;
  liveChangePct: number;
  liveValue: number;
  liveGain: number;
  liveGainPct: number;
  dayPnl: number;
  dayPnlPct: number;
}

/** Live P&L for one holding given its live quote (falls back to the snapshot price).
 *  `priced` lets the UI badge legs with no live quote (which show 0% day change) instead of
 *  passing them off as flat. Totals still include every leg to mirror the desktop math. */
export function computeLivePnl(h: RawHolding, quote?: Quote): LivePnl {
  const livePrice = quote ? quote.price : h.current_price;
  const liveChange = quote ? quote.change || 0 : 0;
  const liveChangePct = quote ? quote.changePct || 0 : 0;
  const liveValue = livePrice * h.quantity;
  const liveGain = liveValue - h.amt_invested;
  const liveGainPct = h.amt_invested > 0 ? (liveGain / h.amt_invested) * 100 : 0;
  const dayPnl = liveChange * h.quantity;
  const dayPnlPct = h.amt_invested > 0 ? (dayPnl / h.amt_invested) * 100 : 0;
  return { priced: !!quote, livePrice, liveChange, liveChangePct, liveValue, liveGain, liveGainPct, dayPnl, dayPnlPct };
}

export interface PortfolioTotals {
  invested: number;
  value: number;
  gain: number;
  gainPct: number;
  dayPnl: number;
  dayPnlPct: number;
}

/** Aggregate totals across enriched holdings (day P&L % uses current value as denom — matches desktop). */
export function portfolioTotals(
  items: Array<{ amt_invested: number; liveValue: number; dayPnl: number }>,
): PortfolioTotals {
  const invested = items.reduce((s, h) => s + (h.amt_invested || 0), 0);
  const value = items.reduce((s, h) => s + (h.liveValue || 0), 0);
  const gain = value - invested;
  const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
  const dayPnl = items.reduce((s, h) => s + (h.dayPnl || 0), 0);
  const dayPnlPct = value > 0 ? (dayPnl / value) * 100 : 0;
  return { invested, value, gain, gainPct, dayPnl, dayPnlPct };
}
