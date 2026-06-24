"use client";
import { useState } from "react";
import Link from "next/link";
import type { MobileStock } from "@/lib/mobile/types";
import type { FinResult, FinStatementKey } from "@/lib/mobile/financialsTypes";
import { STATEMENT_ORDER, STATEMENT_LABEL } from "@/lib/mobile/financialsTypes";
import { getCompanyShort, cleanTikr } from "@/lib/companyName";
import StatementTable from "./StatementTable";

const EMPTY_COPY: Record<string, string> = {
  no_symbol_mapping: "No Trendlyne mapping for this stock yet. Add an override in lib/trendlyneSymbol.ts.",
  not_cached: "No financials loaded for this stock yet — push it from the Trendlyne sheet.",
  not_found: "Trendlyne has no financials for this symbol.",
  budget_exhausted: "Daily refresh limit reached — try again tomorrow.",
  in_progress: "Fetching financials… reload in a moment.",
  unconfigured: "Financials source isn’t configured yet.",
  fetch_failed: "Couldn’t load financials right now. Try again shortly.",
};

function fmtAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function FinancialsDetailClient({ stock, result }: { stock: MobileStock; result: FinResult }) {
  const { payload, meta } = result;
  const name = getCompanyShort({ official_name: stock.name, tikr: stock.tikr });

  const present: FinStatementKey[] = payload
    ? STATEMENT_ORDER.filter((k) => {
        const s = payload.statements[k];
        return !!s && (s.rows.length > 0 || s.periods.length > 0);
      })
    : [];
  const [active, setActive] = useState<FinStatementKey | null>(present[0] ?? null);
  const activeKey = active && present.includes(active) ? active : present[0] ?? null;

  const asOf = fmtAsOf(meta.fetchedAt);

  return (
    <div className="m-page m-detail">
      <header className="m-detailhead">
        <Link href="/m/financials" className="m-back" aria-label="Back to financials picker">
          ‹
        </Link>
        <div>
          <h1 className="m-title">{name}</h1>
          <p className="m-card-meta">
            {cleanTikr(stock.tikr)} · {stock.sector}
            {meta.symbol ? ` · ${meta.symbol}` : ""}
          </p>
        </div>
      </header>

      <div className="m-fin-statusbar">
        {asOf && <span className="m-fin-asof">As of {asOf}</span>}
        {meta.stale && payload && <span className="m-fin-chip is-stale">Stale</span>}
        {!meta.stale && payload && <span className="m-fin-chip is-fresh">Live</span>}
        {payload && (
          <a
            className="m-fin-dl"
            href={`/api/financials/${encodeURIComponent(stock.tikr)}/export`}
            aria-label="Download financials as Excel"
          >
            ⬇ Excel
          </a>
        )}
      </div>

      {!payload || present.length === 0 ? (
        <p className="m-empty">{EMPTY_COPY[meta.reason ?? ""] ?? "No financials available."}</p>
      ) : (
        <>
          <div className="m-fin-tabs" role="tablist" aria-label="Statements">
            {present.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={k === activeKey}
                className={`m-fin-tab ${k === activeKey ? "is-active" : ""}`}
                onClick={() => setActive(k)}
              >
                {STATEMENT_LABEL[k]}
              </button>
            ))}
          </div>

          {activeKey && payload.statements[activeKey] && (
            <StatementTable
              statement={payload.statements[activeKey]!}
              statementKey={activeKey}
              unit={payload.unit}
            />
          )}
        </>
      )}

      <p className="m-count">Source: Trendlyne{payload?.name ? ` · ${payload.name}` : ""}</p>
    </div>
  );
}
