import { fmtPctRaw } from "@/lib/format";

/** Day-change pill. `pct` is an already-percent value (e.g. -2.4). */
export default function DeltaPill({ pct }: { pct: number | null | undefined }) {
  if (pct == null || !Number.isFinite(pct)) return <span className="m-delta is-flat">—</span>;
  const cls = pct > 0 ? "is-up" : pct < 0 ? "is-down" : "is-flat";
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "·";
  return (
    <span className={`m-delta ${cls}`}>
      <span aria-hidden>{arrow}</span> {fmtPctRaw(pct)}
    </span>
  );
}
