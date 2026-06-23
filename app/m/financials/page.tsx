import { loadMobileStocks } from "@/lib/mobile/seed";
import FinancialsPickerClient from "./FinancialsPickerClient";

export const dynamic = "force-dynamic";

// Auth is enforced by app/m/layout.tsx. This page only seeds the (non-sensitive) stock universe.
export default async function FinancialsPickerPage() {
  const stocks = await loadMobileStocks();
  return <FinancialsPickerClient stocks={stocks} />;
}
