"use client";
import { useCallback, useMemo, useState } from "react";
import type { MarketplaceAlert } from "@/lib/marketplace";
import { useMarketplace } from "@/lib/mobile/useMarketplace";
import {
  ALERT_METRIC_LABELS,
  ALERT_TARGET_LABELS,
  metricUnit,
} from "@/lib/userAlerts";
import { fmtRupee } from "@/lib/format";
import { SkeletonRows } from "../components/Skeleton";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function describe(item: MarketplaceAlert): string {
  const isRupee = metricUnit(item.metric) === "₹";
  const val = isRupee ? fmtRupee(item.threshold, 0) : `${item.threshold}%`;
  switch (item.metric) {
    case "price_above":
      return `Price ≥ ${val}`;
    case "price_below":
      return `Price ≤ ${val}`;
    case "target_near":
      return `Within ${item.threshold}% of ${
        item.target_type ? ALERT_TARGET_LABELS[item.target_type] : "target"
      }`;
    case "upside_above":
      return `Base upside ≥ ${item.threshold}%`;
    case "pct_move_abs":
      return `Day move ≥ ${item.threshold}%`;
    default:
      return ALERT_METRIC_LABELS[item.metric];
  }
}

// ── Row ───────────────────────────────────────────────────────────────────────

function MarketplaceRow({
  item,
  isAdded,
  clone,
}: {
  item: MarketplaceAlert;
  isAdded: boolean;
  clone: (item: MarketplaceAlert) => Promise<string | null>;
}) {
  const [pending, setPending] = useState(false);
  const [rowErr, setRowErr] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    if (isAdded || pending) return;
    setPending(true);
    setRowErr(null);
    const err = await clone(item);
    if (err) setRowErr(err);
    setPending(false);
  }, [clone, isAdded, item, pending]);

  const label = item.stock_name || item.original_tikr;

  return (
    <div className="m-card m-card--static">
      <div className="m-card-row1">
        <div className="m-card-id">
          <span className="m-card-name">{label}</span>
          <span className="m-card-meta">{item.original_tikr}</span>
        </div>
        <button
          className={`m-chip${isAdded ? " is-active" : ""}`}
          disabled={isAdded || pending}
          onClick={handleAdd}
          aria-label={
            isAdded
              ? `${label} already in your alerts`
              : `Add ${label} alert to your alerts`
          }
        >
          {isAdded ? "Added ✓" : pending ? "Adding…" : "Add"}
        </button>
      </div>

      <span className="m-card-meta">{describe(item)}</span>

      <span className="m-card-meta">
        by {item.author} &middot; {relTime(item.created_at)}
      </span>

      {rowErr && (
        <p className="m-note-err" role="alert">
          {rowErr}
        </p>
      )}
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MarketplaceClient() {
  const { items, loading, error, clone, added } = useMarketplace();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.original_tikr.toLowerCase().includes(q) ||
        (it.stock_name ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div className="m-page">
      <header className="m-pagehead">
        <div>
          <h1 className="m-title">Team alerts</h1>
          <p className="m-card-meta">Browse and add alerts your teammates created</p>
        </div>
      </header>

      <input
        className="m-search"
        type="search"
        placeholder="Search by stock name or ticker…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search team alerts"
      />

      {error && (
        <p className="m-note-err" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <SkeletonRows count={4} />
      ) : items.length === 0 ? (
        <p className="m-empty">No team alerts yet.</p>
      ) : filtered.length === 0 ? (
        <p className="m-empty">No alerts match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="m-cardlist">
          {filtered.map((item, idx) => (
            <MarketplaceRow
              key={`${item.stock_key}|${item.metric}|${item.target_type ?? ""}|${item.threshold}|${idx}`}
              item={item}
              isAdded={added(item)}
              clone={clone}
            />
          ))}
        </div>
      )}

      {!loading && items.length > 0 && (
        <p className="m-count">
          {items.length} team alert{items.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
