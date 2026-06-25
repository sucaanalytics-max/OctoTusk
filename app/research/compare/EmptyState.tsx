// Friendly zero-selected prompt shown when no stocks have been picked yet.

export default function EmptyState() {
  return (
    <div className="cmp-empty" role="status" aria-label="No stocks selected">
      <span className="cmp-empty-icon" aria-hidden="true">
        &#x1F4CA;
      </span>
      <h2 className="cmp-empty-title">Pick up to 4 stocks to compare</h2>
      <p className="cmp-empty-hint">
        Search by ticker or company name above, then select up to 4 stocks to
        see a side-by-side risk-adjusted analysis.
      </p>
    </div>
  );
}
