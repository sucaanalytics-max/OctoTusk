"use client";
// Embeds the /research/compare experience inside another surface (e.g. the dashboard
// Comparison tab). Wraps it in the [data-compare-root] scope so compare.css applies and
// inherits the HOST theme (no data-theme override here). Seeds CompareClient from the
// host's raw snapshot stock rows. The frozen DashboardClient renders only <CompareEmbed/>,
// keeping all real logic in this isolated tree.

import { useMemo } from "react";
import { isRemovedStock } from "@/lib/removedStocks";
import { buildCompareStock, type RawSnapshotRow } from "@/lib/compare/buildCompareStock";
import CompareClient from "./CompareClient";
import "./compare.css";
// NOTE: the dashboard Comparison tab mounts this embed (not the standalone route's
// layout.tsx), so the redesign's stylesheet MUST be imported here too — otherwise the
// new picker/scorecard/verdict styles render unstyled on the tab.
import "./compare-additions.css";

interface Props {
  /** Raw snapshot stock rows from the host (e.g. the dashboard's `stocks` prop). */
  stocks: Array<Record<string, unknown> & { tikr: string }>;
}

export default function CompareEmbed({ stocks }: Props) {
  const seed = useMemo(
    () =>
      stocks
        .filter((s) => !isRemovedStock(s as { tikr?: string | null; official_name?: string | null }))
        .map((s) => buildCompareStock(s as unknown as RawSnapshotRow)),
    [stocks]
  );

  return (
    <div data-compare-root className="cmp-root cmp-embed">
      <CompareClient seed={seed} embedded />
    </div>
  );
}
