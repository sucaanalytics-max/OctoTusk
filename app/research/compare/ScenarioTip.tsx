"use client";
// Shared scenario tooltip for Sector Scan (Leaderboard range bars + Chart rows).
// ONE hook (useScenarioTip) + ONE card component, consumed by SectorScanView for both
// the Leaderboard (SectorScanRows' range bar) and the Chart (<FootballField scroll />,
// which marks each row's chart cell with data-tikr only when scroll=true).
//
// Wiring: the consumer spreads `handlers` onto ONE wrapper div around whichever body is
// currently rendered, and attaches `wrapperRef` to that same div. Every interactive element
// inside must carry `data-tikr="<TIKR>"` — delegated via Element.closest(), so no per-row
// listener wiring is needed in either child view. Hover shows; click pins (stays until
// click elsewhere/again); keyboard focus shows it; any scroll inside the wrapper (capture
// phase — scroll does not bubble) hides an unpinned tip.

import { useCallback, useLayoutEffect, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, FocusEvent as ReactFocusEvent, RefObject } from "react";
import { fmtRupee, fmtPct } from "@/lib/format";
import { scenarioUpside } from "@/lib/scenarioUpside";
import { resolveCmp } from "@/lib/compare/riskAdjusted";
import { getCompanyShort } from "@/lib/companyName";
import type { CompareStock, CompareQuotesMap } from "@/lib/compare/types";

interface TipState {
  tikr: string;
  x: number;
  y: number;
  pinned: boolean;
}

export interface ScenarioTipHandlers {
  onMouseMove: (e: ReactMouseEvent) => void;
  onMouseLeave: () => void;
  onClick: (e: ReactMouseEvent) => void;
  onFocus: (e: ReactFocusEvent) => void;
}

export interface UseScenarioTipResult {
  handlers: ScenarioTipHandlers;
  tip: React.ReactNode;
}

function findTikr(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>("[data-tikr]");
  return el?.getAttribute("data-tikr") ?? null;
}

/** Attach `handlers` + `wrapperRef` to the same wrapper div; renders `tip` as a sibling. */
export function useScenarioTip(
  stocks: CompareStock[],
  quotes: CompareQuotesMap,
  wrapperRef: RefObject<HTMLElement | null>
): UseScenarioTipResult {
  const [state, setState] = useState<TipState | null>(null);
  const pinnedRef = useRef(false);

  const showFor = useCallback((tikr: string, x: number, y: number, pinned: boolean) => {
    pinnedRef.current = pinned;
    setState({ tikr, x, y, pinned });
  }, []);

  const onMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (pinnedRef.current) return;
      const tikr = findTikr(e.target);
      if (tikr) showFor(tikr, e.clientX, e.clientY, false);
      else setState((s) => (s && !s.pinned ? null : s));
    },
    [showFor]
  );

  const onMouseLeave = useCallback(() => {
    if (!pinnedRef.current) setState(null);
  }, []);

  const onClick = useCallback((e: ReactMouseEvent) => {
    const tikr = findTikr(e.target);
    if (!tikr) {
      pinnedRef.current = false;
      setState(null);
      return;
    }
    setState((s) => {
      if (s && s.pinned && s.tikr === tikr) {
        pinnedRef.current = false;
        return null;
      }
      pinnedRef.current = true;
      return { tikr, x: e.clientX, y: e.clientY, pinned: true };
    });
  }, []);

  const onFocus = useCallback(
    (e: ReactFocusEvent) => {
      const tikr = findTikr(e.target);
      if (!tikr) return;
      const r = (e.target as HTMLElement).getBoundingClientRect();
      showFor(tikr, r.left + r.width / 2, r.top, pinnedRef.current);
    },
    [showFor]
  );

  // scroll does not bubble — attach a capture-phase listener on the wrapper so scrolling
  // ANY nested scroll pane (leaderboard table, football-field scan-scroll) hides the tip.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onScrollCapture = () => {
      if (!pinnedRef.current) setState(null);
    };
    el.addEventListener("scroll", onScrollCapture, true);
    return () => el.removeEventListener("scroll", onScrollCapture, true);
  }, [wrapperRef]);

  // If the shown/pinned tikr drops out of the current stocks list (scope switch, manual-chip
  // removal), the tip would otherwise keep pointing at a stock no longer in view — clear it
  // so hover isn't silently dead on a row that's gone.
  useEffect(() => {
    setState((s) => {
      if (!s) return s;
      if (stocks.some((st) => st.tikr === s.tikr)) return s;
      pinnedRef.current = false;
      return null;
    });
  }, [stocks]);

  const stock = state ? stocks.find((s) => s.tikr === state.tikr) : undefined;

  return {
    handlers: { onMouseMove, onMouseLeave, onClick, onFocus },
    tip:
      stock && state ? (
        <ScenarioTipCard stock={stock} quotes={quotes} x={state.x} y={state.y} />
      ) : null,
  };
}

interface CardProps {
  stock: CompareStock;
  quotes: CompareQuotesMap;
  x: number;
  y: number;
}

function tipRow(
  key: string,
  label: string,
  price: number | null,
  up: number | null,
  swatch: string | null,
  sep: boolean
) {
  const upCls = up == null ? "" : up >= 0 ? " is-pos" : " is-neg";
  return (
    <tr key={key} className={sep ? "cmp-scan-tip-sep" : undefined}>
      <td className="cmp-scan-tip-k">
        {swatch && <span className="cmp-scan-tip-sw" style={{ background: swatch }} />}
        {label}
      </td>
      <td className="cmp-scan-tip-p">{price != null ? fmtRupee(price) : "—"}</td>
      <td className={`cmp-scan-tip-u${upCls}`}>{up != null ? fmtPct(up) : "—"}</td>
    </tr>
  );
}

function ScenarioTipCard({ stock, quotes, x, y }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const { cmp } = resolveCmp(stock, quotes[stock.tikr]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8);
    let top = y - r.height - 12;
    if (top < 8) top = y + 16;
    setPos({ left, top });
  }, [x, y]);

  const short = getCompanyShort({ official_name: stock.name, tikr: stock.tikr });

  return (
    <div ref={ref} className="cmp-scan-tip" role="tooltip" style={{ left: pos.left, top: pos.top }}>
      <div className="cmp-scan-tip-head">{short}</div>
      <div className="cmp-scan-tip-sub">
        {stock.tikr} &middot; CMP {cmp != null ? fmtRupee(cmp) : "—"}
      </div>
      <table>
        <tbody>
          {tipRow("bear", "Bear", stock.bear, scenarioUpside(stock.bear, cmp), "var(--color-negative)", false)}
          {tipRow("base", "Base", stock.base, scenarioUpside(stock.base, cmp), "var(--color-warning)", false)}
          {tipRow("bull", "Bull", stock.bull, scenarioUpside(stock.bull, cmp), "var(--color-positive)", false)}
          {tipRow("t1y", "Target 1Y", stock.target1y, scenarioUpside(stock.target1y, cmp), null, true)}
          {tipRow("t2y", "Target 2Y", stock.target2y, scenarioUpside(stock.target2y, cmp), null, false)}
        </tbody>
      </table>
    </div>
  );
}
