// Temporary preview: 3 conditional-formatting styles for the Octopus
// Scenario Upsides + Forward columns. Delete after style is chosen.

export const dynamic = "force-static";

type Row = { name: string; bear: number; base: number; bull: number; y1: number; y2: number };

const rows: Row[] = [
  { name: "The Bank of Baroda", bear:  32.4, base:  50.8, bull:  69.5, y1:  67.8, y2:  86.8 },
  { name: "Central Depository Services", bear: -19.8, base:   0.0, bull:  24.5, y1:  21.0, y2:  46.4 },
  { name: "Virtuoso Optoelectronics", bear: -24.4, base:  -5.4, bull:  13.5, y1:  18.6, y2:  41.1 },
  { name: "GPT Infraprojects", bear:  -8.8, base:  17.3, bull:  43.3, y1:  41.8, y2:  67.5 },
  { name: "Wework India Management", bear:  -1.9, base:  17.8, bull:  37.4, y1:  46.9, y2:  83.3 },
  { name: "Bank of India", bear:  27.3, base:  52.5, bull:  68.7, y1:  68.5, y2:  86.2 },
];

const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

// ── Option A: Tiered color (discrete buckets) ──
function tierBg(v: number): string {
  if (v >= 50)   return "rgba(5, 150, 105, 0.28)";
  if (v >= 20)   return "rgba(5, 150, 105, 0.18)";
  if (v >  0)    return "rgba(5, 150, 105, 0.08)";
  if (v === 0)   return "transparent";
  if (v > -20)   return "rgba(220, 38, 38, 0.08)";
  return            "rgba(220, 38, 38, 0.22)";
}

// ── Option B: Data bars (horizontal bar overlay, baseline at center) ──
function barCell(v: number, maxAbs = 100) {
  const pct = Math.min(Math.abs(v) / maxAbs, 1) * 50; // half-width per side
  const isPos = v >= 0;
  const color = isPos ? "rgba(5, 150, 105, 0.35)" : "rgba(220, 38, 38, 0.35)";
  return { pct, color, isPos };
}

// ── Option C: Translucent diverging heatmap (continuous) ──
function heatmapBg(v: number, threshold = 50): string {
  const intensity = Math.min(Math.abs(v) / threshold, 1);
  const alpha = intensity * 0.22;
  return v >= 0
    ? `rgba(5, 150, 105, ${alpha.toFixed(3)})`
    : `rgba(220, 38, 38, ${alpha.toFixed(3)})`;
}

const cellBase: React.CSSProperties = {
  padding: "10px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-sm)",
  textAlign: "right",
  fontWeight: 600,
  borderBottom: "1px solid var(--color-border-subtle)",
};
const headerCellBase: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--color-text-muted)",
  textAlign: "right",
  borderBottom: "1px solid var(--color-border)",
};
const nameCellBase: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "var(--text-sm)",
  textAlign: "left",
  borderBottom: "1px solid var(--color-border-subtle)",
};

const tone = (v: number) =>
  v > 0 ? "var(--color-positive)" : v < 0 ? "var(--color-negative)" : "var(--color-text-primary)";

function OptionATable() {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--color-bg-card)" }}>
      <thead>
        <tr>
          <th style={{ ...headerCellBase, textAlign: "left" }}>Company</th>
          <th style={headerCellBase}>↑ Bear</th>
          <th style={headerCellBase}>↑ Base</th>
          <th style={headerCellBase}>↑ Bull</th>
          <th style={headerCellBase}>1Y Up</th>
          <th style={headerCellBase}>2Y Up</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name}>
            <td style={nameCellBase}>{r.name}</td>
            {[r.bear, r.base, r.bull, r.y1, r.y2].map((v, i) => (
              <td key={i} style={{ ...cellBase, background: tierBg(v), color: tone(v) }}>{fmt(v)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OptionBTable() {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--color-bg-card)" }}>
      <thead>
        <tr>
          <th style={{ ...headerCellBase, textAlign: "left" }}>Company</th>
          <th style={headerCellBase}>↑ Bear</th>
          <th style={headerCellBase}>↑ Base</th>
          <th style={headerCellBase}>↑ Bull</th>
          <th style={headerCellBase}>1Y Up</th>
          <th style={headerCellBase}>2Y Up</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name}>
            <td style={nameCellBase}>{r.name}</td>
            {[r.bear, r.base, r.bull, r.y1, r.y2].map((v, i) => {
              const { pct, color, isPos } = barCell(v);
              return (
                <td key={i} style={{ ...cellBase, position: "relative", color: tone(v), zIndex: 1 }}>
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 6, bottom: 6,
                      left: isPos ? "50%" : `${50 - pct}%`,
                      width: `${pct}%`,
                      background: color,
                      borderRadius: 3,
                      zIndex: -1,
                    }}
                  />
                  <span style={{ position: "relative" }}>{fmt(v)}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OptionCTable() {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--color-bg-card)" }}>
      <thead>
        <tr>
          <th style={{ ...headerCellBase, textAlign: "left" }}>Company</th>
          <th style={headerCellBase}>↑ Bear</th>
          <th style={headerCellBase}>↑ Base</th>
          <th style={headerCellBase}>↑ Bull</th>
          <th style={headerCellBase}>1Y Up</th>
          <th style={headerCellBase}>2Y Up</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name}>
            <td style={nameCellBase}>{r.name}</td>
            {[r.bear, r.base, r.bull, r.y1, r.y2].map((v, i) => (
              <td key={i} style={{ ...cellBase, background: heatmapBg(v), color: tone(v) }}>{fmt(v)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PreviewUpsidePage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)", padding: "var(--space-6)", fontFamily: "var(--font-sans)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-2)", color: "var(--color-text-primary)" }}>
          Conditional Formatting Preview — Scenario Upsides / Forward
        </h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)", fontSize: "var(--text-sm)" }}>
          Same 6 mock rows rendered three ways. Pick whichever lands best for the live Octopus table.
        </p>

        <section style={{ marginBottom: "var(--space-8)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-1)", color: "var(--color-text-primary)" }}>
            Option A — Tiered color
          </h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", marginBottom: "var(--space-3)" }}>
            Discrete buckets: ≥50% deep green · ≥20% medium · &gt;0 light · 0 none · &gt;-20% light red · ≤-20% deep red.
          </p>
          <OptionATable />
        </section>

        <section style={{ marginBottom: "var(--space-8)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-1)", color: "var(--color-text-primary)" }}>
            Option B — Data bars
          </h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", marginBottom: "var(--space-3)" }}>
            Excel-style horizontal bar from a centered baseline. Bar width scales to magnitude (capped at ±100%).
          </p>
          <OptionBTable />
        </section>

        <section style={{ marginBottom: "var(--space-8)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-1)", color: "var(--color-text-primary)" }}>
            Option C — Translucent heatmap
          </h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", marginBottom: "var(--space-3)" }}>
            Continuous: alpha = |v|/50% × 0.22. Text styling unchanged. Subtle, professional, lossless.
          </p>
          <OptionCTable />
        </section>

        <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", textAlign: "center", marginTop: "var(--space-6)" }}>
          Tell me A, B, or C and I&apos;ll wire it into the live Octopus table along with the cascading subsector filter.
        </p>
      </div>
    </div>
  );
}
