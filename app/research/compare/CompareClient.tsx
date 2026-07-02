"use client";
// Composition root for /research/compare.
// Owns selection state; composes all presentational components.
// Render order: VerdictBanner → ScorecardGrid → FootballField → ComparisonTable → DetailTable.
// computeScorecard called ONCE; rows passed to VerdictBanner, ScorecardGrid, and ComparisonTable.
//
// Mode toggle (2026-07-03): "compare" is the tree above, unchanged; "scan" swaps in
// SectorScanView — the CIO opportunity leaderboard/chart over the whole seed universe.
// useCompareQuotes already fetches the full quotes map regardless of `selected`, so both
// modes share one poll.

import { useState } from "react";
import { computeScorecard } from "@/lib/compare/riskAdjusted";
import { useCompareQuotes } from "@/lib/compare/useCompareQuotes";
import { useEnrichment } from "@/lib/compare/useEnrichment";
import type { CompareStock } from "@/lib/compare/types";
import StockPicker from "./StockPicker";
import VerdictBanner from "./VerdictBanner";
import ScorecardGrid from "./ScorecardGrid";
import FootballField from "./FootballField";
import ComparisonTable from "./ComparisonTable";
import DetailTable from "./DetailTable";
import EmptyState from "./EmptyState";
import SectorScanView from "./SectorScanView";

const MAX_SELECTED = 4;
type CompareMode = "compare" | "scan";

interface Props {
  seed: CompareStock[];
  /** When embedded inside another surface (e.g. the dashboard tab), suppress the page header. */
  embedded?: boolean;
}

export default function CompareClient({ seed, embedded = false }: Props) {
  const [mode, setMode] = useState<CompareMode>("compare");
  const [selected, setSelected] = useState<string[]>([]);

  const { quotes } = useCompareQuotes(selected);
  const { enrichment, loading: enrichmentLoading } = useEnrichment(selected);

  function handleToggle(tikr: string) {
    setSelected((prev) => {
      if (prev.includes(tikr)) return prev.filter((t) => t !== tikr);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, tikr];
    });
  }

  function handleClear() {
    setSelected([]);
  }

  // Resolve selected CompareStock objects in selection order.
  const selectedStocks = selected
    .map((tikr) => seed.find((s) => s.tikr === tikr))
    .filter((s): s is CompareStock => s !== undefined);

  // computeScorecard is the ONLY source of risk-adjusted math — never inline.
  const rows = computeScorecard(selectedStocks, quotes);

  const hasSelected = selected.length > 0;

  return (
    <div className="cmp-page">
      {!embedded && (
        <header>
          <h1 className="cmp-page-title">Stock Comparison</h1>
          <p className="cmp-page-subtitle">
            Side-by-side risk-adjusted analysis — up to 4 stocks.
          </p>
        </header>
      )}

      <div className="cmp-mode-toggle" role="group" aria-label="Comparison mode">
        <button
          type="button"
          aria-pressed={mode === "compare"}
          onClick={() => setMode("compare")}
        >
          Stock Comparison
        </button>
        <button
          type="button"
          aria-pressed={mode === "scan"}
          onClick={() => setMode("scan")}
        >
          Sector Scan
        </button>
      </div>

      {mode === "compare" ? (
        <>
          <StockPicker
            stocks={seed}
            selected={selected}
            onToggle={handleToggle}
            onClear={handleClear}
          />

          {!hasSelected && <EmptyState />}

          {hasSelected && (
            <>
              <VerdictBanner rows={rows} stocks={selectedStocks} />

              <ScorecardGrid rows={rows} stocks={selectedStocks} />

              <FootballField stocks={selectedStocks} quotes={quotes} />

              <ComparisonTable
                rows={rows}
                stocks={selectedStocks}
                quotes={quotes}
                enrichment={enrichment}
                enrichmentLoading={enrichmentLoading}
              />

              <DetailTable
                rows={rows}
                stocks={selectedStocks}
                quotes={quotes}
                enrichment={enrichment}
                enrichmentLoading={enrichmentLoading}
              />
            </>
          )}
        </>
      ) : (
        <SectorScanView stocks={seed} quotes={quotes} />
      )}
    </div>
  );
}
