"use client";

import { useEffect, useState, type CSSProperties } from "react";

export type DisplayState = "LIVE" | "STALE" | "DISCONNECTED" | "CLOSED" | "LOADING";

const PILL: Record<DisplayState, { className: string; label: string }> = {
  LIVE:         { className: "ox-pill-live",   label: "Live" },
  STALE:        { className: "ox-pill-stale",  label: "Stale" },
  DISCONNECTED: { className: "ox-pill-disc",   label: "Disconnected" },
  CLOSED:       { className: "ox-pill-closed", label: "Markets Closed" },
  LOADING:      { className: "ox-pill-closed", label: "Loading" },
};

function formatIstClock(d: Date): string {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(d.getTime() + istOffsetMs + d.getTimezoneOffset() * 60 * 1000);
  const hh = String(ist.getHours()).padStart(2, "0");
  const mm = String(ist.getMinutes()).padStart(2, "0");
  const ss = String(ist.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatAge(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export type OctopusView = "day" | "upside" | "movers";

/** Movement-band presets (± percent) shown in the Movers view control. */
export const BAND_PRESETS = [2, 3, 5] as const;
export const DEFAULT_BAND = 3;

/** Index-strip density. Comfortable = 3-line cells; Compact = 2-line (value + change inline). */
export type StripDensity = "comfortable" | "compact";
export const DENSITY_DEFAULT: StripDensity = "comfortable";

const DENSITY_BTN: CSSProperties = { display: "inline-flex", alignItems: "center", padding: "6px 9px" };

export function Header({
  state,
  ageSeconds,
  onOpenPalette,
  view,
  onViewChange,
  band,
  onBandChange,
  density,
  onDensityChange,
}: {
  state: DisplayState;
  ageSeconds: number | null;
  onOpenPalette?: () => void;
  view?: OctopusView;
  onViewChange?: (v: OctopusView) => void;
  band?: number;
  onBandChange?: (b: number) => void;
  density?: StripDensity;
  onDensityChange?: (d: StripDensity) => void;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
    return () => clearInterval(t);
  }, []);

  const pill = PILL[state];

  return (
    <header className="ox-masthead" style={{ gridTemplateColumns: "max-content minmax(0, 1fr)" }}>
      <div className="ox-masthead-brand">
        <h1 className="ox-masthead-title">
          <span className="ox-masthead-dot" aria-hidden />
          Octopus
        </h1>
        <p className="ox-masthead-sub">
          Tusk Coverage <span className="ox-bullet">·</span> Equity Research{" "}
          <span className="ox-bullet">·</span> Live Market View
        </p>
      </div>
      <div className="ox-masthead-state" style={{ flexWrap: "wrap", justifyContent: "flex-end", rowGap: "8px" }}>
        {view !== undefined && onViewChange && (
          <div className="ox-view-toggle" role="tablist" aria-label="Centerpiece view">
            <button
              type="button"
              role="tab"
              aria-selected={view === "day"}
              className="ox-view-toggle-btn"
              data-active={view === "day" || undefined}
              onClick={() => onViewChange("day")}
            >
              Day %
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "movers"}
              className="ox-view-toggle-btn"
              data-active={view === "movers" || undefined}
              onClick={() => onViewChange("movers")}
            >
              Movers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "upside"}
              className="ox-view-toggle-btn"
              data-active={view === "upside" || undefined}
              onClick={() => onViewChange("upside")}
            >
              1Y Upside
            </button>
          </div>
        )}
        {view === "movers" && band !== undefined && onBandChange && (
          <div className="ox-band-control">
            <span className="ox-band-control-label">Band</span>
            <div className="ox-view-toggle" role="group" aria-label="Movement band (± percent)">
              {BAND_PRESETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  className="ox-view-toggle-btn"
                  data-active={band === b || undefined}
                  aria-pressed={band === b}
                  onClick={() => onBandChange(b)}
                >
                  ±{b}%
                </button>
              ))}
            </div>
          </div>
        )}
        {density !== undefined && onDensityChange && (
          <div className="ox-view-toggle" role="group" aria-label="Index strip density">
            <button
              type="button"
              className="ox-view-toggle-btn"
              style={DENSITY_BTN}
              data-active={density === "comfortable" || undefined}
              aria-pressed={density === "comfortable"}
              aria-label="Comfortable density"
              title="Comfortable density"
              onClick={() => onDensityChange("comfortable")}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="currentColor">
                <rect x="2" y="3.25" width="12" height="3.5" rx="1" />
                <rect x="2" y="9.25" width="12" height="3.5" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              className="ox-view-toggle-btn"
              style={DENSITY_BTN}
              data-active={density === "compact" || undefined}
              aria-pressed={density === "compact"}
              aria-label="Compact density"
              title="Compact density"
              onClick={() => onDensityChange("compact")}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="currentColor">
                <rect x="2" y="2.5" width="12" height="2.4" rx="0.8" />
                <rect x="2" y="6.8" width="12" height="2.4" rx="0.8" />
                <rect x="2" y="11.1" width="12" height="2.4" rx="0.8" />
              </svg>
            </button>
          </div>
        )}
        <button
          type="button"
          className="ox-search-hint"
          onClick={onOpenPalette}
          aria-label="Search stocks"
          title="Search stocks (⌘K)"
        >
          <span className="ox-search-icon" aria-hidden>⌕</span>
          <span className="ox-search-text">Search</span>
          <kbd className="ox-search-kbd" suppressHydrationWarning>
            {isMac ? "⌘ K" : "Ctrl K"}
          </kbd>
        </button>
        <span className={`ox-pill ${pill.className}`}>
          <span className="ox-pill-dot" aria-hidden />
          <span className="ox-pill-label">{pill.label}</span>
        </span>
        <div className="ox-clock-block">
          <span className="ox-clock" suppressHydrationWarning>
            {now ? formatIstClock(now) : "—"}
          </span>
          <span className="ox-clock-tz">IST</span>
        </div>
        <span className="ox-refresh-age">refreshed {formatAge(ageSeconds)}</span>
      </div>
    </header>
  );
}
