import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadFinancials } from "@/lib/mobile/financials";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Financials are public market data, but the route is still session-gated like /api/snapshot.
// no-store reinforces the public/sw.js rule that /api/* is never cached client-side — the
// financials cache lives ONLY in Supabase, never browser storage.
const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * GET /api/financials/[tikr]
 * Thin auth + HTTP wrapper over loadFinancials (the same seam the RSC page calls, so no logic
 * divergence). Cache-first / quota-safe behavior lives entirely in the seam.
 *
 * Status: 401 unauthenticated · 404 when the stock has no Trendlyne mapping (body still carries
 * meta) · 200 for everything else, INCLUDING not_found / in_progress / budget_exhausted — the
 * client branches on `meta.reason` rather than the status code.
 */
export async function GET(_req: Request, { params }: { params: { tikr: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const result = await loadFinancials(decodeURIComponent(params.tikr));
  const status = result.meta.reason === "no_symbol_mapping" ? 404 : 200;
  return NextResponse.json(result, { status, headers: NO_STORE });
}
