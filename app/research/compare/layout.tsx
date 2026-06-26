// Layout for /research/compare — auth-gated, scoped root.
// Mirrors app/m/layout.tsx: auth() called here (not in middleware).
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import ThemeController from "./ThemeController";
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

  // SSR default = dark (the premium liquid-glass mode). ThemeController applies a stored "light"
  // preference AFTER mount (hydration-safe). data-compare-root is the CSS scope anchor; #cmp-root
  // is the element ThemeController retargets.
  return (
    <div id="cmp-root" data-compare-root data-theme="dark" className="cmp-root">
      <ThemeController />
      {children}
    </div>
  );
}
