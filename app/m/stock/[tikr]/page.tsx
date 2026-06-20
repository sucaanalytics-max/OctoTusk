import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { loadMobileStock } from "@/lib/mobile/seed";
import StockDetailClient from "./StockDetailClient";

export const dynamic = "force-dynamic";

export default async function StockDetailPage({ params }: { params: { tikr: string } }) {
  const [stock, session] = await Promise.all([
    loadMobileStock(decodeURIComponent(params.tikr)),
    auth(),
  ]);
  if (!stock) notFound();
  return <StockDetailClient stock={stock} userEmail={String(session?.user?.email ?? "")} />;
}
