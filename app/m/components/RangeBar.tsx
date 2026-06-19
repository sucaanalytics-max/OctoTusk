import { fmtRupee } from "@/lib/format";

/** 52-week low→high bar with a CMP marker. */
export default function RangeBar({ low, high, cmp }: { low: number; high: number; cmp: number | null }) {
  const pos = cmp != null && high > low ? Math.max(0, Math.min(1, (cmp - low) / (high - low))) : null;
  return (
    <div className="m-range">
      <div className="m-range-track">
        {pos != null && <span className="m-range-marker" style={{ left: `${pos * 100}%` }} />}
      </div>
      <div className="m-band-labels">
        <span>{fmtRupee(low, 0)}</span>
        <span>{fmtRupee(high, 0)}</span>
      </div>
    </div>
  );
}
