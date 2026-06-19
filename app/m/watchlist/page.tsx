import { loadMobileStocks } from "@/lib/mobile/seed";
import WatchlistClient from "./WatchlistClient";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const stocks = await loadMobileStocks();
  return <WatchlistClient stocks={stocks} />;
}
