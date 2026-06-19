import { axisPosition, bandPosition, scenarioZone } from "@/lib/scenarioUpside";
import { fmtRupee } from "@/lib/format";

interface Props {
  cmp: number | null;
  bear: number | null;
  base: number | null;
  bull: number | null;
  showLabels?: boolean;
}

/**
 * Signature mobile visualization: where the live CMP sits on the bear→base→bull
 * valuation band. Ticks mark bear/base/bull; a colored marker is the CMP. Axis spans
 * [min(bear,cmp), max(bull,cmp)] so the marker is always visible. Pure CSS, token-colored.
 */
export default function ScenarioBand({ cmp, bear, base, bull, showLabels = true }: Props) {
  const pos = bandPosition(cmp, bear, bull);
  const zone = scenarioZone(cmp, bear, bull);

  if (pos == null || bear == null || bull == null) {
    return (
      <div className="m-band m-band--empty" aria-hidden>
        — no valuation —
      </div>
    );
  }

  const bearPos = axisPosition(bear, cmp, bear, bull);
  const basePos = axisPosition(base, cmp, bear, bull);
  const bullPos = axisPosition(bull, cmp, bear, bull);
  const markerColor =
    zone === "cheap" ? "var(--color-positive)" : zone === "rich" ? "var(--color-negative)" : "var(--color-warning)";
  const valueNow = Math.round(pos * 100);

  return (
    <div
      className="m-band"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valueNow}
      aria-label={`Price ${zone ?? "position"} on the bear-to-bull band`}
    >
      <div className="m-band-track">
        {bearPos != null && <span className="m-band-tick" style={{ left: `${bearPos * 100}%` }} />}
        {basePos != null && <span className="m-band-tick" style={{ left: `${basePos * 100}%` }} />}
        {bullPos != null && <span className="m-band-tick" style={{ left: `${bullPos * 100}%` }} />}
        <span className="m-band-marker" style={{ left: `${pos * 100}%`, background: markerColor }} />
      </div>
      {showLabels && (
        <div className="m-band-labels">
          <span>Bear {fmtRupee(bear, 0)}</span>
          {base != null && <span className="m-band-base">Base {fmtRupee(base, 0)}</span>}
          <span>Bull {fmtRupee(bull, 0)}</span>
        </div>
      )}
    </div>
  );
}
