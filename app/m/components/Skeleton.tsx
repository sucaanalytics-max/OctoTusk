// Lightweight shimmer placeholders for client-fetched lists (notes, alerts).
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="m-cardlist" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="m-card m-card--static">
          <div className="m-skeleton" style={{ width: "55%", height: 14 }} />
          <div className="m-skeleton" style={{ width: "80%", height: 12, marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}
