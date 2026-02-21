import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-tusk-dark to-tusk-blue">
      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full mx-4 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-tusk-dark rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">T</span>
          </div>
          <h1 className="text-2xl font-bold text-tusk-dark">Tusk Dashboard</h1>
          <p className="text-gray-500 mt-2 text-sm">Portfolio Intelligence Platform</p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full bg-tusk-dark hover:bg-tusk-blue text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
              <rect width="10" height="10" fill="#F25022" />
              <rect x="11" width="10" height="10" fill="#7FBA00" />
              <rect y="11" width="10" height="10" fill="#00A4EF" />
              <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
            </svg>
            Sign in with Microsoft
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-400">
          Restricted to @tuskinvest.com accounts
        </p>
      </div>
    </div>
  );
}
