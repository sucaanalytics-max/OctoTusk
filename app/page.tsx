import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  // Auth disabled (preview deployment) — go straight to dashboard
  if (process.env.AUTH_DISABLED === "true") {
    redirect("/dashboard");
  }

  let session = null;
  try {
    session = await auth();
  } catch {
    // Auth not configured yet — show login page anyway
  }

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--color-bg-primary) 0%, var(--color-bg-secondary) 50%, var(--color-bg-elevated) 100%)" }}>
      <div className="rounded-2xl p-10 max-w-md w-full mx-4 text-center" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-elevated)" }}>
        <div className="mb-6">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: "var(--color-accent-tusk)" }}>
            <span className="text-white text-2xl font-bold" style={{ fontFamily: "var(--font-sans)" }}>T</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>OctoTusk</h1>
          <p className="mt-2" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Portfolio Intelligence Platform</p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-3 login-btn"
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

        <p className="mt-6" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          Restricted to @tuskinvest.com accounts
        </p>
      </div>
    </div>
  );
}
