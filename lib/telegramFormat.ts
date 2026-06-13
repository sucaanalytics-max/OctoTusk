/**
 * Shared Telegram message formatters. (The alerts check + webhook routes
 * carry their own copies; new code imports from here — migrate the others later.)
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Indian-grouped number; 1 decimal under 100, whole otherwise. */
export function fmtNum(n: number): string {
  const decimals = Math.abs(n) < 100 ? 1 : 0;
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "+3.1%" / "−4.6%" from a fraction (0.031 → "+3.1%"). */
export function fmtSignedPct(frac: number): string {
  const pct = frac * 100;
  const decimals = Math.abs(pct) >= 10 ? 0 : 1;
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(decimals)}%`;
}

/** Colored day-move from a PERCENT value (1.2 → "🟢▲1.2%"). null → "". */
export function dayArrow(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "";
  return `${pct >= 0 ? "🟢▲" : "🔴▼"}${Math.abs(pct).toFixed(1)}%`;
}

export function istTimeNow(): string {
  return new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** "Fri 13 Jun" in IST. */
export function istDateLabel(): string {
  return new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short",
  });
}
