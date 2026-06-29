import MarketplaceClient from "./MarketplaceClient";

export const dynamic = "force-dynamic";

// Auth is inherited from app/m/layout.tsx — no re-auth needed here.
export default function MarketplacePage() {
  return <MarketplaceClient />;
}
