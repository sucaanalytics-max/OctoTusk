"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-lg w-full mx-4 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Dashboard Error</h2>
        <p className="text-gray-500 text-sm mb-2">{error.message || "An unexpected error occurred"}</p>
        {error.digest && <p className="text-gray-400 text-xs mb-4">Error ID: {error.digest}</p>}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-[#1a1a2e] hover:bg-[#0f3460] text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Try Again
          </button>
          <a
            href="/"
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}
