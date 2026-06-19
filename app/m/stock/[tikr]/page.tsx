import { notFound } from "next/navigation";
import { loadMobileStock } from "@/lib/mobile/seed";
import StockDetailClient from "./StockDetailClient";

export const dynamic = "force-dynamic";

export default async function StockDetailPage({ params }: { params: { tikr: string } }) {
  const stock = await loadMobileStock(decodeURIComponent(params.tikr));
  if (!stock) notFound();
  return <StockDetailClient stock={stock} />;
}
