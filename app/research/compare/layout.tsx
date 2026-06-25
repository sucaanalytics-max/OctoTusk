// Layout for /research/compare — auth-gated, light theme default, scoped root.
// Mirrors app/m/layout.tsx: auth() called here (not in middleware).
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import "./compare.css";

export const dynamic = "force-dynamic";

export default async function CompareLayout({ children }: { children: React.ReactNode }) {
  // Self-gate: middleware does NOT enforce page auth (see CLAUDE.md).
  let session = null;
  try {
    session = await auth();
  } catch {
    redirect("/");
  }
  if (!session?.user) redirect("/");

  // Light theme default (matches the existing dashboard aesthetic).
  // data-theme="light" makes the Dashboard token :root values apply explicitly;
  // data-compare-root is the CSS scope anchor for all .cmp-* classes.
  return (
    <div data-compare-root data-theme="light" className="cmp-root">
      {children}
    </div>
  );
}
