import { notFound } from "next/navigation";
import { loadMobileStock } from "@/lib/mobile/seed";
import { loadFinancials } from "@/lib/mobile/financials";
import FinancialsDetailClient from "./FinancialsDetailClient";

export const dynamic = "force-dynamic";

// The RSC is the ONLY fetch path on first paint — the client renders from these props and never
// auto-refetches on mount, so a stock view triggers at most one upstream Trendlyne call.
export default async function FinancialsDetailPage({ params }: { params: { tikr: string } }) {
  const tikr = decodeURIComponent(params.tikr);
  const [stock, result] = await Promise.all([loadMobileStock(tikr), loadFinancials(tikr)]);
  if (!stock) notFound();
  return <FinancialsDetailClient stock={stock} result={result} />;
}
