"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-tusk-dark to-tusk-blue">
      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full mx-4 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-tusk-dark mb-2">Something went wrong</h2>
        <p className="text-gray-500 text-sm mb-4">{error.message || "An unexpected error occurred"}</p>
        <button
          onClick={reset}
          className="bg-tusk-dark hover:bg-tusk-blue text-white font-semibold py-2 px-6 rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
