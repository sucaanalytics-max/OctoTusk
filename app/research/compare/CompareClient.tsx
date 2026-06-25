"use client";
// Composition root for /research/compare.
// Owns selection state; composes all presentational components.

import { useState } from "react";
import { computeScorecard } from "@/lib/compare/riskAdjusted";
import { useCompareQuotes } from "@/lib/compare/useCompareQuotes";
import { useEnrichment } from "@/lib/compare/useEnrichment";
import type { CompareStock } from "@/lib/compare/types";
import StockPicker from "./StockPicker";
import VerdictBanner from "./VerdictBanner";
import ScorecardGrid from "./ScorecardGrid";
import FootballField from "./FootballField";
import ValuationGauges from "./ValuationGauges";
import InternalVsStreet from "./InternalVsStreet";
import DetailTable from "./DetailTable";
import EmptyState from "./EmptyState";

const MAX_SELECTED = 4;

interface Props {
  seed: CompareStock[];
}

export default function CompareClient({ seed }: Props) {
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
      <header>
        <h1 className="cmp-page-title">Stock Comparison</h1>
        <p className="cmp-page-subtitle">
          Side-by-side risk-adjusted analysis — up to 4 stocks.
        </p>
      </header>

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

          <ValuationGauges
            stocks={selectedStocks}
            quotes={quotes}
            enrichment={enrichment}
          />

          <InternalVsStreet
            stocks={selectedStocks}
            quotes={quotes}
            enrichment={enrichment}
            enrichmentLoading={enrichmentLoading}
          />

          <DetailTable
            stocks={selectedStocks}
            quotes={quotes}
            enrichment={enrichment}
            enrichmentLoading={enrichmentLoading}
          />
        </>
      )}
    </div>
  );
}
