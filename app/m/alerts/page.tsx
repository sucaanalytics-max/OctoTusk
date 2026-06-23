import { loadMobileStocks } from "@/lib/mobile/seed";
import AlertsClient from "./AlertsClient";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const stocks = await loadMobileStocks();
  return <AlertsClient stocks={stocks} />;
}
