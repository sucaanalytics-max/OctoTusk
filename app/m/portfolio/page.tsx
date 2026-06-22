import { loadMobileStocks } from "@/lib/mobile/seed";
import PortfolioClient from "./PortfolioClient";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  // Seed the stock universe (non-sensitive) for holding→tikr resolution + scenario prices.
  // Holdings themselves arrive only after the PIN unlock, client-side via /api/holdings.
  const stocks = await loadMobileStocks();
  return <PortfolioClient stocks={stocks} />;
}
