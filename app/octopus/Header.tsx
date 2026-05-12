"use client";

import { useEffect, useState } from "react";

export type DisplayState = "LIVE" | "STALE" | "DISCONNECTED" | "CLOSED" | "LOADING";

const PILL: Record<DisplayState, { className: string; label: string }> = {
  LIVE:         { className: "octopus-pill-live",   label: "LIVE" },
  STALE:        { className: "octopus-pill-stale",  label: "STALE" },
  DISCONNECTED: { className: "octopus-pill-disc",   label: "DISCONNECTED" },
  CLOSED:       { className: "octopus-pill-closed", label: "MARKETS CLOSED" },
  LOADING:      { className: "octopus-pill-closed", label: "LOADING" },
};

function formatIstClock(d: Date): string {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(d.getTime() + istOffsetMs + d.getTimezoneOffset() * 60 * 1000);
  const hh = String(ist.getHours()).padStart(2, "0");
  const mm = String(ist.getMinutes()).padStart(2, "0");
  const ss = String(ist.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} IST`;
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

export function Header({
  state,
  ageSeconds,
}: {
  state: DisplayState;
  ageSeconds: number | null;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const pill = PILL[state];

  return (
    <div className="octopus-header">
      <div className="octopus-brand">
        <span className="octopus-brand-dot" aria-hidden />
        <span>OCTOPUS · TUSK COVERAGE</span>
      </div>
      <div className="octopus-state-row">
        <span className={`octopus-pill ${pill.className}`}>
          <span className="octopus-pill-dot" aria-hidden />
          {pill.label}
        </span>
        <span className="octopus-clock" suppressHydrationWarning>
          {now ? formatIstClock(now) : ""}
        </span>
        <span className="octopus-refresh-age">refreshed {formatAge(ageSeconds)}</span>
      </div>
    </div>
  );
}
