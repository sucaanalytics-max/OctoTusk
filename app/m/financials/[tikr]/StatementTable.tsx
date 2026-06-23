"use client";
import type { FinStatement, FinStatementKey } from "@/lib/mobile/financialsTypes";
import { fmtNum } from "@/lib/format";

const MONETARY: ReadonlySet<FinStatementKey> = new Set<FinStatementKey>([
  "pnl_annual",
  "pnl_quarterly",
  "balance_sheet",
  "cash_flow",
]);

/**
 * One statement → a horizontally-scrollable table. First column (row label) is sticky so the
 * header stays visible while periods scroll. Numbers are en-IN, tabular, right-aligned.
 */
export default function StatementTable({
  statement,
  statementKey,
  unit,
}: {
  statement: FinStatement;
  statementKey: FinStatementKey;
  unit?: string;
}) {
  const { periods, rows } = statement;
  const caption = MONETARY.has(statementKey) ? `₹ ${unit || "Cr"}` : "";

  return (
    <div className="m-fin-scroll" role="region" aria-label="financial statement" tabIndex={0}>
      <table className="m-fin-table">
        <thead>
          <tr>
            <th className="m-fin-rowhead" scope="col">{caption}</th>
            {periods.map((p) => (
              <th key={p} scope="col">{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key ?? r.label}>
              <th className="m-fin-rowhead" scope="row">{r.label}</th>
              {periods.map((p, i) => (
                <td key={p}>{fmtNum(r.values[i] ?? null)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
